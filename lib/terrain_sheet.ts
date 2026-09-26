// Terrain sheets: water and lava drawn as one map-sized image per floor instead of a
// square texture stamped on every tile.
//
// The problem: each water/lava tile painted its 32x32 texture edge to edge, so a pool's
// shore ran in dead-straight lines along the tile edges and shallow met deep in hard
// square steps.
//
// The fix follows the generated floor sheets (lib/floor_sheet.ts): one image covers the
// whole map, and every tile draws its own cell of it by map position, so neighbouring
// tiles show neighbouring pieces of one continuous picture. This image depends on the map,
// so it is built when the floor loads. It stays in the game's pixel-art style: pools keep
// the classic textures (lib/terrain_textures.ts) at their 32-pixels-a-tile scale, and
// their shapes stay square with a little stepped variation:
//
//   1. Each tile gets a value (1 = water, 0 = land). Only within a thin band either side of
//      a tile edge (cornerPx) do neighbouring values blend, so the 0.5 contour sits on the
//      tile edges and a convex corner is rounded over just a few pixels.
//   2. Each edge is pushed in or out by a slow, smooth wave (wobblePx over wobbleTiles),
//      so the shoreline drifts a pixel or two off the tile edge: long straight runs with
//      the odd one-pixel step. Past the band every pixel keeps its tile's class, so a
//      water tile always reads as water and a land tile as land.
//   3. Walls, hazards and the other terrain are "don't care": a pixel's field treats them
//      as its own tile's value, so water meets a wall along the wall's edge instead of
//      shrinking away from it, and never leaks through a wall onto the floor beyond.
//
// Pixels are classified hard (no antialiasing) and drawn with nearest-neighbour scaling;
// the details are one- and two-pixel bands worked out from those classes: a bank shadow
// below the top shore, a damp margin on the floor, a stepped ledge where shallow drops to
// deep, and an optional muted rim. Deep water uses the same machinery with its own noise.
// Lava is the exception: a molten surface is generated across the pool from noise and
// drawn soft, with rounder edges, a darker crust rim, a glowing seam and a heat glow.
//
// Every knob is in TerrainShapeConfig (tuned on /test-water-edges). Everything here is pure
// and deterministic (same map and settings, same image); the PNG encoder is a store-only
// one so the image can be made synchronously, without a canvas.

import { FLOOR, TileSubtype } from "./map/constants";
import { DEEP_TEXTURE, SHALLOW_TEXTURE, type TerrainTexture } from "./terrain_textures";

/**
 * Image pixels per map tile: the classic terrain textures' own resolution, so a sheet
 * pixel is a texture pixel (each spans 1.25 CSS px of a 40px tile).
 */
export const TERRAIN_PX = 32;

// Per-tile classes. DONT_CARE takes the value of whichever tile a pixel is in.
const DONT_CARE = -1;
const LAND = 0;
const SHALLOW = 1;
const DEEP = 2;
const LAVA = 1;

export interface TerrainGrid {
  rows: number;
  cols: number;
  /** DONT_CARE / LAND / SHALLOW / DEEP per tile, row-major. */
  water: Int8Array;
  /** DONT_CARE / LAND / LAVA per tile, row-major. */
  lava: Int8Array;
  hasWater: boolean;
  hasLava: boolean;
  /** Changes whenever the image would; use it as a memo key. */
  signature: string;
}

// Only plain floor draws terrain layers (flower and tree tiles render through their own
// branches), so only plain floor can carry a shore.
function isOpenGround(tile: number): boolean {
  return tile === FLOOR;
}

// Floor tiles that are holes or beds rather than ground a shore can creep over.
const GROUND_HAZARDS = [
  TileSubtype.OPEN_ABYSS,
  TileSubtype.DARKNESS,
  TileSubtype.SPIKES,
  TileSubtype.SPIKE_HOLES,
];

