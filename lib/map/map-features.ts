import { Enemy } from "../enemy";
import { DEFAULT_ENVIRONMENT } from "../environment";
import {
  FLOOR,
  WALL,
  GRID_SIZE,
  TileSubtype,
} from "./constants";
import type { MapData } from "./types";
import { generateMap, gridSizeForFloor, areAllFloorsConnected } from "./map-generation";
import { addPlayerToMap, addPlayerToMapAwayFromObjectives } from "./player";

export function generateMapWithSubtypes(gridW?: number, gridH?: number): MapData {
  const tiles = generateMap(gridW, gridH);
  const h = tiles.length;
  const w = tiles[0]?.length ?? 0;
  const subtypes = Array(h)
    .fill(0)
    .map(() =>
      Array(w)
        .fill(0)
        .map(() => [] as number[])
    );

  return {
    tiles,
    subtypes,
    environment: DEFAULT_ENVIRONMENT,
  };
}

export function generateMapWithExit(baseMapData?: MapData): MapData {
  const mapData = baseMapData
    ? (JSON.parse(JSON.stringify(baseMapData)) as MapData)
    : generateMapWithSubtypes();

  const h = mapData.tiles.length;
  const w = mapData.tiles[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        mapData.tiles[y][x] === FLOOR &&
        (mapData.subtypes[y][x].length === 0 ||
          mapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  if (eligible.length < 1) {
    console.warn("No eligible floor tiles found for exit placement");
    return mapData;
  }

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const [exitY, exitX] = eligible[0];
  mapData.subtypes[exitY][exitX] = [TileSubtype.EXIT];

  return mapData;
}

export function generateMapWithKeyAndLock(): MapData {
  const mapData = generateMapWithExit();
  const floorTiles: Array<[number, number]> = [];
  const wallsNextToFloor: Array<[number, number]> = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (
        mapData.subtypes[y][x].length > 0 &&
        !mapData.subtypes[y][x].includes(TileSubtype.NONE)
      ) {
        continue;
      }

      if (mapData.tiles[y][x] === FLOOR) {
        floorTiles.push([y, x]);
      } else if (mapData.tiles[y][x] === WALL) {
        const hasAdjacentFloor =
          (y > 0 && mapData.tiles[y - 1][x] === FLOOR) ||
          (y < GRID_SIZE - 1 && mapData.tiles[y + 1][x] === FLOOR) ||
          (x > 0 && mapData.tiles[y][x - 1] === FLOOR) ||
          (x < GRID_SIZE - 1 && mapData.tiles[y][x + 1] === FLOOR);

        if (hasAdjacentFloor) {
          wallsNextToFloor.push([y, x]);
        }
      }
    }
  }

  if (floorTiles.length < 1 || wallsNextToFloor.length < 1) {
    console.warn("Not enough valid tiles for key and lock placement");
    return mapData;
  }

  for (let i = floorTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [floorTiles[i], floorTiles[j]] = [floorTiles[j], floorTiles[i]];
  }

  for (let i = wallsNextToFloor.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wallsNextToFloor[i], wallsNextToFloor[j]] = [
      wallsNextToFloor[j],
      wallsNextToFloor[i],
    ];
  }

  const [keyY, keyX] = floorTiles[0];
  mapData.subtypes[keyY][keyX] = [TileSubtype.KEY];

  const [lockY, lockX] = wallsNextToFloor[0];
  mapData.subtypes[lockY][lockX] = [TileSubtype.LOCK];

  return mapData;
}

export function addLightswitchToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligibleTiles: Array<[number, number]> = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligibleTiles.push([y, x]);
      }
    }
  }

  if (eligibleTiles.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
    const [lightswitchY, lightswitchX] = eligibleTiles[randomIndex];

    newMapData.subtypes[lightswitchY][lightswitchX] = [TileSubtype.LIGHTSWITCH];
  } else {
    console.warn(
      "Could not place lightswitch - no eligible floor tiles available"
    );
  }

  return newMapData;
}

export function addRunePotsForStoneExciters(
  mapData: MapData,
  enemies: Enemy[]
): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const h = grid.length;
  const w = grid[0].length;

  const stones = enemies.filter((e) => e.kind === "stone-goblin");
  if (stones.length === 0) return newMapData;

  const occupied = new Set<string>(enemies.map((e) => `${e.y},${e.x}`));

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== FLOOR) continue;
      const subs = newMapData.subtypes[y][x] ?? [];
      if (subs.length > 0 && !subs.includes(TileSubtype.NONE)) continue;
      if (occupied.has(`${y},${x}`)) continue;
      eligible.push([y, x]);
    }
  }

  if (eligible.length === 0) return newMapData;

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const toPlace = Math.min(stones.length, eligible.length);
  for (let i = 0; i < toPlace; i++) {
    const [py, px] = eligible[i];
    newMapData.subtypes[py][px] = [TileSubtype.POT, TileSubtype.RUNE];
  }

  return newMapData;
}

