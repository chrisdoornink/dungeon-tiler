import { Enemy } from "../../../enemy";
import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../map";
import type { StoryRoom } from "../types";

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

function buildDepthsRoomBase(
  id: RoomId,
  displayLabel: string,
  configs: EnemyConfig[],
  { includeExit }: { includeExit: boolean }
): StoryRoom {
  const { tiles, subtypes, height, width } = createEmptyRoom();
  const entryRow = Math.floor(height / 2);
  const entryPoint: [number, number] = [entryRow, 1];
  tiles[entryPoint[0]][entryPoint[1]] = FLOOR;

  const exitPoint: [number, number] | undefined = includeExit
    ? ([entryRow, width - 1] as [number, number])
    : undefined;
  if (exitPoint) {
    tiles[exitPoint[0]][exitPoint[1]] = FLOOR;
    markTransition(subtypes, exitPoint);
  }

  carveRandomObstacles(
    tiles,
    includeExit ? 140 : 180,
    entryRow
  );

  const forbidden = createForbiddenSet(entryPoint, exitPoint);
  const enemies = placeEnemies(configs, tiles, forbidden);

  const room: StoryRoom = {
    id,
    mapData: {
      tiles,
      subtypes,
      environment: "dungeon",
    },
    entryPoint,
    enemies,
    metadata: {
      displayLabel,
    },
  };

  if (exitPoint) {
    room.transitionToNext = exitPoint;
  }

  return room;
}

export function buildDepthsOfDespairRoom1(): StoryRoom {
  return buildDepthsRoomBase(
    "story-depths-despair-1",
    "Depths of Despair Room 1",
    [
      { kind: "goblin", count: 20 },
      { kind: "ghost", count: 3 },
      { kind: "stone-exciter", count: 5 },
    ],
    { includeExit: true }
  );
}

export function buildDepthsOfDespairRoom2(): StoryRoom {
  return buildDepthsRoomBase(
    "story-depths-despair-2",
    "Depths of Despair Room 2",
    [
      { kind: "goblin", count: 40 },
      { kind: "ghost", count: 6 },
      { kind: "stone-exciter", count: 10 },
    ],
    { includeExit: false }
  );
}

