import { Enemy } from "../../../enemy";
import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../map";
import type { StoryRoom, StoryRoomLink } from "../types";

type EnemyConfig = {
  kind: Enemy["kind"];
  count: number;
};

const ROOM_SIZE = 40;

const BASE_FORBIDDEN_RADIUS = 2;

function createEmptyRoom() {
  const height = ROOM_SIZE + 2;
  const width = ROOM_SIZE + 2;
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y <= ROOM_SIZE; y++) {
    for (let x = 1; x <= ROOM_SIZE; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  return { tiles, subtypes, height, width };
}

function carveRandomObstacles(
  tiles: number[][],
  count: number,
  preserveRow: number
) {
  const width = tiles[0]?.length ?? 0;
  let placed = 0;
  const maxAttempts = count * 10;
  let attempts = 0;

  while (placed < count && attempts < maxAttempts) {
    attempts += 1;
    const y = 1 + Math.floor(Math.random() * ROOM_SIZE);
    const x = 1 + Math.floor(Math.random() * ROOM_SIZE);
    if (y === preserveRow) continue;
    if (tiles[y]?.[x] !== FLOOR) continue;
    tiles[y][x] = WALL;
    placed += 1;
  }

  // Reinforce the guaranteed corridor from entry to exit
  for (let x = 1; x < width - 1; x++) {
    tiles[preserveRow][x] = FLOOR;
  }
}

function markTransition(
  subtypes: number[][][],
  position: [number, number]
) {
  const [y, x] = position;
  if (!subtypes[y]) return;
  subtypes[y][x] = [TileSubtype.ROOM_TRANSITION];
}

function placeEnemies(
  configs: EnemyConfig[],
  tiles: number[][],
  forbidden: Set<string>
) {
  const enemies: Enemy[] = [];

  const tryPlace = (kind: Enemy["kind"]) => {
    for (let attempts = 0; attempts < 500; attempts++) {
      const y = 1 + Math.floor(Math.random() * ROOM_SIZE);
      const x = 1 + Math.floor(Math.random() * ROOM_SIZE);
      const key = `${y},${x}`;
      if (tiles[y]?.[x] !== FLOOR) continue;
      if (forbidden.has(key)) continue;
      const enemy = new Enemy({ y, x });
      enemy.kind = kind;
      enemies.push(enemy);
      forbidden.add(key);
      return true;
    }
    return false;
  };

  for (const { kind, count } of configs) {
    for (let i = 0; i < count; i++) {
      tryPlace(kind);
    }
  }

  return enemies;
}

function createForbiddenSet(
  entry: [number, number],
  exit?: [number, number]
) {
  const forbidden = new Set<string>();
  const addAround = ([y, x]: [number, number]) => {
    for (let dy = -BASE_FORBIDDEN_RADIUS; dy <= BASE_FORBIDDEN_RADIUS; dy++) {
      for (let dx = -BASE_FORBIDDEN_RADIUS; dx <= BASE_FORBIDDEN_RADIUS; dx++) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || nx < 0 || ny > ROOM_SIZE + 1 || nx > ROOM_SIZE + 1) continue;
        forbidden.add(`${ny},${nx}`);
      }
    }
  };

  addAround(entry);
  if (exit) addAround(exit);
  return forbidden;
}

export function buildDepthsOfDespairRoom1(): StoryRoom {
  const { tiles, subtypes, height, width } = createEmptyRoom();
  const entryRow = Math.floor(height / 2);
  
  // Entry point from Entrance Hall on the right side at [21, 41]
  const entryPoint: [number, number] = [entryRow, width - 1];
  tiles[entryPoint[0]][entryPoint[1]] = FLOOR;
  markTransition(subtypes, entryPoint);

  // Transition to next Depths room at top (12, 0)
  const exitPoint: [number, number] = [12, 0];
  tiles[exitPoint[0]][exitPoint[1]] = FLOOR;
  markTransition(subtypes, exitPoint);

  // Return entry point for coming back from next Depths room
  const returnEntryPoint: [number, number] = [13, 1];
  tiles[returnEntryPoint[0]][returnEntryPoint[1]] = FLOOR;

  carveRandomObstacles(tiles, 140, entryRow);

  const forbidden = createForbiddenSet(entryPoint, exitPoint);
  const configs: EnemyConfig[] = [
    { kind: "fire-goblin", count: 20 },
    { kind: "ghost", count: 3 },
    { kind: "stone-goblin", count: 5 },
  ];
  const enemies = placeEnemies(configs, tiles, forbidden);

  return {
    id: "story-depths-despair-1",
    mapData: {
      tiles,
      subtypes,
      environment: "cave",
    },
    entryPoint,
    returnEntryPoint,
    transitionToNext: exitPoint,
    enemies,
    metadata: {
      displayLabel: "Depths of Despair Room 1",
    },
    otherTransitions: [
      {
        id: "0",
        roomId: "story-hall-entrance" as RoomId,
        position: entryPoint,
        targetTransitionId: "depths-entry",
      },
    ],
  };
}

export function buildDepthsOfDespairRoom2(): StoryRoom {
  const { tiles, subtypes, height, width } = createEmptyRoom();
  
  // Entry point from previous Depths room on the right side at [21, 41]
  const entryPoint: [number, number] = [21, 41];
  tiles[entryPoint[0]][entryPoint[1]] = FLOOR;
  
  // Mark the entry point as a transition back to entrance hall
  markTransition(subtypes, entryPoint);
  
  // No exit - this is a dead end room
  const entryRow = 21;
  
  carveRandomObstacles(tiles, 180, entryRow);
  
  // Place treasure chest at [4, 4] with a sword inside
  tiles[4][4] = FLOOR;
  subtypes[4][4] = [TileSubtype.CHEST, TileSubtype.SWORD, TileSubtype.LOCK];
  
  // Place key at [34, 6]
  tiles[34][6] = FLOOR;
  subtypes[34][6] = [TileSubtype.KEY];
  
  const forbidden = createForbiddenSet(entryPoint);
  // Add chest and key positions to forbidden set
  forbidden.add("4,4");
  forbidden.add("34,6");
  
  const configs: EnemyConfig[] = [
    { kind: "fire-goblin", count: 40 },
    { kind: "ghost", count: 6 },
    { kind: "stone-goblin", count: 10 },
  ];
  const enemies = placeEnemies(configs, tiles, forbidden);
  
  // Return entry point for coming back from Depths room 1
  const returnEntryPoint: [number, number] = [21, width - 2];
  tiles[returnEntryPoint[0]][returnEntryPoint[1]] = FLOOR;
  
  return {
    id: "story-depths-despair-2",
    mapData: {
      tiles,
      subtypes,
      environment: "cave",
    },
    entryPoint,
    returnEntryPoint,
    enemies,
    metadata: {
      displayLabel: "Depths of Despair Room 2",
    },
    otherTransitions: [
      {
        id: "0",
        roomId: "story-depths-despair-1" as RoomId,
        position: entryPoint,
        targetTransitionId: "next",
      },
    ],
  };
}