export function addFaultyFloorsToMap(mapData: MapData): MapData {
  const newMapData: MapData = JSON.parse(JSON.stringify(mapData));
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  let placed = 0;
  const toPlace = Math.min(2, eligible.length);

  for (let i = 0; i < eligible.length && placed < toPlace; i++) {
    const [fy, fx] = eligible[i];

    if (canPlaceFaultyFloorSafely(newMapData, fy, fx)) {
      newMapData.subtypes[fy][fx] = [TileSubtype.FAULTY_FLOOR];
      placed++;
    }
  }

  return newMapData;
}

function canPlaceFaultyFloorSafely(
  mapData: MapData,
  y: number,
  x: number
): boolean {
  const testGrid = mapData.tiles.map((row) => [...row]);
  for (let yy = 0; yy < mapData.subtypes.length; yy++) {
    for (let xx = 0; xx < mapData.subtypes[yy].length; xx++) {
      const subs = mapData.subtypes[yy][xx];
      // Wall off every hazard already on the map — faulty floors, lava, AND deep water
      // (both are placed earlier in the pipeline). Hazards that each passed their own
      // connectivity check can still JOINTLY sever the dry path, so the faulty check
      // must account for all of them. (Deep water is swimmable, but the dry-path
      // guarantee must never depend on the player paying the snuff toll.)
      if (
        subs.includes(TileSubtype.FAULTY_FLOOR) ||
        subs.includes(TileSubtype.LAVA) ||
        subs.includes(TileSubtype.DEEP_WATER)
      ) {
        testGrid[yy][xx] = WALL;
      }
    }
  }
  testGrid[y][x] = WALL;

  return areAllFloorsConnected(testGrid);
}

/**
 * Carve 1-2 organic lava pools into a floor. Lava is a walkable-but-instant-death
 * overlay (a glowing wall): the connectivity guarantee treats every lava tile as a
 * WALL and requires the whole floor to remain a single connected region, so a dry,
 * lava-free path to the key/exit always exists — the lava lane is only ever a shortcut
 * you can engineer across with rocks, never the sole route.
 *
 * Placement rules: interior only (never the perimeter ring, which the breach/outside-
 * world flow assumes is solid WALL); only on empty FLOOR tiles (so exit/key/chest/pot/
 * rock/spawn scans, which all require empty subtypes, naturally avoid pools); and never
 * within Chebyshev radius 2 of the exit or exit key (so the floor-3 static guard, placed
 * adjacent to the key later, still finds open floor). Pools grow by random 4-neighbour
 * accretion; a candidate pool that would break connectivity is discarded whole.
 *
 * Must run inside the seeded withPatchedMathRandom block so daily maps stay deterministic.
 */
