import {
  TileSubtype,
  type GameState,
  type MapData,
  Direction,
  type RoomTransition,
  type RoomId,
  createCheckpointSnapshot,
  findPlayerPosition,
  isWithinBounds,
} from "../map";
import { Enemy, EnemyState, rehydrateEnemies, type PlainEnemy } from "../enemy";
import { NPC, rehydrateNPCs, serializeNPCs } from "../npc";
import { createInitialStoryFlags } from "./event_registry";

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

function cloneNPCs(npcs?: NPC[]): NPC[] {
  if (!npcs) return [];
  const plain = serializeNPCs(npcs) ?? [];
  return rehydrateNPCs(plain);
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
  npcs?: NPC[];
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
  const returnEntryPoint: [number, number] = [
    midRow,
    Math.max(2, HALL_LENGTH - 1),
  ];
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

  const mentorX = Math.min(HALL_LENGTH - 2, entryPoint[1] + 4);
  const elder = new NPC({
    id: "npc-elder-rowan",
    name: "Elder Rowan",
    sprite: "/images/npcs/boy-1.png",
    y: midRow,
    x: mentorX,
    facing: Direction.LEFT,
    canMove: false,
    memory: {
      metHero: false,
      giftAvailable: true,
    },
    interactionHooks: [
      {
        id: "elder-rowan-greet",
        type: "dialogue",
        description: "Greet the elder",
        payload: {
          dialogueId: "elder-rowan-default",
        },
      },
      {
        id: "elder-rowan-gift",
        type: "item",
        description: "Receive a restorative tonic",
        payload: {
          itemId: "med",
          quantity: 1,
        },
      },
    ],
    actions: ["greet", "gift"],
    metadata: {
      archetype: "mentor",
    },
  });
  const npcs = [elder];

  return {
    id: "story-hall-entrance",
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    returnEntryPoint,
    transitionToNext,
    potOverrides,
    npcs,
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
  const entryFromNext: [number, number] = [
    Math.min(bottom, hallwayStartY + 1),
    hallwayX,
  ];
  const transitionToNext: [number, number] = [hallwayStartY, hallwayX];
  subtypes[transitionToNext[0]][transitionToNext[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const potOverrides: Record<string, TileSubtype.FOOD | TileSubtype.MED> = {};
  const midSectionY = Math.max(
    hallwayStartY + 1,
    Math.floor((top + bottom) / 2)
  );
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
    mapData: { tiles, subtypes, environment: "cave" },
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

  const snakes: Enemy[] = [];
  const snakeA = new Enemy({ y: entryY - 3, x: entryX - 2 });
  snakeA.kind = "snake";
  snakes.push(snakeA);
  const snakeB = new Enemy({ y: entryY - 1, x: entryX + 2 });
  snakeB.kind = "snake";
  snakes.push(snakeB);

  const torchRow = 1;
  const torchCols = [entryX - 1, entryX + 1].filter(
    (x) => x >= 1 && x <= INNER_SIZE
  );
  for (const x of torchCols) {
    if (tiles[torchRow][x] === WALL) {
      subtypes[torchRow][x] = [TileSubtype.WALL_TORCH];
    }
  }

  return {
    id: "story-sanctum",
    mapData: { tiles, subtypes, environment: "cave" },
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

  const checkpointY = Math.max(1, entryPoint[0] - 2);
  const checkpointX = entryPoint[1];
  if (tiles[checkpointY]?.[checkpointX] === FLOOR) {
    subtypes[checkpointY][checkpointX] = [TileSubtype.CHECKPOINT];
  }

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
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    transitionToPrevious,
    entryFromNext: [exteriorDoorY, doorX],
    transitionToNext: [doorY, doorX],
  };
}

function buildOutdoorHouse(): StoryRoom {
  const SIZE = 5;
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

  const caretaker = new NPC({
    id: "npc-grounds-caretaker",
    name: "Caretaker Lysa",
    sprite: "/images/npcs/girl-1.png",
    y: Math.max(2, Math.floor(SIZE / 2)),
    x: Math.max(2, Math.floor(SIZE / 2)),
    facing: Direction.DOWN,
    canMove: false,
    memory: {
      sharedStories: 0,
      restingSpotUnlocked: false,
    },
    interactionHooks: [
      {
        id: "lysa-chat",
        type: "dialogue",
        description: "Ask about the outside world",
        payload: {
          dialogueId: "caretaker-lysa-reminder",
        },
      },
      {
        id: "lysa-rest",
        type: "custom",
        description: "Request a moment of rest",
        payload: {
          action: "rest",
        },
      },
    ],
    actions: ["talk", "rest"],
    metadata: {
      archetype: "caretaker",
    },
  });
  const npcs = [caretaker];

  return {
    id: "story-outdoor-house",
    mapData: { tiles, subtypes, environment: "house" },
    entryPoint,
    transitionToPrevious,
    entryFromNext,
    npcs,
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

  pushTransition(
    entrance.id,
    ascent.id,
    entrance.transitionToNext!,
    ascent.entryPoint
  );
  pushTransition(
    ascent.id,
    entrance.id,
    ascent.transitionToPrevious!,
    entrance.returnEntryPoint ?? entrance.entryPoint
  );
  pushTransition(
    ascent.id,
    sanctum.id,
    ascent.transitionToNext!,
    sanctum.entryPoint
  );
  pushTransition(
    sanctum.id,
    ascent.id,
    sanctum.transitionToPrevious!,
    ascent.entryFromNext ?? ascent.entryPoint
  );
  pushTransition(
    sanctum.id,
    outdoor.id,
    sanctum.transitionToNext!,
    outdoor.entryPoint
  );
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
    pushTransition(
      entrance.id,
      ascent.id,
      [y, entranceBaseX],
      [targetY, entranceTargetBase[1]]
    );

    let returnTargetY = entranceReturnBase[0] + offset;
    if (
      returnTargetY < 0 ||
      returnTargetY >= entrance.mapData.tiles.length ||
      entrance.mapData.tiles[returnTargetY][entranceReturnBase[1]] !== FLOOR
    ) {
      returnTargetY = entranceReturnBase[0];
    }
    const ascentReturnPosition: [number, number] = [
      ascent.transitionToPrevious![0] + offset,
      ascent.transitionToPrevious![1],
    ];
    if (
      ascentReturnPosition[0] > 0 &&
      ascentReturnPosition[0] < ascent.mapData.tiles.length &&
      ascent.mapData.tiles[ascentReturnPosition[0]][ascentReturnPosition[1]] ===
        FLOOR
    ) {
      pushTransition(ascent.id, entrance.id, ascentReturnPosition, [
        returnTargetY,
        entranceReturnBase[1],
      ]);
    }
  }

  const roomSnapshots: GameState["rooms"] = {
    [entrance.id]: {
      mapData: withoutPlayer(entrance.mapData),
      entryPoint: entrance.entryPoint,
      enemies: serializeEnemies(entrance.enemies),
      npcs: serializeNPCs(entrance.npcs),
      potOverrides: entrance.potOverrides,
    },
    [ascent.id]: {
      mapData: withoutPlayer(ascent.mapData),
      entryPoint: ascent.entryPoint,
      enemies: serializeEnemies(ascent.enemies),
      npcs: serializeNPCs(ascent.npcs),
      potOverrides: ascent.potOverrides,
    },
    [sanctum.id]: {
      mapData: withoutPlayer(sanctum.mapData),
      entryPoint: sanctum.entryPoint,
      enemies: serializeEnemies(sanctum.enemies),
      npcs: serializeNPCs(sanctum.npcs),
      potOverrides: sanctum.potOverrides,
    },
    [outdoor.id]: {
      mapData: withoutPlayer(outdoor.mapData),
      entryPoint: outdoor.entryPoint,
      enemies: serializeEnemies(outdoor.enemies),
      npcs: serializeNPCs(outdoor.npcs),
      potOverrides: outdoor.potOverrides,
    },
    [outdoorHouse.id]: {
      mapData: withoutPlayer(outdoorHouse.mapData),
      entryPoint: outdoorHouse.entryPoint,
      enemies: serializeEnemies(outdoorHouse.enemies),
      npcs: serializeNPCs(outdoorHouse.npcs),
      potOverrides: outdoorHouse.potOverrides,
    },
  };

  const startingMap = addPlayer(entrance.mapData, entrance.entryPoint);
  const initialEnemies = cloneEnemies(entrance.enemies);
  const initialNpcs = cloneNPCs(entrance.npcs);
  const initialPotOverrides = entrance.potOverrides
    ? { ...entrance.potOverrides }
    : undefined;

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mode: "story",
    allowCheckpoints: true,
    mapData: startingMap,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: initialEnemies,
    npcs: initialNpcs,
    heroHealth: 1,
    heroAttack: 1,
    heroTorchLit: false,
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
    npcInteractionQueue: [],
    currentRoomId: entrance.id,
    rooms: roomSnapshots,
    roomTransitions: transitions,
    potOverrides: initialPotOverrides,
    storyFlags: createInitialStoryFlags(),
  };

  return gameState;
}

const STORY_ROOM_LABELS: Partial<Record<RoomId, string>> = {
  "story-hall-entrance": "Entrance Hall",
  "story-ascent": "Ascent Corridor",
  "story-sanctum": "Sanctum",
  "story-outdoor-clearing": "Outdoor Clearing",
  "story-outdoor-house": "Caretaker's House",
};

function findSubtypePositions(
  mapData: MapData,
  subtype: TileSubtype
): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  for (let y = 0; y < mapData.subtypes.length; y++) {
    const row = mapData.subtypes[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (Array.isArray(cell) && cell.includes(subtype)) {
        positions.push([y, x]);
      }
    }
  }
  return positions;
}

export interface StoryCheckpointOption {
  id: string;
  roomId: RoomId;
  position: [number, number];
  label: string;
  kind: "entry" | "checkpoint";
}

export function collectStoryCheckpointOptions(
  state: GameState
): StoryCheckpointOption[] {
  const options: StoryCheckpointOption[] = [];
  const seen = new Set<string>();
  const rooms = state.rooms ?? {};

  const pushOption = (
    roomId: RoomId,
    position: [number, number],
    kind: "entry" | "checkpoint",
    index = 0
  ) => {
    const key = `${roomId}:${position[0]}:${position[1]}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    const baseLabel = STORY_ROOM_LABELS[roomId] ?? roomId;
    const suffix = kind === "checkpoint" && index > 0 ? ` ${index + 1}` : "";
    const label =
      kind === "entry"
        ? `${baseLabel} — Entry`
        : `${baseLabel} — Checkpoint${suffix}`;
    options.push({ id: key, roomId, position, label, kind });
  };

  for (const [roomIdRaw, snapshot] of Object.entries(rooms)) {
    const roomId = roomIdRaw as RoomId;
    if (snapshot.entryPoint) {
      pushOption(roomId, snapshot.entryPoint, "entry");
    }
    const checkpoints = findSubtypePositions(
      snapshot.mapData,
      TileSubtype.CHECKPOINT
    );
    checkpoints.forEach((pos, idx) => pushOption(roomId, pos, "checkpoint", idx));
  }

  // Ensure the current player position is represented even if not in rooms map yet
  const activeRoomId = state.currentRoomId;
  if (activeRoomId) {
    const playerPos = findPlayerPosition(state.mapData);
    if (playerPos) {
      pushOption(activeRoomId, playerPos, "entry");
    }
  }

  const order: Record<StoryCheckpointOption["kind"], number> = {
    checkpoint: 0,
    entry: 1,
  };

  return options.sort((a, b) => {
    const kindDelta = order[a.kind] - order[b.kind];
    if (kindDelta !== 0) return kindDelta;
    if (a.roomId === b.roomId) {
      return a.label.localeCompare(b.label);
    }
    return a.roomId.localeCompare(b.roomId);
  });
}

export interface StoryResetConfig {
  targetRoomId: RoomId;
  targetPosition: [number, number];
  heroHealth: number;
  heroTorchLit: boolean;
  hasSword: boolean;
  hasShield: boolean;
  hasKey: boolean;
  hasExitKey: boolean;
  rockCount: number;
  runeCount: number;
  foodCount: number;
  potionCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function applyStoryResetConfig(
  state: GameState,
  config: StoryResetConfig
): void {
  const rooms = state.rooms ?? {};
  const { targetRoomId, targetPosition } = config;
  const targetSnapshot = rooms[targetRoomId];
  if (!targetSnapshot) {
    throw new Error(`Unknown story room: ${targetRoomId}`);
  }

  const [ty, tx] = targetPosition;
  if (!isWithinBounds(targetSnapshot.mapData, ty, tx)) {
    throw new Error(`Invalid checkpoint position for ${targetRoomId}`);
  }
  if (targetSnapshot.mapData.tiles[ty]?.[tx] !== FLOOR) {
    throw new Error(`Target position for ${targetRoomId} is not walkable`);
  }

  const activeRoomId = state.currentRoomId ?? targetRoomId;
  const activeSnapshot = rooms[activeRoomId];
  if (activeSnapshot) {
    rooms[activeRoomId] = {
      ...activeSnapshot,
      mapData: withoutPlayer(state.mapData),
      enemies: serializeEnemies(state.enemies),
      npcs: serializeNPCs(state.npcs),
      potOverrides: state.potOverrides ? { ...state.potOverrides } : undefined,
    };
  }

  state.mapData = addPlayer(targetSnapshot.mapData, targetPosition);
  state.currentRoomId = targetRoomId;
  state.enemies = targetSnapshot.enemies
    ? rehydrateEnemies(targetSnapshot.enemies)
    : undefined;
  state.npcs = targetSnapshot.npcs
    ? rehydrateNPCs(targetSnapshot.npcs)
    : undefined;
  state.potOverrides = targetSnapshot.potOverrides
    ? { ...targetSnapshot.potOverrides }
    : undefined;

  state.heroHealth = clamp(Math.floor(config.heroHealth), 1, 6);
  state.heroTorchLit = config.heroTorchLit;
  state.hasSword = config.hasSword;
  state.hasShield = config.hasShield;
  state.hasKey = config.hasKey;
  state.hasExitKey = config.hasExitKey;
  state.rockCount = clamp(Math.floor(config.rockCount), 0, 99);
  state.runeCount = clamp(Math.floor(config.runeCount), 0, 99);
  state.foodCount = clamp(Math.floor(config.foodCount), 0, 99);
  state.potionCount = clamp(Math.floor(config.potionCount), 0, 99);

  state.stats = {
    ...state.stats,
    steps: 0,
  };
  state.recentDeaths = [];
  state.npcInteractionQueue = [];
  state.deathCause = undefined;
  state.conditions = undefined;
}

export function buildStoryStateFromConfig(config: StoryResetConfig): GameState {
  const state = buildStoryModeState();
  applyStoryResetConfig(state, config);
  state.lastCheckpoint = createCheckpointSnapshot(state);
  return state;
}