/** Classify every tile for the water and lava fields. */
export function buildTerrainGrid(
  tiles: number[][],
  subtypes: number[][][] | undefined
): TerrainGrid {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const water = new Int8Array(rows * cols);
  const lava = new Int8Array(rows * cols);
  let hasWater = false;
  let hasLava = false;
  const sig: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const st = subtypes?.[r]?.[c] ?? [];
      let w: number;
      let l: number;
      let code: string;
      if (!isOpenGround(tiles[r][c]) || GROUND_HAZARDS.some((h) => st.includes(h))) {
        w = DONT_CARE;
        l = DONT_CARE;
        code = "#";
      } else if (st.includes(TileSubtype.LAVA)) {
        w = DONT_CARE;
        l = LAVA;
        hasLava = true;
        code = "L";
      } else if (st.includes(TileSubtype.OBSIDIAN)) {
        // A cooled slab sitting in the pool: lava meets its edge squarely.
        w = DONT_CARE;
        l = DONT_CARE;
        code = "O";
      } else if (st.includes(TileSubtype.DEEP_WATER) || st.includes(TileSubtype.STEPPING_STONE)) {
        w = DEEP;
        l = DONT_CARE;
        hasWater = true;
        code = "D";
      } else if (st.includes(TileSubtype.SHALLOW_WATER)) {
        w = SHALLOW;
        l = DONT_CARE;
        hasWater = true;
        code = "S";
      } else {
        w = LAND;
        l = LAND;
        code = ".";
      }
      water[i] = w;
      lava[i] = l;
      sig.push(code);
    }
  }
  return { rows, cols, water, lava, hasWater, hasLava, signature: `${cols}:${sig.join("")}` };
}

/**
 * Tiles that draw a family's layer: the family's own tiles plus any open-ground tile
 * touching one (the shore can bulge onto it, and it carries the wet margin / heat glow).
 * Keys are "row,col".
 */
export function terrainLayerTiles(grid: TerrainGrid, family: "water" | "lava"): Set<string> {
  const field = family === "water" ? grid.water : grid.lava;
  const isFamily = (r: number, c: number) =>
    r >= 0 && r < grid.rows && c >= 0 && c < grid.cols && field[r * grid.cols + c] > LAND;
  const out = new Set<string>();
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const v = field[r * grid.cols + c];
      if (v === DONT_CARE) continue;
      let near = v > LAND;
      for (let dr = -1; dr <= 1 && !near; dr++) {
        for (let dc = -1; dc <= 1 && !near; dc++) {
          if (isFamily(r + dr, c + dc)) near = true;
        }
      }
      if (near) out.add(`${r},${c}`);
    }
  }
  return out;
}

// --- noise ------------------------------------------------------------------------

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 144269504);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const fade = (t: number) => t * t * (3 - 2 * t);

function valueNoise(u: number, v: number, seed: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const sx = fade(u - x0);
  const sy = fade(v - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}


/** Three octaves of value noise in tile units, roughly -1..1 (lava's wandering edge and veins). */
function fbm(u: number, v: number, seed: number): number {
  return (
    0.58 * valueNoise(u * 1.1, v * 1.1, seed) +
    0.28 * valueNoise(u * 2.4 + 5.2, v * 2.4 + 1.3, seed + 1) +
    0.14 * valueNoise(u * 5.1 + 9.1, v * 5.1 + 3.7, seed + 2)
  );
}

// --- shape settings ---------------------------------------------------------------

/**
 * How water's surface is filled: "texture" tiles the classic 32x32 pixel-art water drawn
 * crisp; "procedural" generates the surface across the pool from noise (drift, broken
 * ripple streaks, a soft depth gradient) and is drawn smooth, like lava.
 */
export type WaterStyle = "texture" | "procedural";

/** Every knob of a sheet's look; tuned on /test-water-edges. Pixels are sheet pixels. */
export interface TerrainShapeConfig {
  waterStyle: WaterStyle;
  /** Half-width of the band either side of a tile edge where neighbours blend: sets how
   *  far a convex corner is rounded or bevelled (px). */
  cornerPx: number;
  /** How far the shoreline drifts off the tile edge, at most (px). */
  wobblePx: number;
  /** Length of one drift of the shoreline (tiles): longer is smoother. */
  wobbleTiles: number;
  /** The same drift for the shallow-to-deep boundary (px). */
  deepWobblePx: number;
  /** Width of the stepped ledge on each side of the shallow-to-deep boundary (px). */
  ledgePx: number;
  /** Width of the bank shadow on the water below its top shore or a wall (px, 0 = none). */
  bankPx: number;
  /** Darkness of the bank shadow where it starts (0-1). */
  bank: number;
  /** Width of the rim line along the waterline (px, 0 = none). */
  foamPx: number;
  /** Strength of the rim line (0-1, 0 = none). */
  foam: number;
  /** Width of the damp margin on the floor outside the water (px, 0 = none). */
  wetPx: number;
  /** Reach of lava's heat glow on the floor around it (px, 0 = none). */
  heatPx: number;
  /** Lava's corner rounding (px); lava is drawn soft, so it can round far more than water. */
  lavaCornerPx: number;
  /** How far lava's edge wanders, in field units (0.28 is a few pixels). */
  lavaWobble: number;
}

// Tuned on /test-water-edges (2026-09-25): procedural water with softly rounded pools
// whose shore drifts a pixel or two, a soft two-pixel depth blend, a faint muted rim, a
// wide damp margin and a bank shadow. Lava keeps the soft, rounded, procedurally veined
// look of the first sheet version, which read better for a molten surface than the
// repeated crust tile.
export const DEFAULT_TERRAIN_SHAPE: TerrainShapeConfig = {
  waterStyle: "procedural",
  cornerPx: 12,
  wobblePx: 1.6,
  wobbleTiles: 1,
  deepWobblePx: 2.1,
  ledgePx: 2,
  bankPx: 4,
  bank: 0.3,
  foamPx: 2,
  foam: 0.4,
  wetPx: 4,
  heatPx: 5,
  lavaCornerPx: 16,
  lavaWobble: 0.28,
};

// --- the field --------------------------------------------------------------------

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The blended field at (u, v) in tile units. Neighbouring tile values only blend within
 * `blend` tiles either side of a tile edge, so the 0.5 contour sits on the edges and a
 * convex corner is rounded over about that distance. `valueOf(class)` maps a tile class
 * to 0-1; don't-care tiles (and the map's outside) take the pixel's own tile value.
 */