export function addLavaPoolsToMap(mapData: MapData, floor?: number): MapData {
  const newMapData: MapData = JSON.parse(JSON.stringify(mapData));
  const grid = newMapData.tiles;
  const h = grid.length;
  const w = grid[0]?.length ?? 0;

  // Budget: keep small so early/small floors aren't choked. Pools x max size.
  const poolCount = floor === 3 ? 2 : 2;
  const maxPoolSize = floor === 3 ? 3 : 4;

  // Tiles to keep clear: a Chebyshev radius-2 halo around the exit and exit key.
  const protectedTiles = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const subs = newMapData.subtypes[y]?.[x] ?? [];
      if (subs.includes(TileSubtype.EXIT) || subs.includes(TileSubtype.EXITKEY)) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            protectedTiles.add(`${y + dy},${x + dx}`);
          }
        }
      }
    }
  }

  const placedLava = new Set<string>();
  const isEligible = (y: number, x: number): boolean => {
    if (y < 1 || y >= h - 1 || x < 1 || x >= w - 1) return false; // interior only
    if (grid[y][x] !== FLOOR) return false;
    const subs = newMapData.subtypes[y][x];
    if (subs.length > 0 && !subs.includes(TileSubtype.NONE)) return false;
    if (protectedTiles.has(`${y},${x}`)) return false;
    if (placedLava.has(`${y},${x}`)) return false;
    return true;
  };

  // Does the floor stay one connected region if `placedLava` ∪ `candidate` are all
  // walls? Also walls any deep water already on the map, so lava + water placed by
  // sibling passes can never jointly sever the dry path.
  const keepsConnectivity = (candidate: Set<string>): boolean => {
    const testGrid = grid.map((row) => [...row]);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (newMapData.subtypes[yy][xx]?.includes(TileSubtype.DEEP_WATER)) {
          testGrid[yy][xx] = WALL;
        }
      }
    }
    for (const key of placedLava) {
      const [yy, xx] = key.split(",").map(Number);
      testGrid[yy][xx] = WALL;
    }
    for (const key of candidate) {
      const [yy, xx] = key.split(",").map(Number);
      testGrid[yy][xx] = WALL;
    }
    return areAllFloorsConnected(testGrid);
  };

  for (let p = 0; p < poolCount; p++) {
    // Collect current seeds and pick one at random.
    const seeds: Array<[number, number]> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isEligible(y, x)) seeds.push([y, x]);
      }
    }
    if (seeds.length === 0) break;
    const [sy, sx] = seeds[Math.floor(Math.random() * seeds.length)];

    // Grow a candidate pool by random 4-neighbour accretion.
    const targetSize = 2 + Math.floor(Math.random() * (maxPoolSize - 1)); // 2..maxPoolSize
    const candidate = new Set<string>([`${sy},${sx}`]);
    const frontier: Array<[number, number]> = [[sy, sx]];
    while (candidate.size < targetSize && frontier.length > 0) {
      const fi = Math.floor(Math.random() * frontier.length);
      const [cy, cx] = frontier[fi];
      const neighbors: Array<[number, number]> = [
        [cy - 1, cx],
        [cy + 1, cx],
        [cy, cx - 1],
        [cy, cx + 1],
      ];
      const open = neighbors.filter(
        ([ny, nx]) => isEligible(ny, nx) && !candidate.has(`${ny},${nx}`)
      );
      if (open.length === 0) {
        frontier.splice(fi, 1);
        continue;
      }
      const [ny, nx] = open[Math.floor(Math.random() * open.length)];
      candidate.add(`${ny},${nx}`);
      frontier.push([ny, nx]);
    }

    // Commit only if the whole pool keeps the floor connected.
    if (keepsConnectivity(candidate)) {
      for (const key of candidate) {
        const [yy, xx] = key.split(",").map(Number);
        newMapData.subtypes[yy][xx] = [TileSubtype.LAVA];
        placedLava.add(key);
      }
    }
  }

  return newMapData;
}

/**
 * A daily floor's water "size tier". Deep-water coverage is expressed as a fraction of
 * the floor's eligible interior floor tiles, so it scales with grid size. Mostly small
 * (puddles/pond); a lake is uncommon; a floor-flooding ~50% pool is genuinely rare.
 */
export type WaterTier = "puddles" | "pond" | "lake" | "flood";

/**
 * A resolved water plan for one floor: which size tier, how many separate pools, and
 * the target deep-water coverage (fraction of eligible floor). Produced by rollWaterPlan
 * (a seeded roll) and consumed by addWaterPoolsToMap.
 */
export type WaterPlan = {
  tier: WaterTier;
  poolCount: number;
  coverage: number;
};

// Weighted size table. `coverage` is the fraction of eligible interior floor that
// becomes DEEP water (the shallow shore is extra, on top). "Mostly small-to-medium,
// rarely up to ~50%." Weights sum to 1.
const WATER_TIERS: ReadonlyArray<{
  tier: WaterTier;
  weight: number;
  poolCount: [number, number]; // inclusive range
  coverage: [number, number]; // inclusive range, fraction of eligible floor
}> = [
  { tier: "puddles", weight: 0.45, poolCount: [3, 4], coverage: [0.02, 0.05] },
  { tier: "pond", weight: 0.33, poolCount: [1, 1], coverage: [0.06, 0.11] },
  { tier: "lake", weight: 0.17, poolCount: [1, 2], coverage: [0.16, 0.28] },
  { tier: "flood", weight: 0.05, poolCount: [1, 1], coverage: [0.4, 0.5] },
];

/**
 * Per-candidate-floor chance that the floor rolls any water at all. Only daily floors
 * 2-3 are candidates (floor 1 stays element-free as the teaching floor), so two floors
 * at 0.5 average one watered floor per three-floor day — "about 1 in 3 daily floors".
 */
export const WATER_FLOOR_CHANCE = 0.5;

function pickWaterTier(): (typeof WATER_TIERS)[number] {
  const r = Math.random();
  let acc = 0;
  for (const t of WATER_TIERS) {
    acc += t.weight;
    if (r < acc) return t;
  }
  return WATER_TIERS[WATER_TIERS.length - 1];
}

