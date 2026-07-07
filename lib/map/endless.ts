import { Enemy, placeEnemies } from "../enemy";
import { enemyTypeAssignement, assignWhiteGoblinSwarmIds } from "../enemy_assignment";
import { createEmptyByKind } from "../enemies/registry";
import { createInitialStoryFlags } from "../story/event_registry";
import { Direction, TileSubtype } from "./constants";
import type { MapData } from "./types";
import { findPlayerPosition } from "./player";
import { addRunePotsForStoneExciters, generateCompleteMapForFloor } from "./map-features";
import { addSnakesPerRules } from "./enemy-features";
import { mulberry32, withPatchedMathRandom } from "../rng";
import type { GameState } from "./game-state";

/**
 * Endless mode: descend as far as you can through an unbounded tower of floors.
 *
 * Design intent (see /endless):
 * - Floor 1 is the BLIND floor: the hero starts with his torch out, spawned away
 *   from every wall torch, seeing only the tiles at his feet. Fire goblins are
 *   the only goblin kind — they carry the only moving lights (and striking one
 *   relights your torch) — there are no faulty floors to blunder into, and only
 *   2 wall torches exist as distant beacons. Two wisps start in the far corners
 *   to snuff any light you find, hammering home that light is the resource.
 * - Ghosts are more common on every endless floor than in the daily (1-2 early,
 *   2-3 deep, vs the daily's 0-1) — light pressure is endless mode's identity.
 * - Floors 1-2 are a weaponless stealth act on small grids: basic goblins only,
 *   extra rocks, and no chance of sword/shield. Avoidance is correct play.
 * - The sword appears in a locked chest on a random floor 2-4 and the shield on
 *   3-5 — fixed windows for consistency, random exact floor for variety.
 * - Grids grow and enemy counts/mix ramp with depth; an extra-heart chest every
 *   5th floor is the sustain economy that makes deep runs earnable.
 * - Score is the floor reached. Each run has its own seed; floors are generated
 *   deterministically from (runSeed + floor) so a resumed run stays consistent.
 */

// Effectively unbounded — the shared exit logic treats currentFloor >= maxFloors
// as the winning floor, so keep this out of reach. (Not Infinity: the state is
// JSON round-tripped through localStorage and Infinity serializes to null.)
export const ENDLESS_MAX_FLOORS = 9999;

export interface EndlessItemPlan {
  swordFloor: number; // 2-4
  shieldFloor: number; // 3-5 (never the same floor as the sword)
  medallionFloor: number; // 6-9
}

/** Grids start tight (16x16) and grow +2 per floor to a 28x28 cap. */
export function endlessGridSizeForFloor(floor: number): [number, number] {
  const size = Math.min(16 + 2 * (floor - 1), 28);
  return [size, size];
}

/** Enemy count ramps ~1 per floor: F1 2-3, F2 3-4, ... capped at 12-13. */
export function endlessEnemyCountForFloor(floor: number, rng: () => number = Math.random): number {
  return Math.min(1 + floor, 12) + (rng() < 0.5 ? 1 : 0);
}

/**
 * Map an endless floor onto the daily floor-1/2/3 difficulty tables that drive
 * the goblin mix, ghost count, and white-goblin swarm odds:
 * floors 1-2 → basic unarmed goblins, 3-6 → the daily floor-2 mix, 7+ → floor-3.
 */
export function endlessPhaseFloor(floor: number): number {
  if (floor <= 2) return 1;
  if (floor <= 6) return 2;
  return 3;
}

/** Rock counts by depth: 5 on floor 1, 4 on floor 2, 3 deeper (daily's own curve). */
function endlessRocksFloor(floor: number): number {
  return Math.min(floor, 3);
}

/**
 * Ghosts are endless mode's signature pressure — noticeably more common than the
 * daily's 0-1 per floor. Floor 1's pair is placed by hand in the far corners.
 */