function fieldAt(
  classes: Int8Array,
  rows: number,
  cols: number,
  u: number,
  v: number,
  own: number,
  valueOf: (cls: number) => number,
  blend: number
): number {
  const b = Math.min(0.5, Math.max(0.001, blend));
  const weight = (f: number) => smoothstep(0.5 - b, 0.5 + b, f);
  const gy = v - 0.5;
  const gx = u - 0.5;
  const i0 = Math.floor(gy);
  const j0 = Math.floor(gx);
  const sy = weight(gy - i0);
  const sx = weight(gx - j0);
  const at = (i: number, j: number) => {
    if (i < 0 || i >= rows || j < 0 || j >= cols) return own;
    const cls = classes[i * cols + j];
    return cls === DONT_CARE ? own : valueOf(cls);
  };
  const a = at(i0, j0);
  const bb = at(i0, j0 + 1);
  const c = at(i0 + 1, j0);
  const d = at(i0 + 1, j0 + 1);
  const top = a + (bb - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Where to sample the field for the pixel at (u, v): pushed across each nearby tile edge
 * by a slow, smooth wave that runs along that edge. That moves the contour by exactly the
 * push, so the shoreline drifts a pixel or two off the tile edge over a tile or so; with
 * pixels classified hard, that reads as long straight runs with the odd one-pixel step.
 * Each edge line has its own wave. Tile centres are never reached (the push is a few
 * pixels at most), so a tile always keeps its class in the middle.
 */
function warp(
  u: number,
  v: number,
  amplitudePx: number,
  lengthTiles: number,
  seed: number
): [number, number] {
  if (amplitudePx <= 0) return [u, v];
  const amp = amplitudePx / TERRAIN_PX;
  const freq = 1 / Math.max(0.1, lengthTiles);
  const hLine = Math.round(v);
  const vLine = Math.round(u);
  // Value noise peaks around +-0.8; scale so the drift reaches about amplitudePx.
  const dv = 1.25 * amp * valueNoise(u * freq, hLine * 13.7, seed);
  const du = 1.25 * amp * valueNoise(v * freq, vLine * 13.7 + 5.5, seed + 3);
  return [u + du, v + dv];
}

const isWater = (cls: number) => (cls >= SHALLOW ? 1 : 0);
const isDeep = (cls: number) => (cls === DEEP ? 1 : 0);
const isLava = (cls: number) => (cls === LAVA ? 1 : 0);

function waterAt(grid: TerrainGrid, u: number, v: number, own: number, cfg: TerrainShapeConfig): boolean {
  const [wu, wv] = warp(u, v, cfg.wobblePx, cfg.wobbleTiles, 11);
  return (
    fieldAt(grid.water, grid.rows, grid.cols, wu, wv, isWater(own), isWater, cfg.cornerPx / TERRAIN_PX) >=
    0.5
  );
}

/** Whether a point is drawn as water: 1 or 0 (pixels are classified hard). */
export function waterCoverageAt(
  grid: TerrainGrid,
  u: number,
  v: number,
  cfg: TerrainShapeConfig = DEFAULT_TERRAIN_SHAPE
): number {
  const r = Math.floor(v);
  const c = Math.floor(u);
  if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) return 0;
  const cls = grid.water[r * grid.cols + c];
  if (cls === DONT_CARE) return 0;
  return waterAt(grid, u, v, cls, cfg) ? 1 : 0;
}

// --- painting ---------------------------------------------------------------------

type RGB = readonly [number, number, number];
const mix = (a: RGB, b: RGB, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function texel(tex: TerrainTexture, x: number, y: number): RGB {
  const n = tex.size;
  const ch = tex.rows[((y % n) + n) % n].charCodeAt(((x % n) + n) % n);
  return tex.palette[ch <= 57 ? ch - 48 : ch - 87];
}

// The rim line, when used: a muted, lighter water tone rather than white surf.
const FOAM_RGB: RGB = [92, 138, 158];
// The procedural water's rim sits on darker water, so it is darker too.
const P_FOAM_RGB: RGB = [76, 112, 130];
// Procedural water, kept inside the cave's value range the way the actors are: the
// classic shallow tone about a fifth darker and a little greyer (at full strength it was
// the brightest thing in the room after the lava, and read as glowing), deep pulled down
// with it so the two tiers stay easy to tell apart, and a lighter shore tone where the
// bottom shows through.
const P_SHALLOW_RGB: RGB = [40, 74, 98];
const P_DEEP_RGB: RGB = [20, 54, 88];
const P_SHORE_RGB: RGB = [58, 94, 116];
const P_RIPPLE_RGB: RGB = [96, 150, 180];
const WET_RGB: RGB = [8, 18, 20];
const SEAM_RGB: RGB = [226, 104, 28];
// Procedural lava: a low-key crust with molten seams and the odd hot spot.
const CRUST_RGB: RGB = [78, 22, 6];
const MOLTEN_RGB: RGB = [160, 52, 11];
const HOT_RGB: RGB = [232, 128, 40];
const HEAT_RGB: RGB = [255, 100, 25];
// Peak opacity of the damp margin and the heat glow (at the waterline / lava edge).
const WET_ALPHA = 0.34;
const HEAT_ALPHA = 0.22;

export interface TerrainImage {
  width: number;
  height: number;
  /** Straight (not premultiplied) RGBA. */
  rgba: Uint8ClampedArray;
  /**
   * Water only: opaque exactly where there is water (none on the damp margin). What the
   * animated wave marks are masked to, so they never draw over the wet floor.
   */
  coverage?: Uint8ClampedArray;
}

// Pixel classes shared by both images: 0 = not drawn (walls, tiles away from the pool),
// 1 = open ground, 2 = pool (shallow water / lava), 3 = deep water.
const PX_NONE = 0;
const PX_LAND = 1;
const PX_POOL = 2;
const PX_DEEP = 3;

/**
 * Classify every pixel of the tiles that draw the layer. `classify(u, v, tileIndex)`
 * returns PX_LAND / PX_POOL / PX_DEEP for a pixel in a layer tile.
 */
function classifyPixels(
  grid: TerrainGrid,
  layerTiles: Set<string>,
  classify: (u: number, v: number, i: number) => number
): Uint8Array {
  const width = grid.cols * TERRAIN_PX;
  const out = new Uint8Array(width * grid.rows * TERRAIN_PX);
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (!layerTiles.has(`${r},${c}`)) continue;
      const i = r * grid.cols + c;
      for (let py = 0; py < TERRAIN_PX; py++) {
        const y = r * TERRAIN_PX + py;
        const v = (y + 0.5) / TERRAIN_PX;
        for (let px = 0; px < TERRAIN_PX; px++) {
          const x = c * TERRAIN_PX + px;
          out[y * width + x] = classify((x + 0.5) / TERRAIN_PX, v, i);
        }
      }
    }
  }
  return out;
}