/**
 * Seeded roll for a floor's water plan. Only daily floors 2-3 are candidates; every
 * other floor (including the floor-1 teaching floor) returns null. A candidate floor
 * rolls dry (null) at rate 1 - WATER_FLOOR_CHANCE; otherwise it draws a weighted size
 * tier and a coverage/pool-count within that tier.
 *
 * MUST be called inside the seeded withPatchedMathRandom block so daily maps stay
 * deterministic (see the daily-determinism gotcha: land generation shifts in one deploy).
 */
export function rollWaterPlan(floor: number): WaterPlan | null {
  if (floor !== 2 && floor !== 3) return null;
  if (Math.random() >= WATER_FLOOR_CHANCE) return null;
  const t = pickWaterTier();
  const [pcLo, pcHi] = t.poolCount;
  const [covLo, covHi] = t.coverage;
  const poolCount = pcLo + Math.floor(Math.random() * (pcHi - pcLo + 1));
  const coverage = covLo + Math.random() * (covHi - covLo);
  return { tier: t.tier, poolCount, coverage };
}

/**
 * Carve one or more water pools into a floor: each a DEEP_WATER core with a
 * SHALLOW_WATER shore on most — not necessarily all — sides (each pool cuts the shore
 * on 0-2 sides, so some banks drop straight from dry floor into deep water).
 * Shallow water is free to wade (torch stays lit); deep water is swum — the torch
 * snuffs — or bridged with thrown rocks (STEPPING_STONE). Only the deep core counts
 * against connectivity: it is walled in the test grid (together with any lava/faulty
 * already placed) so a dry, swim-free path to the key/exit always exists. The shallow
 * ring is ordinary walkable floor and needs no guarantee.
 *
 * Size/count come from `opts` (from a seeded rollWaterPlan): `coverage` is the fraction
 * of eligible interior floor that becomes DEEP water, split across `poolCount` pools.
 * With no opts it falls back to the legacy single 2-4 tile pool. Pools grow by
 * INCREMENTAL connectivity-safe accretion — a candidate tile is added only if the floor
 * stays one connected region with it (and all prior water/lava) walled — so a large
 * target degrades gracefully to the biggest safe pool rather than being rejected whole.
 *
 * Same placement rules as lava: interior tiles only, empty FLOOR only (so downstream
 * item/spawn scans avoid the water automatically), and never within Chebyshev radius 2
 * of the exit or exit key. Must run inside the seeded withPatchedMathRandom block.
 */
