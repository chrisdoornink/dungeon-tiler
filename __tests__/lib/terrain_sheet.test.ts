import { inflateSync } from "zlib";
import { TileSubtype } from "../../lib/map/constants";
import {
  DEFAULT_TERRAIN_SHAPE,
  TERRAIN_PX,
  buildTerrainGrid,
  encodePng,
  parseTerrainStyle,
  renderLavaImage,
  renderWaterImage,
  sheetCellPosition,
  terrainLayerTiles,
  waterCoverageAt,
} from "../../lib/terrain_sheet";

// . floor  # wall  s shallow  d deep  t stepping stone  L lava  O obsidian
function parse(lines: string[]) {
  const sub: Record<string, number[]> = {
    s: [TileSubtype.SHALLOW_WATER],
    d: [TileSubtype.DEEP_WATER],
    t: [TileSubtype.STEPPING_STONE],
    L: [TileSubtype.LAVA],
    O: [TileSubtype.OBSIDIAN],
  };
  const tiles = lines.map((l) => [...l].map((ch) => (ch === "#" ? 1 : 0)));
  const subtypes = lines.map((l) => [...l].map((ch) => [...(sub[ch] ?? [])]));
  return { tiles, subtypes };
}

const LAKE = [
  "##########",
  "#........#",
  "#.sss..s.#",
  "#.sdds...#",
  "#.sdds.s.#",
  "#..ss..#.#",
  "#.s#s....#",
  "##########",
];

describe("buildTerrainGrid", () => {
  it("classifies water, lava and the tiles that don't count", () => {
    const { tiles, subtypes } = parse(["#.sdtLO"]);
    const g = buildTerrainGrid(tiles, subtypes);
    expect(Array.from(g.water)).toEqual([-1, 0, 1, 2, 2, -1, -1]);
    expect(Array.from(g.lava)).toEqual([-1, 0, -1, -1, -1, 1, -1]);
    expect(g.hasWater).toBe(true);
    expect(g.hasLava).toBe(true);
  });

  it("changes its signature when the terrain changes (a rock cooling lava into obsidian)", () => {
    const before = parse(["..LL.."]);
    const after = parse(["..LO.."]);
    expect(buildTerrainGrid(before.tiles, before.subtypes).signature).not.toBe(
      buildTerrainGrid(after.tiles, after.subtypes).signature
    );
  });
});

describe("the shoreline", () => {
  const { tiles, subtypes } = parse(LAKE);
  const g = buildTerrainGrid(tiles, subtypes);
  // A near-square setting, so these check the machinery rather than today's tuning.
  const square = { ...DEFAULT_TERRAIN_SHAPE, cornerPx: 4, wobblePx: 1.2, wobbleTiles: 1.6 };

  it("never flips the middle of a tile: water reads as water and land as land", () => {
    // (Also holds at today's rounder defaults: corners round over cornerPx + wobblePx,
    // well short of a tile's middle.)
    // Every point within 0.2 tiles of a tile's centre keeps that tile's class, whatever
    // the noise does out at the edges.
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cls = g.water[r * g.cols + c];
        if (cls < 0) continue;
        for (const dy of [-0.2, 0, 0.2]) {
          for (const dx of [-0.2, 0, 0.2]) {
            const cover = waterCoverageAt(g, c + 0.5 + dx, r + 0.5 + dy, square);
            expect(cover).toBe(cls > 0 ? 1 : 0);
          }
        }
      }
    }
  });

  it("stays square: along a straight shore it steps a little, but never far from the tile edge", () => {
    // The lake's top shore runs along the edge at v = 2 over columns 2-4. For each pixel
    // column, find where the water starts (in pixels from the tile edge).
    const offsets = new Set<number>();
    for (let x = 2 * TERRAIN_PX; x < 5 * TERRAIN_PX; x++) {
      const u = (x + 0.5) / TERRAIN_PX;
      let first: number | null = null;
      for (let py = -6; py <= 6; py++) {
        const v = 2 + (py + 0.5) / TERRAIN_PX;
        if (waterCoverageAt(g, u, v, square) === 1) {
          first = py;
          break;
        }
      }
      expect(first).not.toBeNull();
      offsets.add(first!);
    }
    // Some variation...
    expect(offsets.size).toBeGreaterThan(1);
    // ...but within a few pixels of the edge (0 = exactly on it).
    for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(3);
  });
});

describe("terrainLayerTiles", () => {
  it("covers each pool and the open ground touching it, never walls or far tiles", () => {
    const { tiles, subtypes } = parse(["#....", "#.s..", "#....", "#...."]);
    const g = buildTerrainGrid(tiles, subtypes);
    const layer = terrainLayerTiles(g, "water");
    expect(layer.has("1,2")).toBe(true); // the water
    for (const k of ["0,1", "0,2", "0,3", "1,1", "1,3", "2,1", "2,2", "2,3"]) {
      expect(layer.has(k)).toBe(true); // the shore around it
    }
    expect(layer.has("1,0")).toBe(false); // wall
    expect(layer.has("3,2")).toBe(false); // two tiles away
  });
});