/**
 * Chessboard distance (in pixels, capped at `cap`) from every pixel to the nearest pixel
 * for which `isTarget` holds; a two-pass sweep, so it is linear in the image size.
 */
function distanceTo(
  classes: Uint8Array,
  width: number,
  height: number,
  isTarget: (cls: number) => boolean,
  cap: number
): Uint8Array {
  const limit = Math.min(255, Math.max(1, Math.ceil(cap)));
  const d = new Uint8Array(classes.length);
  for (let i = 0; i < classes.length; i++) d[i] = isTarget(classes[i]) ? 0 : limit;
  const relax = (i: number, j: number) => {
    if (d[j] + 1 < d[i]) d[i] = d[j] + 1;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) relax(i, i - 1);
      if (y > 0) {
        relax(i, i - width);
        if (x > 0) relax(i, i - width - 1);
        if (x < width - 1) relax(i, i - width + 1);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) relax(i, i + 1);
      if (y < height - 1) {
        relax(i, i + width);
        if (x < width - 1) relax(i, i + width + 1);
        if (x > 0) relax(i, i + width - 1);
      }
    }
  }
  return d;
}

function put(rgba: Uint8ClampedArray, i: number, c: RGB, a: number) {
  const o = i * 4;
  rgba[o] = c[0];
  rgba[o + 1] = c[1];
  rgba[o + 2] = c[2];
  rgba[o + 3] = Math.round(a * 255);
}