export function endlessGhostCountForFloor(floor: number, rng: () => number = Math.random): number {
  if (floor <= 1) return 0; // blind floor: corner wisps placed explicitly
  if (floor <= 6) return 1 + (rng() < 0.5 ? 1 : 0); // 1-2
  return 2 + (rng() < 0.5 ? 1 : 0); // 2-3
}

/** Number of corner wisps waiting on the blind first floor. */
export const DARK_FLOOR_GHOST_COUNT = 2;

/**
 * Place ghosts near the map corners farthest from the hero — the "opposite
 * corners" of the blind floor. Each ghost takes the free floor tile nearest its
 * corner so the pair converges on the hero from across the level.
 */
function placeCornerGhosts(mapData: MapData, enemies: Enemy[], count: number): void {
  const playerPos = findPlayerPosition(mapData);
  if (!playerPos) return;
  const [py, px] = playerPos;
  const H = mapData.tiles.length;
  const W = mapData.tiles[0]?.length ?? 0;

  const corners: Array<[number, number]> = [
    [0, 0],
    [0, W - 1],
    [H - 1, 0],
    [H - 1, W - 1],
  ];
  corners.sort(
    (a, b) => Math.hypot(b[0] - py, b[1] - px) - Math.hypot(a[0] - py, a[1] - px)
  );

  const occupied = new Set(enemies.map((e) => `${e.y},${e.x}`));
  for (const [cy, cx] of corners.slice(0, count)) {
    let best: { y: number; x: number; d: number } | null = null;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (mapData.tiles[y][x] !== 0) continue;
        if (occupied.has(`${y},${x}`)) continue;
        if (y === py && x === px) continue;
        const subs = mapData.subtypes[y]?.[x] ?? [];
        if (subs.length > 0 && !subs.every((s) => s === TileSubtype.NONE)) continue;
        const d = Math.hypot(y - cy, x - cx);
        if (!best || d < best.d) best = { y, x, d };
      }
    }
    if (best) {
      const ghost = new Enemy({ y: best.y, x: best.x });
      ghost.kind = "ghost";
      enemies.push(ghost);
      occupied.add(`${best.y},${best.x}`);
    }
  }
}

/** Small early grids need a shorter enemy spawn exclusion radius than 8. */
function endlessEnemyMinDistance(floor: number): number {
  return floor <= 2 ? 6 : 8;
}

export function rollEndlessItemPlan(rng: () => number = Math.random): EndlessItemPlan {
  const swordFloor = 2 + Math.floor(rng() * 3); // 2-4
  let shieldFloor = 3 + Math.floor(rng() * 3); // 3-5
  if (shieldFloor === swordFloor) shieldFloor += 1; // at most 6
  const medallionFloor = 6 + Math.floor(rng() * 4); // 6-9
  return { swordFloor, shieldFloor, medallionFloor };
}

/**
 * Chest/key allocation for one endless floor: sword/shield/medallion land on
 * their planned floors, and every 5th floor carries an extra-heart chest.
 */
export function endlessAllocationForFloor(
  floor: number,
  plan: EndlessItemPlan
): { chests: number; keys: number; chestContents: TileSubtype[] } {
  const chestContents: TileSubtype[] = [];
  if (floor === plan.swordFloor) chestContents.push(TileSubtype.SWORD);
  if (floor === plan.shieldFloor) chestContents.push(TileSubtype.SHIELD);
  if (floor === plan.medallionFloor) chestContents.push(TileSubtype.SNAKE_MEDALLION);
  if (floor > 0 && floor % 5 === 0) chestContents.push(TileSubtype.EXTRA_HEART);
  return { chests: chestContents.length, keys: chestContents.length, chestContents };
}

/** Wall torches on the blind first floor: few enough that finding one is the task. */
const DARK_FLOOR_WALL_TORCHES = 2;
/** The blind-floor spawn keeps at least this distance from every wall torch. */
const DARK_FLOOR_MIN_TORCH_DISTANCE = 6;

/**
 * Relocate the player so no wall torch is within minDist (Euclidean). Used by
 * the blind first floor so the hero never spawns with a free light. Falls back
 * to the farthest available tile when the map has no spot beyond minDist.
 */
