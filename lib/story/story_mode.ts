import {
  TileSubtype,
  type GameState,
  type MapData,
  Direction,
  type RoomTransition,
  type RoomId,
} from "../map";
import { Enemy, EnemyState, rehydrateEnemies, type PlainEnemy } from "../enemy";

const FLOOR = 0;
const WALL = 1;

function cloneMapData(mapData: MapData): MapData {
  return JSON.parse(JSON.stringify(mapData)) as MapData;
}

function withoutPlayer(mapData: MapData): MapData {
  const clone = cloneMapData(mapData);
  for (let y = 0; y < clone.subtypes.length; y++) {
    for (let x = 0; x < clone.subtypes[y].length; x++) {
      const cell = clone.subtypes[y][x];
      if (Array.isArray(cell) && cell.includes(TileSubtype.PLAYER)) {
        clone.subtypes[y][x] = cell.filter((t) => t !== TileSubtype.PLAYER);
      }
    }
  }
  return clone;
}

function addPlayer(mapData: MapData, position: [number, number]): MapData {
  const [py, px] = position;
  const clone = cloneMapData(mapData);
  const cell = clone.subtypes[py][px] ?? [];
  if (!cell.includes(TileSubtype.PLAYER)) {
    clone.subtypes[py][px] = [...cell, TileSubtype.PLAYER];
  }
  return clone;
}

function enemyToPlain(enemy: Enemy): PlainEnemy {
  const behavior = enemy.behaviorMemory;
  const memoryClone = behavior ? { ...behavior } : undefined;
  return {
    y: enemy.y,
    x: enemy.x,
    kind: enemy.kind,
    health: enemy.health,
    attack: enemy.attack,
    facing: enemy.facing,
    state: enemy.state ?? EnemyState.IDLE,
    behaviorMemory: memoryClone,
    _behaviorMem: memoryClone,
  };
}

function serializeEnemies(enemies?: Enemy[]): PlainEnemy[] | undefined {
  if (!enemies) return undefined;
  return enemies.map((enemy) => enemyToPlain(enemy));
}

function cloneEnemies(enemies?: Enemy[]): Enemy[] {
  if (!enemies) return [];
  const plain = serializeEnemies(enemies) ?? [];
  return rehydrateEnemies(plain);
}

type StoryRoom = {
  id: RoomId;
  mapData: MapData;
  entryPoint: [number, number];
  returnEntryPoint?: [number, number];
  entryFromNext?: [number, number];
  transitionToNext?: [number, number];
  transitionToPrevious?: [number, number];
  enemies?: Enemy[];
  potOverrides?: Record<string, TileSubtype.FOOD | TileSubtype.MED>;
};