// Opacity of a band that fades out over `width` pixels, stepped per pixel (d = 1 is the
// pixel right at the edge).
const bandAlpha = (peak: number, d: number, width: number) =>
  d >= 1 && d <= width ? peak * (1 - (d - 1) / Math.max(1, Math.ceil(width))) : 0;

/**
 * One pixel of procedural water. The surface is generated in world space, so it runs
 * continuously across tiles and never repeats per tile: a broad light/dark drift, faint
 * ripple streaks broken into dashes, shallows that lighten where the bottom shows near
 * the shore, and a soft blend (over `ledgeBand` px each side) where shallow drops to deep.
 * The motion comes from the animated wave marks each water tile mounts on top.
 */
function proceduralWater(
  cls: number,
  x: number,
  y: number,
  toDeep: number,
  toShallow: number,
  toLand: number,
  ledgeBand: number,
  shoreLightPx: number
): RGB {
  const u = (x + 0.5) / TERRAIN_PX;
  const v = (y + 0.5) / TERRAIN_PX;
  // 0 = shallow, 1 = deep, blended across the boundary.
  const depth =
    cls === PX_DEEP
      ? 1 - 0.5 * Math.max(0, 1 - (toShallow - 1) / ledgeBand)
      : 0.5 * Math.max(0, 1 - (toDeep - 1) / ledgeBand);
  let col = mix(P_SHALLOW_RGB, P_DEEP_RGB, depth);
  // Shallows lighten over the last few pixels before the shore.
  const shore = Math.max(0, 1 - (toLand - 1) / shoreLightPx) * (1 - depth);
  col = mix(col, P_SHORE_RGB, 0.45 * shore);
  // Broad drift, a few percent lighter and darker.
  const drift = 1 + 0.07 * valueNoise(u * 0.8 + 3.3, v * 0.8 + 8.1, 31);
  col = [col[0] * drift, col[1] * drift, col[2] * drift];
  // Ripple streaks: thin ridges of noise stretched sideways (seven rows a tile, gently
  // warped so they aren't ruled lines), broken into dashes by a second noise. Static: an
  // attempt to drift them across the pool read as mist, not water.
  const bend = 0.35 * valueNoise(u * 0.9 + 1.7, v * 1.3 + 4.2, 71);
  const ridge = 1 - Math.abs(valueNoise(u * 1.6 + 9.9, (v + bend) * 7, 61));
  const dashes = smoothstep(0.05, 0.45, valueNoise(u * 2.6 + 2.2, v * 3.1 + 6.6, 67));
  const ripple = Math.pow(ridge, 12) * dashes;
  return mix(col, P_RIPPLE_RGB, ripple * (0.55 - 0.3 * depth));
}