export function movePlayerAwayFromWallTorches(mapData: MapData, minDist: number): MapData {
  const playerPos = findPlayerPosition(mapData);
  if (!playerPos) return mapData;

  const torches: Array<[number, number]> = [];
  for (let y = 0; y < mapData.subtypes.length; y++) {
    for (let x = 0; x < mapData.subtypes[y].length; x++) {
      if (mapData.subtypes[y][x].includes(TileSubtype.WALL_TORCH)) torches.push([y, x]);
    }
  }
  if (torches.length === 0) return mapData;

  const distToNearestTorch = (y: number, x: number) =>
    Math.min(...torches.map(([ty, tx]) => Math.hypot(ty - y, tx - x)));
  if (distToNearestTorch(playerPos[0], playerPos[1]) >= minDist) return mapData;

  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const candidates: Array<{ y: number; x: number; d: number }> = [];
  for (let y = 0; y < newMapData.tiles.length; y++) {
    for (let x = 0; x < newMapData.tiles[y].length; x++) {
      if (newMapData.tiles[y][x] !== 0) continue;
      const subs = newMapData.subtypes[y][x];
      if (subs.length > 0 && !subs.every((s) => s === TileSubtype.NONE)) continue;
      candidates.push({ y, x, d: distToNearestTorch(y, x) });
    }
  }
  if (candidates.length === 0) return mapData;

  const farEnough = candidates.filter((c) => c.d >= minDist);
  const pool = farEnough.length > 0 ? farEnough : [candidates.sort((a, b) => b.d - a.d)[0]];
  const target = pool[Math.floor(Math.random() * pool.length)];

  newMapData.subtypes[playerPos[0]][playerPos[1]] = newMapData.subtypes[playerPos[0]][
    playerPos[1]
  ].filter((s) => s !== TileSubtype.PLAYER);
  newMapData.subtypes[target.y][target.x] = [TileSubtype.PLAYER];
  return newMapData;
}

/** Generate the map + enemies for one endless floor. Call inside a seeded RNG patch. */
function buildEndlessFloor(floor: number, plan: EndlessItemPlan): { mapData: MapData; enemies: Enemy[] } {
  const isDarkFloor = floor === 1;
  const allocation = endlessAllocationForFloor(floor, plan);
  // Pass floor via opts only: the floor param would trigger the daily grid sizes
  // and the floor-3 escape-floor special cases.
  let mapData = generateCompleteMapForFloor(allocation, undefined, {
    gridSize: endlessGridSizeForFloor(floor),
    rocksFloor: endlessRocksFloor(floor),
    // Blind floor: only a couple of distant beacons, and no abyss holes to
    // stumble into while the hero can't see the ground ahead.
    wallTorches: isDarkFloor ? DARK_FLOOR_WALL_TORCHES : undefined,
    includeFaultyFloors: !isDarkFloor,
  });
  if (isDarkFloor) {
    mapData = movePlayerAwayFromWallTorches(mapData, DARK_FLOOR_MIN_TORCH_DISTANCE);
  }

  const playerPos = findPlayerPosition(mapData);
  const enemies = playerPos
    ? placeEnemies({
        grid: mapData.tiles,
        player: { y: playerPos[0], x: playerPos[1] },
        count: endlessEnemyCountForFloor(floor),
        minDistanceFromPlayer: endlessEnemyMinDistance(floor),
      })
    : [];

  // Blind floor: every goblin is a fire goblin — they carry the level's only
  // moving lights, and striking one relights your torch. Two wisps start in the
  // far corners to snuff whatever light you find. No snakes; nothing else unlit.
  if (isDarkFloor) {
    enemies.forEach((e) => {
      e.kind = "fire-goblin";
    });
    placeCornerGhosts(mapData, enemies, DARK_FLOOR_GHOST_COUNT);
    return { mapData, enemies };
  }

  const phase = endlessPhaseFloor(floor);
  const { whiteGoblinCount } = enemyTypeAssignement(enemies, { floor: phase });
  // Endless overrides the daily ghost table: more wisps at every depth.
  const ghostCount = endlessGhostCountForFloor(floor);
  if (ghostCount > 0 && playerPos) {
    const ghosts = placeEnemies({
      grid: mapData.tiles,
      player: { y: playerPos[0], x: playerPos[1] },
      count: ghostCount,
      minDistanceFromPlayer: 6,
    });
    ghosts.forEach((g) => {
      g.kind = "ghost";
      enemies.push(g);
    });
  }
  if (whiteGoblinCount > 0 && playerPos) {
    const swarmCount = Math.floor(whiteGoblinCount / 4);
    const swarmLocations = placeEnemies({
      grid: mapData.tiles,
      player: { y: playerPos[0], x: playerPos[1] },
      count: swarmCount,
      minDistanceFromPlayer: 6,
    });
    swarmLocations.forEach((location) => {
      for (let i = 0; i < 4; i++) {
        const goblin = new Enemy({ y: location.y, x: location.x });
        goblin.kind = "white-goblin";
        enemies.push(goblin);
      }
    });
    assignWhiteGoblinSwarmIds(enemies);
  }

  const withRunes = addRunePotsForStoneExciters(mapData, enemies);
  // Snakes get the REAL floor: their spawn rules already scale past floor 6.
  const snakesAdded = addSnakesPerRules(withRunes, enemies, { floor });
  return { mapData: withRunes, enemies: snakesAdded };
}