function buildEntranceHall(): StoryRoom {
  const HALL_LENGTH = 20;
  const HALL_WIDTH = 3;
  const height = HALL_WIDTH + 2;
  const width = HALL_LENGTH + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y <= HALL_WIDTH; y++) {
    for (let x = 1; x <= HALL_LENGTH; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const midRow = 1 + Math.floor(HALL_WIDTH / 2);
  const entryPoint: [number, number] = [midRow, 2];
  const returnEntryPoint: [number, number] = [midRow, Math.max(2, HALL_LENGTH - 1)];
  const rightWallX = width - 1;
  for (let y = 1; y <= HALL_WIDTH; y++) {
    tiles[y][rightWallX] = FLOOR;
    subtypes[y][rightWallX] = [];
  }
  const transitionToNext: [number, number] = [midRow, rightWallX];
  subtypes[transitionToNext[0]][transitionToNext[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const topWall = 0;
  const bottomWall = height - 1;
  const torchInterval = 6;
  for (let offset = 2; offset <= HALL_LENGTH; offset += torchInterval) {
    const torchX = offset;
    if (subtypes[topWall][torchX].length === 0) {
      subtypes[topWall][torchX] = [TileSubtype.WALL_TORCH];
    }
    if (subtypes[bottomWall][torchX].length === 0) {
      subtypes[bottomWall][torchX] = [TileSubtype.WALL_TORCH];
    }
  }

  const potOverrides: Record<string, TileSubtype.FOOD | TileSubtype.MED> = {};
  const potPositions: Array<[number, number]> = [
    [1, Math.max(3, Math.floor(width / 4))],
    [1, Math.min(width - 2, Math.floor((width * 3) / 4))],
  ];
  for (const [py, px] of potPositions) {
    if (tiles[py]?.[px] === FLOOR) {
      subtypes[py][px] = [TileSubtype.POT];
      potOverrides[`${py},${px}`] = TileSubtype.FOOD;
    }
  }

  return {
    id: "story-hall-entrance",
    mapData: { tiles, subtypes, environment: 'cave' },
    entryPoint,
    returnEntryPoint,
    transitionToNext,
    potOverrides,
  };
}

function buildAscentCorridor(): StoryRoom {
  const VERTICAL_STEPS = 10;
  const CORRIDOR_WIDTH = 3;
  const height = VERTICAL_STEPS + 4;
  const width = CORRIDOR_WIDTH + 4;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  const bottom = height - 2;
  const top = bottom - (VERTICAL_STEPS - 1);
  for (let y = top; y <= bottom; y++) {
    for (let x = 2; x <= 2 + (CORRIDOR_WIDTH - 1); x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryRow = bottom - 1;
  for (let y = entryRow - 1; y <= entryRow + 1; y++) {
    for (let x = 1; x <= 2 + (CORRIDOR_WIDTH - 1); x++) {
      if (y >= top && y <= bottom) {
        tiles[y][x] = FLOOR;
      }
    }
  }

  for (let y = entryRow - 1; y <= entryRow + 1; y++) {
    if (y >= top && y <= bottom) {
      tiles[y][0] = FLOOR;
      subtypes[y][0] = [];
    }
  }

  const hallwayX = 3;
  const hallwayLength = 3;
  const hallwayStartY = Math.max(0, top - (hallwayLength - 1));
  for (let y = top; y >= hallwayStartY; y--) {
    for (let x = 2; x <= 4; x++) {
      if (x === hallwayX) {
        tiles[y][x] = FLOOR;
        if (!subtypes[y][x]) subtypes[y][x] = [];
      } else {
        tiles[y][x] = WALL;
        subtypes[y][x] = [];
      }
    }
  }

  const openExitY = hallwayStartY - 1;
  if (openExitY >= 0 && tiles[openExitY]) {
    tiles[openExitY][hallwayX] = FLOOR;
    subtypes[openExitY][hallwayX] = subtypes[openExitY][hallwayX] ?? [];
  }

  const transitionToPrevious: [number, number] = [entryRow, 0];
  subtypes[transitionToPrevious[0]][transitionToPrevious[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const entryPoint: [number, number] = [entryRow, 1];
  const entryFromNext: [number, number] = [Math.min(bottom, hallwayStartY + 1), hallwayX];
  const transitionToNext: [number, number] = [hallwayStartY, hallwayX];
  subtypes[transitionToNext[0]][transitionToNext[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const potOverrides: Record<string, TileSubtype.FOOD | TileSubtype.MED> = {};
  const midSectionY = Math.max(hallwayStartY + 1, Math.floor((top + bottom) / 2));
  const potPositions: Array<[number, number]> = [
    [midSectionY, 2],
    [midSectionY, 4],
  ];
  for (const [py, px] of potPositions) {
    if (tiles[py]?.[px] === FLOOR) {
      subtypes[py][px] = [TileSubtype.POT];
      potOverrides[`${py},${px}`] = TileSubtype.FOOD;
    }
  }

  const torchColumns = [1, width - 2];
  for (let y = bottom; y >= top; y -= 4) {
    for (const col of torchColumns) {
      if (tiles[y][col] === WALL) {
        subtypes[y][col] = [TileSubtype.WALL_TORCH];
      }
    }
  }

  return {
    id: "story-ascent",
    mapData: { tiles, subtypes, environment: 'cave' },
    entryPoint,
    returnEntryPoint: [entryRow, 4],
    entryFromNext,
    transitionToNext,
    transitionToPrevious,
    potOverrides,
  };
}

function buildSanctum(): StoryRoom {
  const INNER_SIZE = 10;
  const height = INNER_SIZE + 2;
  const width = INNER_SIZE + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y <= INNER_SIZE; y++) {
    for (let x = 1; x <= INNER_SIZE; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryX = Math.floor(width / 2);
  const transitionY = height - 2;
  const hallwayLength = 3;
  const hallwayTopY = Math.max(1, transitionY - (hallwayLength - 1));
  for (let y = transitionY; y >= hallwayTopY; y--) {
    for (let x = 1; x <= INNER_SIZE; x++) {
      if (x === entryX) {
        tiles[y][x] = FLOOR;
        if (!subtypes[y][x]) subtypes[y][x] = [];
      } else {
        tiles[y][x] = WALL;
        subtypes[y][x] = [];
      }
    }
  }

  const entryY = Math.max(1, hallwayTopY - 1);
  const entryPoint: [number, number] = [entryY, entryX];
  const transitionToPrevious: [number, number] = [transitionY, entryX];
  subtypes[transitionToPrevious[0]][transitionToPrevious[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const openBottomY = transitionY + 1;
  if (openBottomY < tiles.length) {
    tiles[openBottomY][entryX] = FLOOR;
    subtypes[openBottomY][entryX] = subtypes[openBottomY][entryX] ?? [];
  }

  const potOverrides: Record<string, TileSubtype.FOOD | TileSubtype.MED> = {};
  const potPositions: Array<[number, number]> = [
    [entryY - 2, entryX - 3],
    [entryY - 2, entryX + 3],
  ];
  for (const [py, px] of potPositions) {
    if (tiles[py]?.[px] === FLOOR) {
      subtypes[py][px] = [TileSubtype.POT];
      potOverrides[`${py},${px}`] = TileSubtype.MED;
    }
  }

  const topRowY = 1;
  for (let x = 1; x <= INNER_SIZE; x++) {
    if (x === entryX) {
      continue;
    }
    subtypes[topRowY][x] = [];
    if (potOverrides[`${topRowY},${x}`]) {
      delete potOverrides[`${topRowY},${x}`];
    }
  }
  tiles[0][entryX] = FLOOR;
  const transitionToNext: [number, number] = [0, entryX];
  subtypes[transitionToNext[0]][transitionToNext[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const entryFromNext: [number, number] = [transitionToNext[0] + 1, entryX];

  const checkpointY = entryY - 4;
  const checkpointX = entryX;
  if (tiles[checkpointY]?.[checkpointX] === FLOOR) {
    subtypes[checkpointY][checkpointX] = [TileSubtype.CHECKPOINT];
  }

  const snakes: Enemy[] = [];
  const snakeA = new Enemy({ y: entryY - 3, x: entryX - 2 });
  snakeA.kind = "snake";
  snakes.push(snakeA);
  const snakeB = new Enemy({ y: entryY - 1, x: entryX + 2 });
  snakeB.kind = "snake";
  snakes.push(snakeB);

  const torchRows = [1, height - 2];
  for (const row of torchRows) {
    for (let x = 2; x < width - 2; x += 3) {
      if (tiles[row][x] === WALL) {
        subtypes[row][x] = [TileSubtype.WALL_TORCH];
      }
    }
  }

  return {
    id: "story-sanctum",
    mapData: { tiles, subtypes, environment: 'cave' },
    entryPoint,
    transitionToPrevious,
    entryFromNext,
    transitionToNext,
    enemies: snakes,
    potOverrides,
  };
}

function buildOutdoorWorld(): StoryRoom {
  const OUTER_WIDTH = 12;
  const OUTER_HEIGHT = 20;
  const width = OUTER_WIDTH + 2;
  const height = OUTER_HEIGHT + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y <= OUTER_HEIGHT; y++) {
    for (let x = 1; x <= OUTER_WIDTH; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryX = 1 + Math.floor((OUTER_WIDTH - 1) / 2);
  const entryY = height - 4;
  const bottomOpeningY = height - 1;
  tiles[bottomOpeningY][entryX] = FLOOR;
  subtypes[bottomOpeningY][entryX] = [TileSubtype.ROOM_TRANSITION];

  const entryPoint: [number, number] = [bottomOpeningY - 1, entryX];
  const transitionToPrevious: [number, number] = [bottomOpeningY, entryX];

  // Add small clusters of rocks to give the outdoor space some structure
  const featureSpots: Array<[number, number, number[]]> = [
    [entryY - 4, entryX - 4, [TileSubtype.ROCK]],
    [entryY - 6, entryX + 3, [TileSubtype.ROCK]],
    [entryY + 2, entryX - 3, [TileSubtype.ROCK]],
  ];
  for (const [fy, fx, values] of featureSpots) {
    if (tiles[fy]?.[fx] === FLOOR && subtypes[fy][fx].length === 0) {
      subtypes[fy][fx] = values.slice();
    }
  }

  const houseTopY = entryY - 12;
  const houseHeight = 3;
  const houseLeftX = OUTER_WIDTH - 4;

  for (let y = 0; y < houseHeight; y++) {
    const row = houseTopY + y;
    for (let x = 0; x < 3; x++) {
      const col = houseLeftX + x;
      if (tiles[row]?.[col] !== undefined) {
        tiles[row][col] = WALL;
        subtypes[row][col] = [];
      }
    }
  }

  const doorY = houseTopY + houseHeight - 1;
  const doorX = houseLeftX + 1;
  tiles[doorY][doorX] = WALL;
  subtypes[doorY][doorX] = [TileSubtype.DOOR, TileSubtype.ROOM_TRANSITION];

  const exteriorDoorY = doorY + 1;
  if (tiles[exteriorDoorY]?.[doorX] === WALL) {
    tiles[exteriorDoorY][doorX] = FLOOR;
    subtypes[exteriorDoorY][doorX] = [];
  }

  return {
    id: "story-outdoor-clearing",
    mapData: { tiles, subtypes, environment: 'outdoor' },
    entryPoint,
    transitionToPrevious,
    entryFromNext: [exteriorDoorY, doorX],
    transitionToNext: [doorY, doorX],
  };
}

function buildOutdoorHouse(): StoryRoom {
  const SIZE = 6;
  const tiles: number[][] = Array.from({ length: SIZE + 2 }, () =>
    Array.from({ length: SIZE + 2 }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: SIZE + 2 }, () =>
    Array.from({ length: SIZE + 2 }, () => [] as number[])
  );

  for (let y = 1; y <= SIZE; y++) {
    for (let x = 1; x <= SIZE; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const doorCol = Math.floor(SIZE / 2) + 1;
  const entryPoint: [number, number] = [SIZE, doorCol];
  const transitionToPrevious: [number, number] = [SIZE + 1, doorCol];
  subtypes[transitionToPrevious[0]][transitionToPrevious[1]] = [
    TileSubtype.DOOR,
    TileSubtype.ROOM_TRANSITION,
  ];
  const entryFromNext: [number, number] = [SIZE - 1, doorCol];

  const windowCols = [2, SIZE - 1];
  for (const col of windowCols) {
    const wallCol = col;
    if (tiles[0]?.[wallCol] === WALL) {
      subtypes[0][wallCol] = [TileSubtype.WINDOW];
    }
  }

  const cornerTorches: Array<[number, number]> = [
    [1, 1],
    [1, SIZE],
    [SIZE, 1],
    [SIZE, SIZE],
  ];
  for (const [ty, tx] of cornerTorches) {
    if (tiles[ty]?.[tx] === FLOOR) {
      subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
    }
  }

  return {
    id: 'story-outdoor-house',
    mapData: { tiles, subtypes, environment: 'house' },
    entryPoint,
    transitionToPrevious,
    entryFromNext,
  };
}

export function buildStoryModeState(): GameState {
  const entrance = buildEntranceHall();
  const ascent = buildAscentCorridor();
  const sanctum = buildSanctum();
  const outdoor = buildOutdoorWorld();
  const outdoorHouse = buildOutdoorHouse();

  const transitions: RoomTransition[] = [];

  const pushTransition = (
    from: RoomId,
    to: RoomId,
    position: [number, number],
    targetEntryPoint?: [number, number]
  ) => {
    transitions.push({ from, to, position, targetEntryPoint });
  };

  pushTransition(entrance.id, ascent.id, entrance.transitionToNext!, ascent.entryPoint);
  pushTransition(
    ascent.id,
    entrance.id,
    ascent.transitionToPrevious!,
    entrance.returnEntryPoint ?? entrance.entryPoint
  );
  pushTransition(ascent.id, sanctum.id, ascent.transitionToNext!, sanctum.entryPoint);
  pushTransition(
    sanctum.id,
    ascent.id,
    sanctum.transitionToPrevious!,
    ascent.entryFromNext ?? ascent.entryPoint
  );
  pushTransition(sanctum.id, outdoor.id, sanctum.transitionToNext!, outdoor.entryPoint);
  pushTransition(
    outdoor.id,
    sanctum.id,
    outdoor.transitionToPrevious!,
    sanctum.entryFromNext ?? sanctum.entryPoint
  );
  pushTransition(outdoor.id, outdoorHouse.id, outdoor.transitionToNext!);
  pushTransition(
    outdoorHouse.id,
    outdoor.id,
    outdoorHouse.transitionToPrevious!,
    outdoor.entryFromNext ?? outdoor.entryPoint
  );

  const entranceTargetBase = ascent.entryPoint;
  const entranceReturnBase = entrance.returnEntryPoint ?? entrance.entryPoint;
  const [entranceBaseY, entranceBaseX] = entrance.transitionToNext!;
  const entranceExtras = [-1, 1]
    .map((offset) => entranceBaseY + offset)
    .filter(
      (y) =>
        y > 0 &&
        y < entrance.mapData.tiles.length &&
        entrance.mapData.tiles[y][entranceBaseX] === FLOOR
    );
  for (const y of entranceExtras) {
    const offset = y - entranceBaseY;
    let targetY = entranceTargetBase[0] + offset;
    if (
      targetY < 0 ||
      targetY >= ascent.mapData.tiles.length ||
      ascent.mapData.tiles[targetY][entranceTargetBase[1]] !== FLOOR
    ) {
      targetY = entranceTargetBase[0];
    }
    pushTransition(entrance.id, ascent.id, [y, entranceBaseX], [targetY, entranceTargetBase[1]]);

    let returnTargetY = entranceReturnBase[0] + offset;
    if (
      returnTargetY < 0 ||
      returnTargetY >= entrance.mapData.tiles.length ||
      entrance.mapData.tiles[returnTargetY][entranceReturnBase[1]] !== FLOOR
    ) {
      returnTargetY = entranceReturnBase[0];
    }
    const ascentReturnPosition: [number, number] = [ascent.transitionToPrevious![0] + offset, ascent.transitionToPrevious![1]];
    if (
      ascentReturnPosition[0] > 0 &&
      ascentReturnPosition[0] < ascent.mapData.tiles.length &&
      ascent.mapData.tiles[ascentReturnPosition[0]][ascentReturnPosition[1]] === FLOOR
    ) {
      pushTransition(
        ascent.id,
        entrance.id,
        ascentReturnPosition,
        [returnTargetY, entranceReturnBase[1]]
      );
    }
  }

  const roomSnapshots: GameState["rooms"] = {
    [entrance.id]: {
      mapData: withoutPlayer(entrance.mapData),
      entryPoint: entrance.entryPoint,
      enemies: serializeEnemies(entrance.enemies),
      potOverrides: entrance.potOverrides,
    },
    [ascent.id]: {
      mapData: withoutPlayer(ascent.mapData),
      entryPoint: ascent.entryPoint,
      enemies: serializeEnemies(ascent.enemies),
      potOverrides: ascent.potOverrides,
    },
    [sanctum.id]: {
      mapData: withoutPlayer(sanctum.mapData),
      entryPoint: sanctum.entryPoint,
      enemies: serializeEnemies(sanctum.enemies),
      potOverrides: sanctum.potOverrides,
    },
    [outdoor.id]: {
      mapData: withoutPlayer(outdoor.mapData),
      entryPoint: outdoor.entryPoint,
      enemies: serializeEnemies(outdoor.enemies),
      potOverrides: outdoor.potOverrides,
    },
    [outdoorHouse.id]: {
      mapData: withoutPlayer(outdoorHouse.mapData),
      entryPoint: outdoorHouse.entryPoint,
      enemies: serializeEnemies(outdoorHouse.enemies),
      potOverrides: outdoorHouse.potOverrides,
    },
  };

  const startingMap = addPlayer(entrance.mapData, entrance.entryPoint);
  const initialEnemies = cloneEnemies(entrance.enemies);
  const initialPotOverrides = entrance.potOverrides
    ? { ...entrance.potOverrides }
    : undefined;

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mode: 'story',
    allowCheckpoints: true,
    mapData: startingMap,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: initialEnemies,
    heroHealth: 1,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 0,
    runeCount: 0,
    foodCount: 0,
    potionCount: 0,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
    },
    recentDeaths: [],
    currentRoomId: entrance.id,
    rooms: roomSnapshots,
    roomTransitions: transitions,
    potOverrides: initialPotOverrides,
  };

  return gameState;
}