/** The floor's water image: the classic shallow and deep textures in organic-edged pools. */
export function renderWaterImage(
  grid: TerrainGrid,
  cfg: TerrainShapeConfig = DEFAULT_TERRAIN_SHAPE
): TerrainImage {
  const width = grid.cols * TERRAIN_PX;
  const height = grid.rows * TERRAIN_PX;
  const blend = cfg.cornerPx / TERRAIN_PX;
  const classes = classifyPixels(grid, terrainLayerTiles(grid, "water"), (u, v, i) => {
    const own = grid.water[i];
    if (!waterAt(grid, u, v, own, cfg)) return PX_LAND;
    const [du, dv] = warp(u, v, cfg.deepWobblePx, cfg.wobbleTiles, 23);
    const deep = fieldAt(grid.water, grid.rows, grid.cols, du, dv, isDeep(own), isDeep, blend) >= 0.5;
    return deep ? PX_DEEP : PX_POOL;
  });
  const procedural = cfg.waterStyle === "procedural";
  // Procedural depth blends over twice the ledge width, and its shallows lighten over the
  // last few pixels before the shore, so it needs longer distances than the texture does.
  const ledgeBand = procedural ? Math.max(1, cfg.ledgePx * 2) : cfg.ledgePx;
  const SHORE_LIGHT_PX = 4;
  const band = Math.max(cfg.wetPx, cfg.foamPx, ledgeBand, procedural ? SHORE_LIGHT_PX : 0) + 1;
  const toWater = distanceTo(classes, width, height, (c) => c >= PX_POOL, band);
  const toLand = distanceTo(classes, width, height, (c) => c === PX_LAND, band);
  const toDeep = distanceTo(classes, width, height, (c) => c === PX_DEEP, band);
  const toShallow = distanceTo(classes, width, height, (c) => c === PX_POOL, band);
  // Bank shadow: how far each water pixel is below the last non-water pixel straight above
  // it (the floor's lip, or a wall). The pool's surface sits lower than the floor, so in
  // the 3/4 view its top shore throws a short shadow down onto the water, the same way a
  // wall shades the floor below it.
  const belowBank = new Uint8Array(classes.length);
  for (let i = 0; i < classes.length; i++) {
    if (classes[i] < PX_POOL) continue;
    const above = i >= width ? i - width : -1;
    belowBank[i] = above < 0 || classes[above] < PX_POOL ? 1 : Math.min(255, belowBank[above] + 1);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    if (cls === PX_NONE) continue;
    if (cls === PX_LAND) {
      const a = bandAlpha(WET_ALPHA, toWater[i], cfg.wetPx);
      if (a > 0) put(rgba, i, WET_RGB, a);
      continue;
    }
    const x = i % width;
    const y = (i - x) / width;
    let col: RGB;
    if (procedural) {
      col = proceduralWater(cls, x, y, toDeep[i], toShallow[i], toLand[i], ledgeBand, SHORE_LIGHT_PX);
      // Rim along the shore, if any, fading across its width.
      if (cfg.foam > 0) {
        const rim = bandAlpha(cfg.foam, toLand[i], cfg.foamPx);
        if (rim > 0) col = mix(col, P_FOAM_RGB, rim);
      }
    } else {
      const shallow = texel(SHALLOW_TEXTURE, x, y);
      const deep = texel(DEEP_TEXTURE, x, y);
      if (cls === PX_DEEP) {
        // The deep side of the drop-off catches a little light.
        col = toShallow[i] <= cfg.ledgePx ? mix(deep, shallow, 0.3) : deep;
      } else {
        // A stepped ledge where shallow shelves off into deep.
        col = toDeep[i] <= cfg.ledgePx ? mix(shallow, deep, 0.55) : shallow;
      }
      // Rim along the shore, if any (never against a wall: walls aren't land here).
      if (cfg.foam > 0 && toLand[i] <= cfg.foamPx) col = mix(col, FOAM_RGB, cfg.foam);
    }
    const shadow = bandAlpha(cfg.bank, belowBank[i], cfg.bankPx);
    if (shadow > 0) col = mix(col, [0, 0, 0], shadow);
    put(rgba, i, col, 1);
  }
  const coverage = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < classes.length; i++) {
    if (classes[i] >= PX_POOL) coverage[i * 4 + 3] = 255;
  }
  return { width, height, rgba, coverage };
}

/**
 * The floor's lava image: a molten surface generated across the whole pool (crust, seams
 * and hot spots from noise, so it never repeats per tile), with soft rounded edges that
 * crust over darker, a glowing seam right at the edge, and a heat glow on the floor. Drawn
 * with smooth scaling (see .terrainSheetSmooth), unlike the pixel-crisp water.
 */