export function addWaterPoolsToMap(
  mapData: MapData,
  opts?: { poolCount?: number; coverage?: number }
): MapData {
  const newMapData: MapData = JSON.parse(JSON.stringify(mapData));
  const grid = newMapData.tiles;
  const h = grid.length;
  const w = grid[0]?.length ?? 0;

  const protectedTiles = new Set<string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const subs = newMapData.subtypes[y]?.[x] ?? [];
      if (subs.includes(TileSubtype.EXIT) || subs.includes(TileSubtype.EXITKEY)) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            protectedTiles.add(`${y + dy},${x + dx}`);
          }
        }
      }
    }
  }

  // Eligible = interior, empty FLOOR, not in the exit/key halo, and not already water
  // (deep or shallow, so pools placed earlier in this call are never overwritten).
  const isEligible = (y: number, x: number): boolean => {
    if (y < 1 || y >= h - 1 || x < 1 || x >= w - 1) return false; // interior only
    if (grid[y][x] !== FLOOR) return false;
    const subs = newMapData.subtypes[y][x];
    if (subs.length > 0 && !subs.includes(TileSubtype.NONE)) return false;
    if (protectedTiles.has(`${y},${x}`)) return false;
    return true;
  };

  // Coverage denominator: eligible interior floor at placement time.
  let eligibleCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isEligible(y, x)) eligibleCount++;
    }
  }
  if (eligibleCount === 0) return newMapData;

  const poolCount = Math.max(1, opts?.poolCount ?? 1);
  // Total deep-water budget across all pools. With a coverage fraction, scale to the
  // floor; without, keep the legacy small 2-4 tile pool.
  const deepBudget =
    opts?.coverage !== undefined
      ? Math.max(1, Math.round(opts.coverage * eligibleCount))
      : 2 + Math.floor(Math.random() * 3);
  const perPool = Math.max(1, Math.ceil(deepBudget / poolCount));

  // Deep tiles committed so far (across all pools) — walled in every connectivity test.
  const placedDeep = new Set<string>();
  // Tiles that broke connectivity once. Walling more tiles only ever makes connectivity
  // harder, and placedDeep only grows, so a rejection is permanent — cache it globally.
  const rejected = new Set<string>();

  // Does the floor stay one connected region if `placedDeep` ∪ `extra` (this pool's
  // tentative tiles) ∪ every hazard already on the map are all walls?
  const keepsConnectivity = (extra: Iterable<string>): boolean => {
    const testGrid = grid.map((row) => [...row]);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const subs = newMapData.subtypes[yy][xx] ?? [];
        if (
          subs.includes(TileSubtype.LAVA) ||
          subs.includes(TileSubtype.FAULTY_FLOOR)
        ) {
          testGrid[yy][xx] = WALL;
        }
      }
    }
    for (const key of placedDeep) {
      const [yy, xx] = key.split(",").map(Number);
      testGrid[yy][xx] = WALL;
    }
    for (const key of extra) {
      const [yy, xx] = key.split(",").map(Number);
      testGrid[yy][xx] = WALL;
    }
    return areAllFloorsConnected(testGrid);
  };

  for (let p = 0; p < poolCount; p++) {
    // Fresh seed list each pool (previously placed water is no longer eligible).
    const seeds: Array<[number, number]> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isEligible(y, x) && !rejected.has(`${y},${x}`)) seeds.push([y, x]);
      }
    }
    if (seeds.length === 0) break;

    // Find a seed tile that is itself connectivity-safe.
    let seed: [number, number] | null = null;
    for (let tries = 0; tries < 8 && seeds.length > 0; tries++) {
      const idx = Math.floor(Math.random() * seeds.length);
      const [sy, sx] = seeds[idx];
      const key = `${sy},${sx}`;
      if (keepsConnectivity([key])) {
        seed = [sy, sx];
        break;
      }
      rejected.add(key);
      seeds.splice(idx, 1);
    }
    if (!seed) continue;

    // Grow the deep core by connectivity-safe 4-neighbour accretion: a tile joins only
    // if the whole floor stays connected with it (and all prior water) walled.
    const core = new Set<string>([`${seed[0]},${seed[1]}`]);
    const frontier: Array<[number, number]> = [seed];
    while (core.size < perPool && frontier.length > 0) {
      const fi = Math.floor(Math.random() * frontier.length);
      const [cy, cx] = frontier[fi];
      const open = ([
        [cy - 1, cx],
        [cy + 1, cx],
        [cy, cx - 1],
        [cy, cx + 1],
      ] as Array<[number, number]>).filter(
        ([ny, nx]) =>
          isEligible(ny, nx) &&
          !core.has(`${ny},${nx}`) &&
          !placedDeep.has(`${ny},${nx}`) &&
          !rejected.has(`${ny},${nx}`)
      );
      if (open.length === 0) {
        frontier.splice(fi, 1);
        continue;
      }
      const [ny, nx] = open[Math.floor(Math.random() * open.length)];
      const key = `${ny},${nx}`;
      if (keepsConnectivity([...core, key])) {
        core.add(key);
        frontier.push([ny, nx]);
      } else {
        rejected.add(key);
      }
    }

    // Commit the deep core.
    for (const key of core) {
      const [yy, xx] = key.split(",").map(Number);
      newMapData.subtypes[yy][xx] = [TileSubtype.DEEP_WATER];
      placedDeep.add(key);
    }

    // Ring it with a shallow shoreline — but not necessarily all the way around. Each
    // pool cuts 0-2 sides (N/E/S/W) where the shore is omitted, so some banks drop
    // straight from dry floor into deep water. A ring tile whose offset points into a
    // cut side is skipped (diagonals skip if either component points at a cut).
    const cutRoll = Math.random();
    const cutCount = cutRoll < 0.25 ? 0 : cutRoll < 0.75 ? 1 : 2;
    const sides: Array<[number, number]> = [
      [-1, 0], // N
      [1, 0], // S
      [0, -1], // W
      [0, 1], // E
    ];
    for (let i = sides.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sides[i], sides[j]] = [sides[j], sides[i]];
    }
    const cutSides = sides.slice(0, cutCount);
    const pointsIntoCut = (dy: number, dx: number): boolean =>
      cutSides.some(([cy, cx]) => (cy !== 0 && dy === cy) || (cx !== 0 && dx === cx));
    for (const key of core) {
      const [yy, xx] = key.split(",").map(Number);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          if (pointsIntoCut(dy, dx)) continue;
          const ny = yy + dy;
          const nx = xx + dx;
          if (isEligible(ny, nx)) {
            newMapData.subtypes[ny][nx] = [TileSubtype.SHALLOW_WATER];
          }
        }
      }
    }
  }

  return newMapData;
}