/** Initialize floor 1 of a fresh endless run with its own random seed. */
export function initializeGameStateForEndless(): GameState {
  const endlessSeed = Math.floor(Math.random() * 0x7fffffff);
  const planRng = mulberry32(endlessSeed);
  const endlessPlan = rollEndlessItemPlan(() => planRng.next());

  const floorRng = mulberry32(endlessSeed + 1);
  const { mapData, enemies } = withPatchedMathRandom(floorRng, () => buildEndlessFloor(1, endlessPlan));

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    chestKeyCount: 0,
    mode: "endless",
    allowCheckpoints: false,
    currentFloor: 1,
    maxFloors: ENDLESS_MAX_FLOORS,
    endlessSeed,
    endlessPlan,
    mapData,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies,
    npcs: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    runeCount: 0,
    // The blind floor: the run starts with the torch out. Reaching a wall torch
    // relights it (existing adjacency mechanic in game-state).
    heroTorchLit: false,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: createEmptyByKind(),
    },
    recentDeaths: [],
    npcInteractionQueue: [],
    storyFlags: createInitialStoryFlags(),
    diaryEntries: [],
  };
}

/**
 * Advance an endless run to the next floor, preserving hero stats and inventory.
 * Mirrors the daily advanceToNextFloor but with endless scaling and the run seed.
 */
export function advanceToNextEndlessFloor(currentState: GameState): GameState {
  const currentFloor = currentState.currentFloor ?? 1;
  const nextFloor = currentFloor + 1;
  const seed = currentState.endlessSeed ?? 0;
  const planRng = mulberry32(seed);
  const plan = currentState.endlessPlan ?? rollEndlessItemPlan(() => planRng.next());

  const rng = mulberry32(seed + nextFloor);
  const { mapData, enemies } = withPatchedMathRandom(rng, () => buildEndlessFloor(nextFloor, plan));

  return {
    ...currentState,
    currentFloor: nextFloor,
    maxFloors: currentState.maxFloors ?? ENDLESS_MAX_FLOORS,
    mapData,
    enemies,
    hasExitKey: false, // Reset exit key for new floor
    portalLocation: undefined, // Reset placed portal — no backtracking between floors
    win: false,
    recentDeaths: [],
    recentBombBlasts: [],
    defeatedEnemies: [],
    npcInteractionQueue: [],
    bookshelfInteractionQueue: [],
    bedInteractionQueue: [],
    // Preserve: heroHealth, heroMaxHealth, bonusHearts, heroAttack, hasSword,
    // hasShield, hasSnakeMedallion, rockCount, runeCount, foodCount, potionCount,
    // chestKeyCount, stats, endlessSeed, endlessPlan, etc.
  };
}