export function renderLavaImage(
  grid: TerrainGrid,
  cfg: TerrainShapeConfig = DEFAULT_TERRAIN_SHAPE
): TerrainImage {
  const width = grid.cols * TERRAIN_PX;
  const height = grid.rows * TERRAIN_PX;
  const blend = cfg.lavaCornerPx / TERRAIN_PX;
  const layer = terrainLayerTiles(grid, "lava");
  // Antialiased edge half-width in field units: about one pixel at the edge's steepness.
  const edge = Math.min(0.12, 0.75 / (TERRAIN_PX * Math.max(0.02, blend * 2)));
  const heatReach = Math.max(0, cfg.heatPx) / TERRAIN_PX;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (!layer.has(`${r},${c}`)) continue;
      const own = isLava(grid.lava[r * grid.cols + c]);
      for (let py = 0; py < TERRAIN_PX; py++) {
        const y = r * TERRAIN_PX + py;
        const v = (y + 0.5) / TERRAIN_PX;
        for (let px = 0; px < TERRAIN_PX; px++) {
          const x = c * TERRAIN_PX + px;
          const u = (x + 0.5) / TERRAIN_PX;
          const l =
            fieldAt(grid.lava, grid.rows, grid.cols, u, v, own, isLava, blend) +
            cfg.lavaWobble * fbm(u + 71.7, v + 19.9, 41);
          const cover = smoothstep(0.5 - edge, 0.5 + edge, l);
          // Heat glow on the floor, reaching about heatPx past the edge.
          const heatStart = 0.5 - Math.max(0.001, heatReach * 1.5);
          const heat = (1 - cover) * Math.pow(smoothstep(heatStart, 0.5, l), 1.6);
          const i = y * width + x;
          if (cover <= 0.001) {
            if (heat > 0) put(rgba, i, HEAT_RGB, HEAT_ALPHA * heat);
            continue;
          }
          const vein = 1 - Math.abs(fbm(u * 1.6 + 4.4, v * 1.6 + 2.2, 53));
          let col = mix(CRUST_RGB, MOLTEN_RGB, Math.pow(vein, 4) * 0.9);
          if (vein > 0.9) col = mix(col, HOT_RGB, ((vein - 0.9) / 0.1) * 0.55);
          // The rim crusts over darker, with a thin glowing seam right at the edge.
          const nearEdge = 1 - smoothstep(0.5, 0.72, l);
          col = mix(col, [0, 0, 0], 0.35 * nearEdge);
          const seam = 1 - smoothstep(0.51, 0.58, l);
          col = mix(col, SEAM_RGB, 0.5 * seam);
          // Composite over the heat glow the edge fades into.
          const heatA = HEAT_ALPHA * heat;
          const outA = cover + heatA * (1 - cover);
          const blendCh = (cl: number, ch: number) =>
            outA > 0 ? (cl * cover + ch * heatA * (1 - cover)) / outA : 0;
          put(
            rgba,
            i,
            [blendCh(col[0], HEAT_RGB[0]), blendCh(col[1], HEAT_RGB[1]), blendCh(col[2], HEAT_RGB[2])],
            outA
          );
        }
      }
    }
  }
  return { width, height, rgba };
}

// --- PNG encoding -----------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A valid RGBA PNG with stored (uncompressed) deflate blocks. Bigger than a compressed
 * one, but it is built in memory once per floor and never sent over the network, and
 * it needs no canvas and no async step.
 */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const rowLen = width * 4 + 1; // filter byte + pixels
  const raw = new Uint8Array(rowLen * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * rowLen + 1);
  }
  // zlib stream: header, stored blocks of <= 65535 bytes, adler32.
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let zp = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    zlib[zp++] = b === blocks - 1 ? 1 : 0;
    zlib[zp++] = len & 0xff;
    zlib[zp++] = len >>> 8;
    zlib[zp++] = ~len & 0xff;
    zlib[zp++] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(start, start + len), zp);
    zp += len;
  }
  let a = 1;
  let bSum = 0;
  for (let i = 0; i < raw.length; i++) {
    a = (a + raw[i]) % 65521;
    bSum = (bSum + a) % 65521;
  }
  const adler = ((bSum << 16) | a) >>> 0;
  zlib[zp++] = adler >>> 24;
  zlib[zp++] = (adler >>> 16) & 0xff;
  zlib[zp++] = (adler >>> 8) & 0xff;
  zlib[zp++] = adler & 0xff;

  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    png.set(part, p);
    p += part.length;
  }
  return png;
}

// --- per-tile sampling --------------------------------------------------------------