export function addRocksToMap(mapData: MapData, floor?: number): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  // Vary rocks by floor: Floor 1 = 5, Floor 2 = 4, Floor 3 = 3, default = 3
  let toPlace = 3;
  if (floor === 1) toPlace = 5;
  else if (floor === 2) toPlace = 4;
  else if (floor === 3) toPlace = 3;

  // Scale rocks up with deep water on this floor. Rocks are the ONLY way to build a
  // dry stepping-stone crossing (they land at throw range and no longer convert on
  // contact), so a big pool needs enough ammo to actually bridge it. Bonus is
  // proportional to deep-water tiles, capped so a rare ~50% flood doesn't dump an
  // absurd pile of rocks. Deterministic (reads the already-placed map, no new RNG).
  let deepWaterTiles = 0;
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (newMapData.subtypes[y][x].includes(TileSubtype.DEEP_WATER)) deepWaterTiles++;
    }
  }
  const waterRockBonus = Math.min(12, Math.floor(deepWaterTiles / 5));
  toPlace += waterRockBonus;

  toPlace = Math.min(toPlace, eligible.length);
  for (let i = 0; i < toPlace; i++) {
    const [ry, rx] = eligible[i];
    newMapData.subtypes[ry][rx] = [TileSubtype.ROCK];
  }

  return newMapData;
}

export function addPotsToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const toPlace = Math.min(3, eligible.length);
  for (let i = 0; i < toPlace; i++) {
    const [py, px] = eligible[i];
    newMapData.subtypes[py][px] = [TileSubtype.POT];
  }

  return newMapData;
}

export function addSingleKeyToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligibleTiles: Array<[number, number]> = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligibleTiles.push([y, x]);
      }
    }
  }

  if (eligibleTiles.length === 0) {
    console.warn("Could not place key - no eligible floor tiles available");
    return newMapData;
  }

  const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
  const [keyY, keyX] = eligibleTiles[randomIndex];

  newMapData.subtypes[keyY][keyX] = [TileSubtype.KEY];

  return newMapData;
}

export function addExitKeyToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligibleTiles: Array<[number, number]> = [];

  let exitPos: [number, number] | null = null;
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (newMapData.subtypes[y][x].includes(TileSubtype.EXIT)) {
        exitPos = [y, x];
        break;
      }
    }
    if (exitPos) break;
  }

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligibleTiles.push([y, x]);
      }
    }
  }

  if (eligibleTiles.length === 0) {
    console.warn(
      "Could not place exit key - no eligible floor tiles available"
    );
    return newMapData;
  }

  if (exitPos) {
    const dist = (p: [number, number]) =>
      Math.abs(p[0] - exitPos![0]) + Math.abs(p[1] - exitPos![1]);

    const MIN_D = 10;
    const farEnough = eligibleTiles.filter((p) => dist(p) >= MIN_D);

    if (farEnough.length === 0) {
      const choice =
        eligibleTiles[Math.floor(Math.random() * eligibleTiles.length)];
      const [ey, ex] = choice;
      newMapData.subtypes[ey][ex] = [TileSubtype.EXITKEY];
      return newMapData;
    }

    let maxD = -1;
    for (const p of farEnough) {
      const d = dist(p);
      if (d > maxD) maxD = d;
    }

    const minRangeD = Math.max(MIN_D, Math.floor(maxD * 0.7));
    const rangedCandidates = farEnough.filter((p) => dist(p) >= minRangeD);

    const weightedCandidates = rangedCandidates.map((pos) => ({
      pos,
      distance: dist(pos),
      weight: 1 + Math.random() * 0.5,
    }));

    weightedCandidates.sort(
      (a, b) => b.distance + b.weight - (a.distance + a.weight)
    );

    const topCandidates = weightedCandidates.slice(
      0,
      Math.max(1, Math.floor(weightedCandidates.length * 0.3))
    );
    const choice =
      topCandidates[Math.floor(Math.random() * topCandidates.length)];

    const [ey, ex] = choice.pos;
    newMapData.subtypes[ey][ex] = [TileSubtype.EXITKEY];
    return newMapData;
  }

  const [ey, ex] =
    eligibleTiles[Math.floor(Math.random() * eligibleTiles.length)];
  newMapData.subtypes[ey][ex] = [TileSubtype.EXITKEY];
  return newMapData;
}

export function addChestsToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  if (eligible.length < 2) return newMapData;

  const [p1, p2] = [eligible[0], eligible[1]];
  const contents = [TileSubtype.SWORD, TileSubtype.SHIELD];
  if (Math.random() < 0.5) contents.reverse();

  const placements: Array<[[number, number], number, boolean]> = [
    [p1, contents[0], true],
    [p2, contents[1], true],
  ];

  for (const [[cy, cx], content] of placements) {
    const sub: number[] = [TileSubtype.CHEST, content];
    sub.push(TileSubtype.LOCK);
    newMapData.subtypes[cy][cx] = sub;
  }

  return newMapData;
}

