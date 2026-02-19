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
import { addPlayerToMap } from "./player";

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
      if (mapData.subtypes[yy][xx].includes(TileSubtype.FAULTY_FLOOR)) {
        testGrid[yy][xx] = WALL;
      }
    }
  }
  testGrid[y][x] = WALL;

  return areAllFloorsConnected(testGrid);
}

export function addRocksToMap(mapData: MapData): MapData {
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
  for (let f = 1; f <= 10; f++) {
    result.set(f, { chests: 0, keys: 0, chestContents: [] });
  }

  // --- Early items (sword + shield) on floors 1–3 ---

  // Shuffle early chest contents to randomize which item goes where
  const earlyContents = [...EARLY_CHEST_CONTENTS];
  for (let i = earlyContents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [earlyContents[i], earlyContents[j]] = [earlyContents[j], earlyContents[i]];
  }

  // Place 2 chests randomly across floors 1–3
  const chestFloors: number[] = [];
  for (let i = 0; i < 2; i++) {
    chestFloors.push(1 + Math.floor(Math.random() * 3)); // 1–3
  }
  chestFloors.sort((a, b) => a - b);

  // Place 2 keys randomly across floors 1–3, then adjust to satisfy the
  // cumulative constraint: by floor F, total keys placed ≥ total chests placed.
  const keyFloors: number[] = [];
  for (let i = 0; i < 2; i++) {
    keyFloors.push(1 + Math.floor(Math.random() * 3)); // 1–3
  }
  keyFloors.sort((a, b) => a - b);

  // Enforce constraint: for each chest, ensure a key exists on or before that floor
  for (let i = 0; i < 2; i++) {
    if (keyFloors[i] > chestFloors[i]) {
      keyFloors[i] = chestFloors[i];
    }
  }
  keyFloors.sort((a, b) => a - b);

  // Assign early items to result
  for (let i = 0; i < 2; i++) {
    const cf = chestFloors[i];
    const entry = result.get(cf)!;
    entry.chests++;
    entry.chestContents.push(earlyContents[i]);

    const kf = keyFloors[i];
    result.get(kf)!.keys++;
  }

  // --- Snake Medallion on a random floor between 5–7 ---
  const medallionFloor = 5 + Math.floor(Math.random() * 3); // 5, 6, or 7
  const medallionEntry = result.get(medallionFloor)!;
  medallionEntry.chests++;
  medallionEntry.chestContents.push(TileSubtype.SNAKE_MEDALLION);
  // Place the key on the same floor or earlier (random floor from 5 to medallionFloor)
  const medallionKeyFloor = 5 + Math.floor(Math.random() * (medallionFloor - 4)); // 5 to medallionFloor
  result.get(medallionKeyFloor)!.keys++;

  // --- Extra Heart on a random floor between 5–10 ---
  const heartFloor = 5 + Math.floor(Math.random() * 6); // 5, 6, 7, 8, 9, or 10
  const heartEntry = result.get(heartFloor)!;
  heartEntry.chests++;
  heartEntry.chestContents.push(TileSubtype.EXTRA_HEART);
  // Place the key on the same floor or earlier (random floor from 5 to heartFloor)
  const heartKeyFloor = 5 + Math.floor(Math.random() * (heartFloor - 4)); // 5 to heartFloor
  result.get(heartKeyFloor)!.keys++;

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
): MapData {
  const [gridW, gridH] = floor !== undefined ? gridSizeForFloor(floor) : [GRID_SIZE, GRID_SIZE];
  const base = generateMapWithSubtypes(gridW, gridH);
  const withExit = generateMapWithExit(base);
  const withExitKey = addExitKeyToMap(withExit);

  // Place floor-specific chests and keys instead of the default 2 chests + 1 key
  const withChests = addSpecificChestsToMap(withExitKey, floorAllocation.chestContents);
  const withKeys = addChestKeysToMap(withChests, floorAllocation.keys);

  const withPots = addPotsToMap(withKeys);
  const withRocks = addRocksToMap(withPots);
  const withFaultyFloors = addFaultyFloorsToMap(withRocks);
  const withTorches = addWallTorchesToMap(withFaultyFloors);
  return addPlayerToMap(withTorches);
}

export function addWallTorchesToMap(mapData: MapData): MapData {
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

  const toPlace = Math.min(6, eligible.length);
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