/** A built sheet: its object URL and the map size it covers. */
export interface TerrainSheetRef {
  url: string;
  rows: number;
  cols: number;
  /** Draw with smooth scaling (procedural surfaces) rather than pixel-crisp (textures). */
  smooth: boolean;
  /** Water only: a mask of just the water (no damp margin), for the wave marks. */
  maskUrl?: string;
}

/**
 * CSS placing a tile's cell of a map-sized sheet in the tile box (as a background or a
 * mask). With the image n times the box, position p% puts the image's p% point on the
 * box's p% point, so cell k of n sits at k / (n - 1).
 */
export function sheetCellPosition(ref: TerrainSheetRef, row: number, col: number): {
  size: string;
  position: string;
} {
  const pos = (k: number, n: number) => (n > 1 ? `${(k / (n - 1)) * 100}%` : "0%");
  return {
    size: `${ref.cols * 100}% ${ref.rows * 100}%`,
    position: `${pos(col, ref.cols)} ${pos(row, ref.rows)}`,
  };
}

// --- building sheets in the browser ----------------------------------------------------

export type TerrainStyle = "sheet" | "classic";

/** Parse the `?terrain=` URL flag; null when it names neither style (keep the default). */
export function parseTerrainStyle(value: string | null | undefined): TerrainStyle | null {
  if (value === "sheet") return "sheet";
  if (value === "classic") return "classic";
  return null;
}

export interface TerrainSheets {
  water?: TerrainSheetRef;
  lava?: TerrainSheetRef;
  /** "row,col" of every tile that draws the water / lava layer. */
  waterTiles: Set<string>;
  lavaTiles: Set<string>;
}

// Built sheets by map signature, oldest first. A handful covers every floor a session can
// show at once; evicted entries give their object URLs back.
const SHEET_CACHE = new Map<string, TerrainSheets>();
const SHEET_CACHE_SIZE = 4;

function objectUrl(width: number, height: number, rgba: Uint8ClampedArray): string {
  const png = encodePng(width, height, rgba);
  return URL.createObjectURL(new Blob([png], { type: "image/png" }));
}

/**
 * The floor's water and lava sheets, or null when the floor has neither or the browser
 * can't make object URLs (tests, the server). Cached by map signature, so re-renders and
 * StrictMode's double calls share one build.
 */
export function terrainSheetsFor(
  tiles: number[][],
  subtypes: number[][][] | undefined,
  shape: Partial<TerrainShapeConfig> = {}
): TerrainSheets | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  if (typeof Blob === "undefined") return null;
  const grid = buildTerrainGrid(tiles, subtypes);
  if (!grid.hasWater && !grid.hasLava) return null;
  const cfg: TerrainShapeConfig = { ...DEFAULT_TERRAIN_SHAPE, ...shape };
  const key = `${grid.signature}|${JSON.stringify(cfg)}`;
  const hit = SHEET_CACHE.get(key);
  if (hit) {
    SHEET_CACHE.delete(key);
    SHEET_CACHE.set(key, hit);
    return hit;
  }
  const ref = (image: TerrainImage, smooth: boolean): TerrainSheetRef => ({
    url: objectUrl(image.width, image.height, image.rgba),
    rows: grid.rows,
    cols: grid.cols,
    smooth,
    maskUrl: image.coverage ? objectUrl(image.width, image.height, image.coverage) : undefined,
  });
  const built: TerrainSheets = {
    water: grid.hasWater
      ? ref(renderWaterImage(grid, cfg), cfg.waterStyle === "procedural")
      : undefined,
    lava: grid.hasLava ? ref(renderLavaImage(grid, cfg), true) : undefined,
    waterTiles: grid.hasWater ? terrainLayerTiles(grid, "water") : new Set(),
    lavaTiles: grid.hasLava ? terrainLayerTiles(grid, "lava") : new Set(),
  };
  SHEET_CACHE.set(key, built);
  while (SHEET_CACHE.size > SHEET_CACHE_SIZE) {
    const [oldKey, old] = SHEET_CACHE.entries().next().value as [string, TerrainSheets];
    SHEET_CACHE.delete(oldKey);
    for (const sheet of [old.water, old.lava]) {
      if (!sheet) continue;
      URL.revokeObjectURL(sheet.url);
      if (sheet.maskUrl) URL.revokeObjectURL(sheet.maskUrl);
    }
  }
  return built;
}