export function generateCompleteMap(): MapData {
  const base = generateMapWithSubtypes();
  const withExit = generateMapWithExit(base);
  const withExitKey = addExitKeyToMap(withExit);
  const withChests = addChestsToMap(withExitKey);
  const withKeys = addSingleKeyToMap(withChests);
  const withPots = addPotsToMap(withKeys);
  const withRocks = addRocksToMap(withPots);
  const withFaultyFloors = addFaultyFloorsToMap(withRocks);
  const withTorches = addWallTorchesToMap(withFaultyFloors);
  return addPlayerToMap(withTorches);
}

// Early items: sword and shield appear in chests on floors 1–3
const EARLY_CHEST_CONTENTS = [
  TileSubtype.SWORD,
  TileSubtype.SHIELD,
];

// Level 2 optional-item pool. Each run draws 2 distinct items from this pool into the
// two L2 chests. Add more options here later.
const L2_OPTIONAL_POOL = [
  TileSubtype.SNAKE_MEDALLION,
  TileSubtype.EXTRA_HEART,
  TileSubtype.BOMB,
];

/**
 * Deterministically allocate chests and keys across floors.
 * - Sword & Shield: 2 chests + 2 keys randomly placed across floors 1–3
 * - Snake Medallion: 1 chest + 1 key on a random floor between 5–7
 * - Extra Heart: 1 chest + 1 key on a random floor between 5–10
 * Uses Math.random (expected to be seeded externally).
 *
 * Returns a map: floor → { chests: number, keys: number, chestContents: TileSubtype[] }
 *
 * Constraint: cumulative keys ≥ cumulative chests at each floor,
 * so the player always has enough keys to open available chests.
 */