describe("rendered images", () => {
  const { tiles, subtypes } = parse(LAKE);
  const g = buildTerrainGrid(tiles, subtypes);
  // Near-square, textured, so the margin/bank checks have straight shores to measure.
  const water = renderWaterImage(g, {
    ...DEFAULT_TERRAIN_SHAPE,
    waterStyle: "texture",
    cornerPx: 4,
    wobblePx: 1.2,
    wobbleTiles: 1.6,
  });
  const alphaAt = (row: number, col: number, fy = 0.5, fx = 0.5) => {
    const x = Math.floor((col + fx) * TERRAIN_PX);
    const y = Math.floor((row + fy) * TERRAIN_PX);
    return water.rgba[(y * water.width + x) * 4 + 3];
  };

  it("is one pixel block per tile at TERRAIN_PX", () => {
    expect(water.width).toBe(g.cols * TERRAIN_PX);
    expect(water.height).toBe(g.rows * TERRAIN_PX);
  });

  it("paints water in pools, leaves walls and distant floor clear", () => {
    expect(alphaAt(3, 3)).toBe(255); // deep
    expect(alphaAt(2, 2)).toBe(255); // shallow
    expect(alphaAt(0, 0)).toBe(0); // wall
    expect(alphaAt(1, 8)).toBe(0); // floor not touching water
  });

  it("puts a damp margin on the floor wherever the water actually ends", () => {
    // Walk east out of the lone shallow tile at (2,7). The margin is measured to the
    // nearest water pixel in any direction, so check a row where the shore runs straight
    // (the rows around it end at the same pixel) rather than one beside a step.
    const a = (x: number, y: number) => water.rgba[(y * water.width + x) * 4 + 3];
    const lastWaterIn = (y: number) => {
      let last = -1;
      for (let x = 7 * TERRAIN_PX; x < 9 * TERRAIN_PX; x++) if (a(x, y) === 255) last = x;
      return last;
    };
    let checked = 0;
    for (let y = Math.floor(2.2 * TERRAIN_PX); y < Math.floor(2.8 * TERRAIN_PX); y++) {
      const edge = lastWaterIn(y);
      const straight = [-4, -3, -2, -1, 1, 2, 3, 4].every((dy) => lastWaterIn(y + dy) === edge);
      if (edge < 0 || !straight) continue;
      // The default margin is 4 px wide, fading a quarter per pixel.
      expect(a(edge + 1, y)).toBe(Math.round(0.34 * 255));
      expect(a(edge + 2, y)).toBe(Math.round(0.34 * 0.75 * 255));
      expect(a(edge + 4, y)).toBe(Math.round(0.34 * 0.25 * 255));
      expect(a(edge + 5, y)).toBe(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("shades the water just below its top shore (the bank), not along its bottom", () => {
    // Deep tile (3,3) lies below shallow (2,3), so use a plain pool: compare a pixel just
    // under the top shore of the pool at (2,2)-(6,4) with one well inside it.
    const lum = (x: number, y: number) => {
      const o = (y * water.width + x) * 4;
      return water.rgba[o] + water.rgba[o + 1] + water.rgba[o + 2];
    };
    const x = Math.floor(2.5 * TERRAIN_PX);
    // Find the first water row from the top of tile (2,2), then compare it with the same
    // texture pixel one tile further down (the texture repeats every tile).
    let top = -1;
    for (let y = 2 * TERRAIN_PX - 4; y < 2 * TERRAIN_PX + 6; y++) {
      if (water.rgba[(y * water.width + x) * 4 + 3] === 255) {
        top = y;
        break;
      }
    }
    expect(top).toBeGreaterThan(0);
    expect(lum(x, top)).toBeLessThan(lum(x, top + TERRAIN_PX));
  });

  it("tiles the classic texture per tile, but generates procedural water that never repeats", () => {
    const pool = parse(["dddddd", "dddddd", "dddddd", "dddddd"]);
    const pg = buildTerrainGrid(pool.tiles, pool.subtypes);
    const textured = renderWaterImage(pg, { ...DEFAULT_TERRAIN_SHAPE, waterStyle: "texture" });
    const procedural = renderWaterImage(pg, { ...DEFAULT_TERRAIN_SHAPE, waterStyle: "procedural" });
    // Compare every pixel of tile (1,1) with the same spot one tile to the right.
    const diffs = (img: typeof textured) => {
      let n = 0;
      for (let py = 0; py < TERRAIN_PX; py++) {
        for (let px = 0; px < TERRAIN_PX; px++) {
          const a = ((TERRAIN_PX + py) * img.width + TERRAIN_PX + px) * 4;
          const b = a + TERRAIN_PX * 4;
          if (img.rgba[a] !== img.rgba[b] || img.rgba[a + 2] !== img.rgba[b + 2]) n++;
        }
      }
      return n;
    };
    expect(diffs(textured)).toBe(0);
    expect(diffs(procedural)).toBeGreaterThan(TERRAIN_PX * TERRAIN_PX * 0.5);
    // Both are fully opaque inside the pool.
    const mid = ((2 * TERRAIN_PX + 16) * procedural.width + 2 * TERRAIN_PX + 16) * 4 + 3;
    expect(procedural.rgba[mid]).toBe(255);
    expect(textured.rgba[mid]).toBe(255);
  });

  it("draws lava opaque in its pool and a heat glow around it", () => {
    const lavaMap = parse(["......", "..LL..", "..LL..", "......"]);
    const lg = buildTerrainGrid(lavaMap.tiles, lavaMap.subtypes);
    const lava = renderLavaImage(lg);
    const a = (row: number, col: number, fy = 0.5, fx = 0.5) =>
      lava.rgba[
        (Math.floor((row + fy) * TERRAIN_PX) * lava.width + Math.floor((col + fx) * TERRAIN_PX)) * 4 + 3
      ];
    expect(a(1, 2)).toBe(255);
    // Walk west out of the pool along its middle row: past the (soft) edge the floor glows,
    // and the glow is gone well before the next tile over.
    const y = Math.floor(2 * TERRAIN_PX);
    const alpha = (x: number) => lava.rgba[(y * lava.width + x) * 4 + 3];
    let edge = -1;
    for (let x = 2 * TERRAIN_PX; x > TERRAIN_PX; x--) {
      if (alpha(x) < 255) {
        edge = x;
        break;
      }
    }
    expect(edge).toBeGreaterThan(TERRAIN_PX);
    const glow = alpha(edge - 2);
    expect(glow).toBeGreaterThan(0);
    expect(glow).toBeLessThan(128);
    expect(alpha(TERRAIN_PX + 2)).toBe(0);
  });
});

describe("the water-only mask", () => {
  it("covers the water alone, never the damp margin (what the wave marks are masked to)", () => {
    const pool = parse(["......", "..ss..", "..ss..", "......"]);
    const pg = buildTerrainGrid(pool.tiles, pool.subtypes);
    const img = renderWaterImage(pg, { ...DEFAULT_TERRAIN_SHAPE, waterStyle: "procedural" });
    expect(img.coverage).toBeDefined();
    let margin = 0;
    for (let i = 0; i < img.rgba.length; i += 4) {
      const a = img.rgba[i + 3];
      const c = img.coverage![i + 3];
      if (a === 255) expect(c).toBe(255); // water
      else if (a > 0) {
        margin++;
        expect(c).toBe(0); // damp margin: drawn, but not water
      }
    }
    expect(margin).toBeGreaterThan(0);
  });

});

describe("encodePng", () => {
  it("writes a PNG whose pixels inflate back exactly", () => {
    const w = 3;
    const h = 2;
    const rgba = new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 37) % 256);
    const png = encodePng(w, h, rgba);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    expect(view.getUint32(16)).toBe(w);
    expect(view.getUint32(20)).toBe(h);
    // IHDR chunk is 8 + 13 + 4 = 25 bytes starting at 8; IDAT follows at 33.
    const idatLen = view.getUint32(33);
    expect(String.fromCharCode(...png.slice(37, 41))).toBe("IDAT");
    const raw = inflateSync(Buffer.from(png.slice(41, 41 + idatLen)));
    const expected: number[] = [];
    for (let y = 0; y < h; y++) {
      expected.push(0);
      expected.push(...rgba.slice(y * w * 4, (y + 1) * w * 4));
    }
    expect(Array.from(raw)).toEqual(expected);
  });

  it("spans multiple stored blocks for images over 64KB", () => {
    const w = 200;
    const h = 100; // 80,100 raw bytes: two stored blocks
    const rgba = new Uint8ClampedArray(w * h * 4).fill(7);
    const png = encodePng(w, h, rgba);
    const view = new DataView(png.buffer);
    const idatLen = view.getUint32(33);
    const raw = inflateSync(Buffer.from(png.slice(41, 41 + idatLen)));
    expect(raw.length).toBe((w * 4 + 1) * h);
  });
});

describe("sheetCellPosition", () => {
  it("places each tile's cell of the map-sized sheet", () => {
    const ref = { url: "blob:x", rows: 5, cols: 11, smooth: false };
    expect(sheetCellPosition(ref, 0, 0)).toEqual({ size: "1100% 500%", position: "0% 0%" });
    expect(sheetCellPosition(ref, 4, 10)).toEqual({ size: "1100% 500%", position: "100% 100%" });
    expect(sheetCellPosition(ref, 2, 5).position).toBe("50% 50%");
  });
});

describe("parseTerrainStyle", () => {
  it("reads the ?terrain= flag", () => {
    expect(parseTerrainStyle("classic")).toBe("classic");
    expect(parseTerrainStyle("sheet")).toBe("sheet");
    expect(parseTerrainStyle("bogus")).toBeNull();
    expect(parseTerrainStyle(null)).toBeNull();
  });
});
