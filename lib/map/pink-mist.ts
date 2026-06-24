import { FLOOR, FLOWERS } from "./constants";
import type { MapData } from "./types";

// The pink realm's drifting mist. A set of floor tiles (stored as [y,x] pairs) that
// grows and shrinks organically each turn. While the hero stands in it their controls
// reverse; enemies caught in it are blinded (see game-state.ts for the wiring).
export type MistTiles = Array<[number, number]>;

const ADJ: Array<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const keyOf = (y: number, x: number) => `${y},${x}`;

function isWalkable(t: number): boolean {
  return t === FLOOR || t === FLOWERS;
}

function walkableTiles(mapData: MapData): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < mapData.tiles.length; y++) {
    for (let x = 0; x < (mapData.tiles[y]?.length ?? 0); x++) {
      if (isWalkable(mapData.tiles[y][x])) out.push([y, x]);
    }
  }
  return out;
}

/** Soft cap on coverage — roughly 10% of the walkable tiles, with a floor so small rooms still get a cloud. */
export function mistMax(mapData: MapData): number {
  return Math.max(8, Math.round(0.1 * walkableTiles(mapData).length));
}

/** True if (y,x) is currently misty. */
export function mistContains(
  mist: MistTiles | undefined,
  y: number,
  x: number
): boolean {
  if (!mist) return false;
  for (const [my, mx] of mist) if (my === y && mx === x) return true;
  return false;
}

/** Add one tile orthogonally adjacent to the current cluster. Mutates `mist`/`seen`; false if nowhere to grow. */
function growOnce(
  mist: MistTiles,
  seen: Set<string>,
  mapData: MapData,
  rng: () => number
): boolean {
  const H = mapData.tiles.length;
  const W = mapData.tiles[0]?.length ?? 0;
  const candidates: Array<[number, number]> = [];
  for (const [y, x] of mist) {
    for (const [dy, dx] of ADJ) {
      const ny = y + dy;
      const nx = x + dx;
      if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
      if (!isWalkable(mapData.tiles[ny][nx])) continue;
      const k = keyOf(ny, nx);
      if (seen.has(k)) continue;
      seen.add(k); // guard against the same candidate being added twice in one pass
      candidates.push([ny, nx]);
    }
  }
  if (candidates.length === 0) return false;
  // We provisionally marked every candidate as seen above; un-mark the ones we don't pick.
  const pick = candidates[Math.floor(rng() * candidates.length)];
  for (const [cy, cx] of candidates) {
    if (cy !== pick[0] || cx !== pick[1]) seen.delete(keyOf(cy, cx));
  }
  mist.push(pick);
  return true;
}

/**
 * Initial seed: a small cluster (1-8 tiles) grown from one random walkable tile.
 * `exclude` tiles ([y,x] pairs) are kept clear of the cloud — used to keep the hero's
 * entry/return-ring tile mist-free so their first move isn't silently reversed.
 */
export function seedMist(
  mapData: MapData,
  rng: () => number = Math.random,
  exclude?: Iterable<[number, number]>
): MistTiles {
  const excluded = new Set<string>();
  if (exclude) for (const [y, x] of exclude) excluded.add(keyOf(y, x));
  const walk = walkableTiles(mapData).filter(
    ([y, x]) => !excluded.has(keyOf(y, x))
  );
  if (walk.length === 0) return [];
  const start = walk[Math.floor(rng() * walk.length)];
  const mist: MistTiles = [[start[0], start[1]]];
  // Pre-seed `seen` with the excluded tiles so growth never spreads onto them either.
  const seen = new Set([...excluded, keyOf(start[0], start[1])]);
  const targetSeed = Math.min(walk.length, 1 + Math.floor(rng() * 8)); // 1..8
  while (mist.length < targetSeed) {
    if (!growOnce(mist, seen, mapData, rng)) break;
  }
  return mist;
}

/**
 * Advance the mist one turn. Organic feel: biased to grow while below ~10% coverage and
 * to shrink at/over it, moving 1-2 tiles at a time. It can shrink to nothing and then
 * re-seed on a later turn, so the cloud comes and goes.
 */
export function advanceMist(
  mist: MistTiles,
  mapData: MapData,
  rng: () => number = Math.random
): MistTiles {
  const max = mistMax(mapData);
  if (mist.length === 0) {
    // Faded out: sometimes a single fresh wisp condenses (then grows over later turns,
    // preserving the 1-2-tiles-per-turn feel), sometimes the realm stays clear.
    if (rng() >= 0.5) return [];
    const walk = walkableTiles(mapData);
    if (walk.length === 0) return [];
    const t = walk[Math.floor(rng() * walk.length)];
    return [[t[0], t[1]]];
  }
  const next: MistTiles = mist.map(([y, x]) => [y, x] as [number, number]);
  const seen = new Set(next.map(([y, x]) => keyOf(y, x)));
  const growBias = next.length < max ? 0.65 : 0.2;
  const grow = rng() < growBias;
  const steps = 1 + (rng() < 0.5 ? 1 : 0); // 1 or 2 tiles this turn
  if (grow) {
    for (let i = 0; i < steps; i++) {
      if (next.length >= max) break;
      if (!growOnce(next, seen, mapData, rng)) break;
    }
  } else {
    for (let i = 0; i < steps; i++) {
      if (next.length === 0) break;
      const idx = Math.floor(rng() * next.length);
      const [ry, rx] = next.splice(idx, 1)[0];
      seen.delete(keyOf(ry, rx));
    }
  }
  return next;
}