export function allocateChestsAndKeys(): Map<number, { chests: number; keys: number; chestContents: TileSubtype[] }> {
  const result = new Map<number, { chests: number; keys: number; chestContents: TileSubtype[] }>();
  for (let f = 1; f <= 3; f++) {
    result.set(f, { chests: 0, keys: 0, chestContents: [] });
  }

  // Floor 1: Sword and Shield (2 chests, 2 keys)
  const floor1 = result.get(1)!;
  floor1.chests = 2;
  floor1.keys = 2;
  // Shuffle sword and shield to randomize order
  const earlyContents = [...EARLY_CHEST_CONTENTS];
  for (let i = earlyContents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [earlyContents[i], earlyContents[j]] = [earlyContents[j], earlyContents[i]];
  }
  floor1.chestContents = earlyContents;

  // Floor 2: two optional-item chests (2 keys). Each run the daily seed draws 2
  // distinct items from the L2 optional pool. Extend L2_OPTIONAL_POOL to add more
  // possibilities later.
  const floor2 = result.get(2)!;
  floor2.chests = 2;
  floor2.keys = 2;
  const pool = [...L2_OPTIONAL_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  floor2.chestContents = pool.slice(0, 2);

  // Floor 3: no chests or keys (already initialized to 0).

  return result;
}

/**
 * Place a specific number of locked chests with given contents on a map.
 */
export function addSpecificChestsToMap(
  mapData: MapData,
  chestContents: TileSubtype[],
): MapData {
  if (chestContents.length === 0) return mapData;

  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  // Shuffle eligible positions
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const count = Math.min(chestContents.length, eligible.length);
  for (let i = 0; i < count; i++) {
    const [cy, cx] = eligible[i];
    newMapData.subtypes[cy][cx] = [TileSubtype.CHEST, chestContents[i], TileSubtype.LOCK];
  }

  return newMapData;
}

/**
 * Place a specific number of chest keys on a map.
 */
export function addChestKeysToMap(mapData: MapData, keyCount: number): MapData {
  if (keyCount <= 0) return mapData;

  let result = mapData;
  for (let i = 0; i < keyCount; i++) {
    result = addSingleKeyToMap(result);
  }
  return result;
}

/**
 * Generate a complete map for a specific floor in multi-tier mode.
 * Uses the floor allocation to determine how many chests/keys to place.
 */
export function generateCompleteMapForFloor(
  floorAllocation: { chests: number; keys: number; chestContents: TileSubtype[] },
  floor?: number,
  opts?: {
    gridSize?: [number, number]; // override the daily floor-based grid sizes (endless mode)
    rocksFloor?: number; // which floor's rock-count rule to apply when `floor` is not passed
    wallTorches?: number; // override the default wall torch count (endless dark floor)
    includeFaultyFloors?: boolean; // set false to guarantee no abyss holes (endless dark floor)
    includeLava?: boolean; // set true to carve instant-death lava pools (daily floors 2-3)
    includeWater?: boolean; // legacy: carve one small default deep-water pool + shallow ring
    waterPlan?: WaterPlan; // sized water plan from a seeded rollWaterPlan (daily floors 2-3)
  },
): MapData {
  const [gridW, gridH] = opts?.gridSize ?? (floor !== undefined ? gridSizeForFloor(floor) : [GRID_SIZE, GRID_SIZE]);
  const base = generateMapWithSubtypes(gridW, gridH);
  const withExit = generateMapWithExit(base);
  const withExitKey = addExitKeyToMap(withExit);

  // Place floor-specific chests and keys instead of the default 2 chests + 1 key
  const withChests = addSpecificChestsToMap(withExitKey, floorAllocation.chestContents);
  const withKeys = addChestKeysToMap(withChests, floorAllocation.keys);

  // Elemental terrain goes in AFTER exit/key/chest placement (so it avoids those tiles
  // and a halo around them) but BEFORE pots/rocks/faulty floors/spawns — every one of
  // those scans for empty-subtype FLOOR tiles, so they automatically steer clear.
  // Lava first, then water: each pass walls the other's hazard tiles in its
  // connectivity test, so together they can never sever the dry path.
  const withLava = opts?.includeLava ? addLavaPoolsToMap(withKeys, floor) : withKeys;
  const withWater = opts?.waterPlan
    ? addWaterPoolsToMap(withLava, {
        poolCount: opts.waterPlan.poolCount,
        coverage: opts.waterPlan.coverage,
      })
    : opts?.includeWater
      ? addWaterPoolsToMap(withLava)
      : withLava;

  const withPots = addPotsToMap(withWater);
  const withRocks = addRocksToMap(withPots, opts?.rocksFloor ?? floor);
  const withFaultyFloors =
    opts?.includeFaultyFloors === false ? withRocks : addFaultyFloorsToMap(withRocks);
  const withTorches = addWallTorchesToMap(withFaultyFloors, opts?.wallTorches);
  // Floor 3 is the escape floor (key + exit only): spawn the hero far from both
  // objectives so the run requires traversal rather than a lucky short hop. Other
  // floors keep the original fully-random spawn.
  // NOTE: the matching exit-key guard is added in advanceToNextFloor (the only path
  // that reaches floor 3 in the daily run, where it stays inside the seeded RNG block).
  // If a future caller builds floor 3 directly (e.g. initializeGameStateForMultiTier(3)),
  // it would get this hero spread but NOT the guard — add the guard there too if so.
  if (floor === 3) {
    return addPlayerToMapAwayFromObjectives(withTorches, { minDistance: 8 });
  }
  return addPlayerToMap(withTorches);
}

export function addWallTorchesToMap(mapData: MapData, count: number = 6): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const h = grid.length;
  const w = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== WALL) continue;
      if (grid[y + 1][x] !== FLOOR) continue;
      const subs = newMapData.subtypes[y][x];
      if (subs.length > 0 && !subs.includes(TileSubtype.NONE)) continue;
      eligible.push([y, x]);
    }
  }

  if (eligible.length === 0) return newMapData;

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const toPlace = Math.min(count, eligible.length);
  for (let i = 0; i < toPlace; i++) {
    const [ty, tx] = eligible[i];
    newMapData.subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
  }

  return newMapData;
}

export function findStrategicDoorWall(
  mapData: MapData
): [number, number] | null {
  const h = mapData.tiles.length;
  const w = mapData.tiles[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mapData.tiles[y][x] !== WALL) continue;

      const up = y > 0 ? mapData.tiles[y - 1][x] : WALL;
      const down = y < h - 1 ? mapData.tiles[y + 1][x] : WALL;
      const left = x > 0 ? mapData.tiles[y][x - 1] : WALL;
      const right = x < w - 1 ? mapData.tiles[y][x + 1] : WALL;

      const upIsFloor = up === FLOOR;
      const downIsFloor = down === FLOOR;
      const leftIsFloor = left === FLOOR;
      const rightIsFloor = right === FLOOR;

      const lrChoke = leftIsFloor && rightIsFloor && !upIsFloor && !downIsFloor;
      const udChoke = upIsFloor && downIsFloor && !leftIsFloor && !rightIsFloor;

      if (lrChoke || udChoke) {
        return [y, x];
      }
    }
  }
  return null;
}
