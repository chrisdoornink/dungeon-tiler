import { FLOOR, TileSubtype } from "./constants";

export type Dir = "N" | "E" | "S" | "W";

// Ensure we never wipe other overlays like ROAD flags that may already exist
function ensureCell(subtypes: number[][][], y: number, x: number) {
  if (!subtypes[y][x]) subtypes[y][x] = [];
}

function ensureFloor(tiles: number[][], y: number, x: number) {
  tiles[y][x] = FLOOR;
}

function keepNonRotationTags(arr: number[]): number[] {
  return arr.filter(
    (t) =>
      t !== TileSubtype.ROAD_ROTATE_90 &&
      t !== TileSubtype.ROAD_ROTATE_180 &&
      t !== TileSubtype.ROAD_ROTATE_270
  );
}

function clearRoadShape(arr: number[]): number[] {
  return arr.filter(
    (t) =>
      t !== TileSubtype.ROAD_STRAIGHT &&
      t !== TileSubtype.ROAD_CORNER &&
      t !== TileSubtype.ROAD_T &&
      t !== TileSubtype.ROAD_END &&
      t !== TileSubtype.ROAD_ROTATE_90 &&
      t !== TileSubtype.ROAD_ROTATE_180 &&
      t !== TileSubtype.ROAD_ROTATE_270
  );
}

function pushUnique(arr: number[], v: number) {
  if (!arr.includes(v)) arr.push(v);
}

function setRotation(arr: number[], rot: 0 | 90 | 180 | 270) {
  const base = keepNonRotationTags(arr);
  if (rot === 90) pushUnique(base, TileSubtype.ROAD_ROTATE_90);
  else if (rot === 180) pushUnique(base, TileSubtype.ROAD_ROTATE_180);
  else if (rot === 270) pushUnique(base, TileSubtype.ROAD_ROTATE_270);
  return base;
}

function setShape(
  tiles: number[][],
  subtypes: number[][][],
  y: number,
  x: number,
  shape: TileSubtype,
  rot: 0 | 90 | 180 | 270
) {
  ensureFloor(tiles, y, x);
  ensureCell(subtypes, y, x);
  let cell = subtypes[y][x];
  cell = clearRoadShape(cell);
  pushUnique(cell, TileSubtype.ROAD);
  pushUnique(cell, shape);
  cell = setRotation(cell, rot);
  subtypes[y][x] = cell;
}

// Public API

/**
 * Place a straight road segment at (y,x) with orientation.
 * rot=0 => horizontal (E/W), rot=90 => vertical (N/S)
 */
export function placeStraight(
  tiles: number[][],
  subtypes: number[][][],
  y: number,
  x: number,
  rot: 0 | 90
) {
  setShape(tiles, subtypes, y, x, TileSubtype.ROAD_STRAIGHT, rot);
}

/**
 * Place a corner road at (y,x) defined by the two directions it connects.
 * Corner rotation mapping aligned with current Tile renderer:
 * - N+E -> 270
 * - E+S -> 90
 * - S+W -> 180
 * - W+N -> 0
 */
export function placeCorner(
  tiles: number[][],
  subtypes: number[][][],
  y: number,
  x: number,
  dirs: readonly [Dir, Dir]
) {
  const a = new Set<Dir>(dirs);
  let rot: 0 | 90 | 180 | 270 = 0;
  const n = a.has("N"), e = a.has("E"), s = a.has("S"), w = a.has("W");
  if (n && e) rot = 270;
  else if (e && s) rot = 90;
  else if (s && w) rot = 180;
  else if (w && n) rot = 0;
  setShape(tiles, subtypes, y, x, TileSubtype.ROAD_CORNER, rot);
}

/**
 * Place a T junction at (y,x) given the directions it connects (exactly three).
 * Mapping reflects the in-game orientation where base art needed 180° correction:
 * Missing side -> rotation:
 * - missing N -> 180
 * - missing E -> 90
 * - missing S -> 0
 * - missing W -> 270
 */
export function placeT(
  tiles: number[][],
  subtypes: number[][][],
  y: number,
  x: number,
  dirsPresent: readonly [Dir, Dir, Dir]
) {
  const set = new Set<Dir>(dirsPresent);
  const n = set.has("N"), e = set.has("E"), s = set.has("S"), w = set.has("W");
  let rot: 0 | 90 | 180 | 270 = 0;
  if (!n) rot = 180;
  else if (!e) rot = 90;
  else if (!s) rot = 0;
  else if (!w) rot = 270;
  setShape(tiles, subtypes, y, x, TileSubtype.ROAD_T, rot);
}

/**
 * Place an end cap at (y,x), where dir indicates the direction the path continues from the cap.
 * Base art: rotation 0 points South; mapping: N->180, E->270, S->0, W->90
 */
export function placeEnd(
  tiles: number[][],
  subtypes: number[][][],
  y: number,
  x: number,
  dir: Dir
) {
  const rot = (dir === "N" ? 180 : dir === "E" ? 270 : dir === "S" ? 0 : 90) as 0 | 90 | 180 | 270;
  setShape(tiles, subtypes, y, x, TileSubtype.ROAD_END, rot);
}

/**
 * Lay a straight road between two aligned points. If not aligned, throws.
 * Use layManhattan for L-shaped between arbitrary grid points.
 */
export function layStraightBetween(
  tiles: number[][],
  subtypes: number[][][],
  y1: number,
  x1: number,
  y2: number,
  x2: number
) {
  if (y1 === y2) {
    const [xa, xb] = x1 <= x2 ? [x1, x2] : [x2, x1];
    for (let x = xa; x <= xb; x++) placeStraight(tiles, subtypes, y1, x, 0);
  } else if (x1 === x2) {
    const [ya, yb] = y1 <= y2 ? [y1, y2] : [y2, y1];
    for (let y = ya; y <= yb; y++) placeStraight(tiles, subtypes, y, x1, 90);
  } else {
    throw new Error("layStraightBetween requires aligned points (same row or column)");
  }
}

/**
 * Lay a simple Manhattan (L-shaped) road between points by two straight segments,
 * placing the correct corner at the bend. Choose turnOrder to control which segment first.
 */
export function layManhattan(
  tiles: number[][],
  subtypes: number[][][],
  y1: number,
  x1: number,
  y2: number,
  x2: number,
  turnOrder: "horizontal-first" | "vertical-first" = "vertical-first"
) {
  if (y1 === y2 || x1 === x2) {
    layStraightBetween(tiles, subtypes, y1, x1, y2, x2);
    return;
  }
  if (turnOrder === "vertical-first") {
    // vertical segment towards y2
    layStraightBetween(tiles, subtypes, y1, x1, y2, x1);
    // corner at (y2, x1)
    const dirA: Dir = y2 < y1 ? "N" : "S";
    const dirB: Dir = x2 > x1 ? "E" : "W";
    placeCorner(tiles, subtypes, y2, x1, [dirA, dirB]);
    // horizontal to x2 (start adjacent to corner to avoid overwriting it)
    const startX = x2 > x1 ? x1 + 1 : x1 - 1;
    layStraightBetween(tiles, subtypes, y2, startX, y2, x2);
  } else {
    // horizontal first
    layStraightBetween(tiles, subtypes, y1, x1, y1, x2);
    const dirA: Dir = x2 > x1 ? "E" : "W";
    const dirB: Dir = y2 < y1 ? "N" : "S";
    placeCorner(tiles, subtypes, y1, x2, [dirA, dirB]);
    // vertical to y2 (start adjacent to corner to avoid overwriting it)
    const startY = y2 > y1 ? y1 + 1 : y1 - 1;
    layStraightBetween(tiles, subtypes, startY, x2, y2, x2);
  }
}
