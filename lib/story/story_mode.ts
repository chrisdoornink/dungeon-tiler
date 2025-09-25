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
import type { EnvironmentId } from "../environment";
import { Enemy, EnemyState, rehydrateEnemies, type PlainEnemy } from "../enemy";
import { NPC, rehydrateNPCs, serializeNPCs } from "../npc";
import { createInitialStoryFlags } from "./event_registry";

const FLOOR = 0;
const WALL = 1;

function cloneMapData(mapData: MapData): MapData {
  return JSON.parse(JSON.stringify(mapData)) as MapData;
}

// 10x40 bluff passageway room with right-side lower opening
function buildBluffPassageway(): StoryRoom {
  const height = 10;
  const width = 40;
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  // Carve interior floor
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Create a static interior pattern: a few wall bands and pillars
  const bands = [3, 6];
  for (const by of bands) {
    for (let x = 5; x < width - 5; x++) {
      if (x % 6 !== 0) continue; // sparse band posts
      tiles[by][x] = WALL;
      subtypes[by][x] = [];
    }
  }
  // Pillars near the middle
  const midY = Math.floor(height / 2);
  const midX = Math.floor(width / 2);
  const pillarSpots: Array<[number, number]> = [
    [midY - 1, midX - 4],
    [midY + 1, midX - 2],
    [midY, midX],
    [midY - 1, midX + 3],
    [midY + 1, midX + 6],
  ];
  for (const [py, px] of pillarSpots) {
    if (tiles[py]?.[px] !== undefined) {
      tiles[py][px] = WALL;
      subtypes[py][px] = [];
    }
  }

  // Opening on right wall near bottom
  const openY = height - 3; // two tiles up from bottom
  tiles[openY][width - 1] = FLOOR;
  subtypes[openY][width - 1] = [TileSubtype.ROOM_TRANSITION];

  // Opening at the top-left interior that leads deeper into the bluff
  const bluffCaveEntry: [number, number] = [1, 1];
  tiles[bluffCaveEntry[0]][bluffCaveEntry[1]] = FLOOR;
  subtypes[bluffCaveEntry[0]][bluffCaveEntry[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const entryPoint: [number, number] = [openY, width - 2]; // step inside from right
  const entryFromNext: [number, number] = [openY, width - 3];
  const transitionToPrevious: [number, number] = [openY, width - 1];

  // Enemies: 5 snakes and 1 goblin near center
  const enemies: Enemy[] = [];
  const enemySpots: Array<[number, number, 'snake' | 'goblin']> = [
    [midY, midX - 2, 'snake'],
    [midY - 1, midX, 'snake'],
    [midY + 1, midX + 1, 'snake'],
    [midY, midX + 3, 'snake'],
    [midY + 2, midX - 1, 'snake'],
    [midY, midX, 'goblin'],
  ];
  for (const [y, x, kind] of enemySpots) {
    if (tiles[y]?.[x] === FLOOR) {
      const e = new Enemy({ y, x });
      e.kind = kind;
      enemies.push(e);
    }
  }

  // NPC boy on the far left, with a goblin near him
  const boyY = midY;
  const boyX = 1; // far left inside wall
  const boy = new NPC({
    id: "npc-sanctum-boy",
    name: "Sanctum Acolyte",
    sprite: "/images/npcs/boy-3.png",
    y: boyY,
    x: boyX,
    facing: Direction.RIGHT,
    canMove: false,
    interactionHooks: [
      {
        id: "boy-greet",
        type: "dialogue",
        description: "Check on the boy",
        payload: { dialogueId: "librarian-default" },
      },
    ],
    actions: ["talk"],
  });
  const guardGoblinPos: [number, number] = [Math.max(1, boyY - 1), Math.min(width - 3, boyX + 3)];
  if (tiles[guardGoblinPos[0]]?.[guardGoblinPos[1]] === FLOOR) {
    const guard = new Enemy({ y: guardGoblinPos[0], x: guardGoblinPos[1] });
    guard.kind = 'goblin';
    enemies.push(guard);
  }

  return {
    id: "story-bluff-passage" as RoomId,
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    enemies,
    npcs: [boy],
  };
}

function buildBluffCaves(): StoryRoom {
  const height = 20;
  const width = 40;
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  const ensureFloor = (y: number, x: number) => {
    if (y <= 0 || y >= height - 1 || x <= 0 || x >= width - 1) return;
    tiles[y][x] = FLOOR;
    if (!subtypes[y][x]) subtypes[y][x] = [];
  };

  const carveBlock = (cy: number, cx: number, radius = 0) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        ensureFloor(cy + dy, cx + dx);
      }
    }
  };

  const carvePath = (
    points: Array<[number, number]>,
    radius = 0
  ) => {
    if (points.length === 0) return;
    let [cy, cx] = points[0];
    carveBlock(cy, cx, radius);
    for (let i = 1; i < points.length; i++) {
      const [ny, nx] = points[i];
      const stepY = Math.sign(ny - cy);
      const stepX = Math.sign(nx - cx);
      while (cy !== ny || cx !== nx) {
        if (cx !== nx) {
          cx += stepX;
        } else if (cy !== ny) {
          cy += stepY;
        }
        carveBlock(cy, cx, radius);
      }
    }
  };

  const mainPath: Array<[number, number]> = [
    [1, 1],
    [1, 15],
    [4, 15],
    [4, 4],
    [8, 4],
    [8, 22],
    [5, 22],
    [5, 30],
    [14, 30],
    [14, 18],
    [10, 18],
    [10, 38],
  ];
  carvePath(mainPath, 1);

  const branches: Array<{ path: Array<[number, number]>; radius?: number }> = [
    { path: [
        [4, 9],
        [6, 9],
        [6, 13],
      ], radius: 0 },
    { path: [
        [8, 12],
        [12, 12],
        [12, 8],
      ], radius: 0 },
    { path: [
        [10, 26],
        [16, 26],
        [16, 34],
      ], radius: 1 },
  ];
  for (const branch of branches) {
    carvePath(branch.path, branch.radius ?? 0);
  }

  // Create a few wider pockets off the main path for a winding feel
  const pockets: Array<[number, number, number]> = [
    [5, 7, 1],
    [9, 20, 1],
    [13, 24, 1],
  ];
  for (const [py, px, radius] of pockets) {
    carveBlock(py, px, radius);
  }

  const entryDoorY = 1;
  tiles[entryDoorY][0] = FLOOR;
  subtypes[entryDoorY][0] = [TileSubtype.ROOM_TRANSITION];
  const entryPoint: [number, number] = [entryDoorY, 1];
  const transitionToPrevious: [number, number] = [entryDoorY, 0];

  const exitDoorY = 10;
  tiles[exitDoorY][width - 1] = FLOOR;
  subtypes[exitDoorY][width - 1] = [TileSubtype.ROOM_TRANSITION];
  const transitionToNext: [number, number] = [exitDoorY, width - 1];
  const entryFromNext: [number, number] = [exitDoorY, width - 2];

  const torchPositions: Array<[number, number]> = [
    [exitDoorY - 1, width - 2],
    [exitDoorY + 1, width - 2],
  ];
  for (const [ty, tx] of torchPositions) {
    if (ty > 0 && ty < height - 1 && tx > 0 && tx < width - 1) {
      ensureFloor(ty, tx);
      subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
    }
  }

  const enemies: Enemy[] = [];
  const snakeSpots: Array<[number, number]> = [
    [4, 12],
    [8, 21],
    [13, 23],
  ];
  for (const [y, x] of snakeSpots) {
    if (tiles[y]?.[x] === FLOOR) {
      const snake = new Enemy({ y, x });
      snake.kind = "snake";
      enemies.push(snake);
    }
  }

  return {
    id: "story-bluff-caves" as RoomId,
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    transitionToNext,
    enemies,
  };
}

function buildBluffSerpentDen(): StoryRoom {
  const size = 12;
  const tiles: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryY = Math.floor(size / 2);
  const entryPoint: [number, number] = [entryY, 1];
  const transitionToPrevious: [number, number] = [entryY, 0];
  tiles[entryY][0] = FLOOR;
  subtypes[entryY][0] = [TileSubtype.ROOM_TRANSITION];

  const entryFromNext: [number, number] = [entryY, 2];

  const entranceTorches: Array<[number, number]> = [
    [entryY - 1, 1],
    [entryY + 1, 1],
  ];
  for (const [ty, tx] of entranceTorches) {
    if (ty > 0 && ty < size - 1) {
      subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
    }
  }

  const npcY = entryY;
  const npcX = size - 2;
  const coiledSnake = new NPC({
    id: "npc-bluff-coiled-snake",
    name: "Coiled Snake",
    sprite: "/images/enemies/snake-coiled-right.png",
    y: npcY,
    x: npcX,
    facing: Direction.LEFT,
    canMove: false,
    interactionHooks: [
      {
        id: "coiled-snake-greeting",
        type: "dialogue",
        description: "Speak with the coiled snake",
        payload: { dialogueId: "bluff-coiled-snake" },
      },
    ],
    actions: ["talk"],
  });

  const enemies: Enemy[] = [];
  const snakePositions: Array<[number, number]> = [];
  for (let y = 1; y < size - 1 && snakePositions.length < 30; y++) {
    for (let x = 1; x < size - 1 && snakePositions.length < 30; x++) {
      if (x <= 2) continue;
      if (
        (y === entryPoint[0] && x <= entryPoint[1] + 2) ||
        (y === npcY && x === npcX)
      ) {
        continue;
      }
      snakePositions.push([y, x]);
    }
  }

  for (let i = 0; i < 30 && i < snakePositions.length; i++) {
    const [y, x] = snakePositions[i];
    if (tiles[y]?.[x] === FLOOR) {
      const snake = new Enemy({ y, x });
      snake.kind = "snake";
      enemies.push(snake);
    }
  }

  return {
    id: "story-bluff-serpent-den" as RoomId,
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    enemies,
    npcs: [coiledSnake],
  };
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

type StoryRoomLink = {
  roomId: RoomId;
  position: [number, number];
  targetEntryPoint?: [number, number];
  returnEntryPoint?: [number, number];
};

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
  metadata?: Record<string, unknown>;
  otherTransitions?: StoryRoomLink[];
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

  // No mentor in the entrance hall; elder is placed outside in the clearing
  const npcs: NPC[] = [];

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

  const checkpointY = Math.max(1, entryPoint[0] - 7);
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

  const torchTownTransition: [number, number] = [0, width - 2];
  tiles[torchTownTransition[0]][torchTownTransition[1]] = FLOOR;
  subtypes[torchTownTransition[0]][torchTownTransition[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];
  const torchTownReturn: [number, number] = [
    Math.min(height - 2, torchTownTransition[0] + 1),
    torchTownTransition[1],
  ];
  if (tiles[torchTownReturn[0]]?.[torchTownReturn[1]] === WALL) {
    tiles[torchTownReturn[0]][torchTownReturn[1]] = FLOOR;
    subtypes[torchTownReturn[0]][torchTownReturn[1]] = [];
  }

  // Place Elder Rowan just outside the cave entrance: 3 tiles up and 3 to the right of the mouth
  const elderY = Math.max(1, entryPoint[0] - 3);
  const elderX = Math.min(width - 2, entryPoint[1] + 3);
  const elder = new NPC({
    id: "npc-elder-rowan",
    name: "Elder Rowan",
    sprite: "/images/npcs/boy-1.png",
    y: elderY,
    x: elderX,
    facing: Direction.DOWN,
    canMove: false,
    memory: {
      metHero: false,
    },
    interactionHooks: [
      {
        id: "elder-rowan-greet",
        type: "dialogue",
        description: "Greet the elder",
        payload: {
          dialogueId: "elder-rowan-intro",
        },
      },
    ],
    actions: ["greet"],
    metadata: {
      archetype: "mentor",
    },
  });

  const npcs: NPC[] = [elder];

  // Carve an opening at the left wall ~3 tiles down from top to lead to the bluff passageway
  if (tiles[3]?.[0] !== undefined) {
    tiles[3][0] = FLOOR;
    subtypes[3][0] = [TileSubtype.ROOM_TRANSITION];
  }

  return {
    id: "story-outdoor-clearing",
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    transitionToPrevious,
    entryFromNext: [exteriorDoorY, doorX],
    transitionToNext: [doorY, doorX],
    otherTransitions: [
      {
        roomId: "story-torch-town" as RoomId,
        position: torchTownTransition,
        returnEntryPoint: torchTownReturn,
      },
      // Opening on the left wall near the top leading to the bluff passageway
      {
        roomId: "story-bluff-passage" as RoomId,
        position: [3, 0],
        returnEntryPoint: [4, 1],
      },
    ],
    npcs,
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
        id: "lysa-intro",
        type: "dialogue",
        description: "Hear Lysa's introduction",
        payload: {
          dialogueId: "caretaker-lysa-intro",
        },
      },
      // {
      //   id: "lysa-chat",
      //   type: "dialogue",
      //   description: "Listen to Lysa's song",
      //   payload: {
      //     dialogueId: "caretaker-lysa-default",
      //   },
      // },

      // {
      //   id: "lysa-rest",
      //   type: "custom",
      //   description: "Request a moment of rest",
      //   payload: {
      //     action: "rest",
      //   },
      // },
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

function buildTorchTown(): StoryRoom {
  const SIZE = 35;
  // Initialize as walls so nothing outside the city walls renders as grass
  const tiles: number[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );

  const ensureSubtype = (y: number, x: number, subtype: TileSubtype) => {
    const cell = subtypes[y][x] ?? [];
    if (!cell.includes(subtype)) {
      subtypes[y][x] = [...cell, subtype];
    }
  };

  const grassMargin = 2;
  const wallThickness = 2;
  const wallMin = grassMargin;
  const wallMax = SIZE - grassMargin - 1;

  for (let layer = 0; layer < wallThickness; layer++) {
    const top = wallMin + layer;
    const bottom = wallMax - layer;
    for (let x = wallMin; x <= wallMax; x++) {
      tiles[top][x] = WALL;
      subtypes[top][x] = [];
      tiles[bottom][x] = WALL;
      subtypes[bottom][x] = [];
    }
    for (let y = wallMin; y <= wallMax; y++) {
      const left = wallMin + layer;
      const right = wallMax - layer;
      tiles[y][left] = WALL;
      subtypes[y][left] = [];
      tiles[y][right] = WALL;
      subtypes[y][right] = [];
    }
  }

  // Carve interior floor inside the double walls
  for (let y = wallMin + wallThickness; y <= wallMax - wallThickness; y++) {
    for (let x = wallMin + wallThickness; x <= wallMax - wallThickness; x++) {
      tiles[y][x] = FLOOR;
      if (!subtypes[y][x]) subtypes[y][x] = [];
    }
  }

  // Bottom-left entrance opening with a short corridor
  const entryColumn = wallMin + 1;
  const transitionRow = SIZE - 1;
  const corridorRows = [
    wallMax - 2, // need one tile of space for the entrance into the town
    wallMax - 1,
    wallMax,
    transitionRow - 1,
    transitionRow,
  ];
  for (const row of corridorRows) {
    if (tiles[row]?.[entryColumn] !== undefined) {
      tiles[row][entryColumn] = FLOOR;
      subtypes[row][entryColumn] = [];
    }
  }
  const spawnRow = transitionRow - 1; // just inside the map at the bottom of the corridor
  ensureSubtype(transitionRow, entryColumn, TileSubtype.ROOM_TRANSITION);

  const entryPoint: [number, number] = [spawnRow, entryColumn];
  const transitionToPrevious: [number, number] = [transitionRow, entryColumn];
  const entryFromNext: [number, number] = [entryPoint[0], entryPoint[1]];

  const buildStructure = (
    top: number,
    left: number,
    width: number,
    height: number
  ): [number, number] => {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        tiles[y][x] = WALL;
        subtypes[y][x] = [];
      }
    }
    const doorRow = top + height - 1;
    const doorCol = left + Math.floor(width / 2);
    // Mark building door as both a door and a room transition entry point
    subtypes[doorRow][doorCol] = [
      TileSubtype.DOOR,
      TileSubtype.ROOM_TRANSITION,
    ];

    return [doorRow, doorCol];
  };

  const innerMin = wallMin + wallThickness;
  const innerMax = wallMax - wallThickness;

  // Central plaza checkpoint roughly in the middle of the inner area
  const centerY = Math.floor((innerMin + innerMax) / 2);
  const centerX = Math.floor((innerMin + innerMax) / 2);
  if (tiles[centerY]?.[centerX] === FLOOR) {
    subtypes[centerY][centerX] = [TileSubtype.CHECKPOINT];
  }

  // Library: taller building, placed near upper third
  const libraryWidth = 3;
  const libraryHeight = 5;
  const libraryTop =
    innerMin + Math.max(2, Math.floor((innerMax - innerMin) / 6));
  const libraryLeft =
    innerMin + Math.floor((innerMax - innerMin - libraryWidth) / 2);
  const libraryDoor = buildStructure(
    libraryTop,
    libraryLeft,
    libraryWidth,
    libraryHeight
  );

  // Store: shorter building, placed below library with more spacing
  const storeWidth = 3;
  const storeHeight = 3;
  const storeTop = Math.min(
    innerMax - storeHeight - 2,
    libraryTop + libraryHeight + 8
  );
  const storeLeft = libraryLeft;
  const storeDoor = buildStructure(
    storeTop,
    storeLeft,
    storeWidth,
    storeHeight
  );

  const homeLastNames = [
    "Ashwood",
    "Brightfield",
    "Cindercrest",
    "Dawnhollow",
    "Emberline",
    "Frostvale",
    "Glimmerstone",
    "Highridge",
    "Ironwood",
    "Juniperfell",
  ];
  const homeAssignments: Record<string, string> = {};
  const homeWidth = 3;
  const homeHeight = 2;
  // Helper: check if a rectangular area is clear floor (no overlaps)
  const isAreaFree = (top: number, left: number, w: number, h: number) => {
    for (let y = top; y < top + h; y++) {
      for (let x = left; x < left + w; x++) {
        if (y < innerMin || y > innerMax || x < innerMin || x > innerMax)
          return false;
        if (tiles[y]?.[x] !== FLOOR) return false; // something already occupies this spot
      }
    }
    return true;
  };
  // Base rows (structured), then apply small jitter so they aren't in straight lines
  const baseRows: number[] = [];
  for (let y = innerMin + 4; y <= innerMax - homeHeight - 4; y += 5)
    baseRows.push(y);
  const leftColBase = innerMin + 3;
  const rightColBase = innerMax - homeWidth - 3;

  const jitter = (range: number) =>
    Math.floor(Math.random() * (2 * range + 1)) - range;
  const candidates: Array<{ top: number; left: number }> = [];
  for (const baseTop of baseRows) {
    // Left column home
    candidates.push({ top: baseTop, left: leftColBase });
    // Right column home
    candidates.push({ top: baseTop, left: rightColBase });
  }

  const homesToPlace = Math.min(10, homeLastNames.length);
  let homesPlaced = 0;
  for (const base of candidates) {
    if (homesPlaced >= homesToPlace) break;
    // Apply small jitter (±2 tiles) and clamp inside bounds
    const dy = jitter(2);
    const dx = jitter(2);
    let top = Math.max(
      innerMin + 2,
      Math.min(innerMax - homeHeight - 2, base.top + dy)
    );
    let left = Math.max(
      innerMin + 2,
      Math.min(innerMax - homeWidth - 2, base.left + dx)
    );
    // Keep a little breathing room from the center plaza
    const tooCloseToCenter =
      Math.abs(top - centerY) <= 2 && Math.abs(left - centerX) <= 2;
    if (tooCloseToCenter) continue;
    if (!isAreaFree(top, left, homeWidth, homeHeight)) {
      // Try a couple nearby fallbacks without randomness explosion
      const fallbackSpots: Array<[number, number]> = [
        [top, left + 1],
        [top, left - 1],
        [top + 1, left],
        [top - 1, left],
      ];
      let placed = false;
      for (const [fy, fx] of fallbackSpots) {
        if (
          fy >= innerMin + 2 &&
          fy <= innerMax - homeHeight - 2 &&
          fx >= innerMin + 2 &&
          fx <= innerMax - homeWidth - 2 &&
          !(Math.abs(fy - centerY) <= 2 && Math.abs(fx - centerX) <= 2) &&
          isAreaFree(fy, fx, homeWidth, homeHeight)
        ) {
          top = fy;
          left = fx;
          placed = true;
          break;
        }
      }
      if (!placed) continue;
    }
    const door = buildStructure(top, left, homeWidth, homeHeight);
    homeAssignments[`${door[0]},${door[1]}`] =
      homeLastNames[homesPlaced] ?? `Family ${homesPlaced + 1}`;
    homesPlaced++;
  }

  return {
    id: "story-torch-town",
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    metadata: {
      homes: homeAssignments,
      buildings: {
        libraryDoor,
        librarySize: [libraryWidth, libraryHeight],
        storeDoor,
        storeSize: [storeWidth, storeHeight],
        homeSize: [homeWidth, homeHeight],
      },
    },
  };
}

export function buildStoryModeState(): GameState {
  const entrance = buildEntranceHall();
  const ascent = buildAscentCorridor();
  const sanctum = buildSanctum();
  const outdoor = buildOutdoorWorld();
  const outdoorHouse = buildOutdoorHouse();
  const torchTown = buildTorchTown();
  const bluffPassage = buildBluffPassageway();
  const bluffCaves = buildBluffCaves();
  const bluffSerpentDen = buildBluffSerpentDen();

  // Generic interior room builder: produces an enclosed room with floor size (wOut*2-1) x (hOut*2-1)
  const buildInteriorRoom = (
    id: RoomId,
    outWidth: number,
    outHeight: number,
    environment: EnvironmentId
  ): StoryRoom => {
    const innerW = outWidth * 2 - 1;
    const innerH = outHeight * 2 - 1;
    const width = innerW + 2; // walls border
    const height = innerH + 2;
    const tiles: number[][] = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => WALL)
    );
    const subtypes: number[][][] = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => [] as number[])
    );
    // carve floor
    for (let y = 1; y <= innerH; y++) {
      for (let x = 1; x <= innerW; x++) {
        tiles[y][x] = FLOOR;
      }
    }
    // interior windows on top wall for flavor
    if (width >= 6) {
      const winCols = [2, width - 3];
      for (const wx of winCols) {
        if (tiles[0]?.[wx] === WALL) {
          subtypes[0][wx] = [TileSubtype.WINDOW];
        }
      }
    }
    // door back to town at bottom middle
    const doorX = 1 + Math.floor(innerW / 2);
    const entryPoint: [number, number] = [innerH, doorX];
    const transitionToPrevious: [number, number] = [innerH + 1, doorX];
    subtypes[transitionToPrevious[0]][transitionToPrevious[1]] = [
      TileSubtype.DOOR,
      TileSubtype.ROOM_TRANSITION,
    ];
    const entryFromNext: [number, number] = [innerH - 1, doorX];

    return {
      id,
      mapData: { tiles, subtypes, environment },
      entryPoint,
      transitionToPrevious,
      entryFromNext,
    };
  };

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

  if (outdoor.otherTransitions) {
    for (const link of outdoor.otherTransitions) {
      if (link.roomId !== torchTown.id) continue;
      pushTransition(
        outdoor.id,
        link.roomId,
        link.position,
        link.targetEntryPoint ?? torchTown.entryFromNext ?? torchTown.entryPoint
      );
      if (torchTown.transitionToPrevious) {
        pushTransition(
          torchTown.id,
          outdoor.id,
          torchTown.transitionToPrevious,
          link.returnEntryPoint ?? outdoor.entryPoint
        );
      }
    }
  }

  // Outdoor -> Bluff Passageway transitions
  pushTransition(
    outdoor.id,
    bluffPassage.id,
    [3, 0],
    bluffPassage.entryPoint
  );
  pushTransition(
    bluffPassage.id,
    outdoor.id,
    bluffPassage.transitionToPrevious!,
    [4, 1]
  );

  pushTransition(
    bluffPassage.id,
    bluffCaves.id,
    [1, 1],
    bluffCaves.entryPoint
  );
  pushTransition(
    bluffCaves.id,
    bluffPassage.id,
    bluffCaves.transitionToPrevious!,
    [1, 2]
  );
  pushTransition(
    bluffCaves.id,
    bluffSerpentDen.id,
    bluffCaves.transitionToNext!,
    bluffSerpentDen.entryPoint
  );
  pushTransition(
    bluffSerpentDen.id,
    bluffCaves.id,
    bluffSerpentDen.transitionToPrevious!,
    bluffCaves.entryFromNext ?? bluffCaves.entryPoint
  );

  // Build Torch Town interior rooms and transitions
  const extraRooms: StoryRoom[] = [];
  const torchTownBuildings = torchTown.metadata?.buildings as
    | {
        libraryDoor: [number, number];
        librarySize: [number, number];
        storeDoor: [number, number];
        storeSize: [number, number];
        homeSize: [number, number];
      }
    | undefined;
  const torchTownHomes =
    (torchTown.metadata?.homes as Record<string, string>) || {};

  if (torchTownBuildings) {
    // Library interior (environment uses 'house' palette for now)
    const libraryRoom = buildInteriorRoom(
      "story-torch-town-library" as RoomId,
      torchTownBuildings.librarySize[0],
      torchTownBuildings.librarySize[1],
      "house"
    );
    // Place the town librarian inside the library
    const libNpcY = Math.max(2, libraryRoom.entryPoint[0] - 2);
    const libNpcX = libraryRoom.entryPoint[1];
    const librarian = new NPC({
      id: "npc-librarian",
      name: "Town Librarian",
      sprite: "/images/npcs/boy-2.png",
      y: libNpcY,
      x: libNpcX,
      facing: Direction.DOWN,
      canMove: false,
      interactionHooks: [
        {
          id: "librarian-greet",
          type: "dialogue",
          description: "Greet the librarian",
          payload: {
            dialogueId: "town-librarian-default",
          },
        },
      ],
      actions: ["talk"],
      metadata: { archetype: "librarian" },
    });
    libraryRoom.npcs = [librarian];
    extraRooms.push(libraryRoom);
    pushTransition(
      torchTown.id,
      libraryRoom.id,
      torchTownBuildings.libraryDoor,
      libraryRoom.entryPoint
    );
    // Land outside the library door when exiting interior
    const libExitTarget: [number, number] = [
      torchTownBuildings.libraryDoor[0] + 1,
      torchTownBuildings.libraryDoor[1],
    ];
    pushTransition(
      libraryRoom.id,
      torchTown.id,
      libraryRoom.transitionToPrevious!,
      libExitTarget
    );

    // Store interior
    const storeRoom = buildInteriorRoom(
      "story-torch-town-store" as RoomId,
      torchTownBuildings.storeSize[0],
      torchTownBuildings.storeSize[1],
      "house"
    );
    extraRooms.push(storeRoom);
    pushTransition(
      torchTown.id,
      storeRoom.id,
      torchTownBuildings.storeDoor,
      storeRoom.entryPoint
    );
    // Land outside the store door when exiting interior
    const storeExitTarget: [number, number] = [
      torchTownBuildings.storeDoor[0] + 1,
      torchTownBuildings.storeDoor[1],
    ];
    pushTransition(
      storeRoom.id,
      torchTown.id,
      storeRoom.transitionToPrevious!,
      storeExitTarget
    );

    // Homes interiors
    const [homeW, homeH] = torchTownBuildings.homeSize;
    let homeIdx = 0;
    for (const key of Object.keys(torchTownHomes)) {
      const [yStr, xStr] = key.split(",");
      const doorPos: [number, number] = [
        parseInt(yStr, 10),
        parseInt(xStr, 10),
      ];
      const homeId = `story-torch-town-home-${homeIdx}` as RoomId;
      const homeRoom = buildInteriorRoom(homeId, homeW, homeH, "house");
      extraRooms.push(homeRoom);
      pushTransition(torchTown.id, homeRoom.id, doorPos, homeRoom.entryPoint);
      // Land outside each home door when exiting interior
      const homeExitTarget: [number, number] = [doorPos[0] + 1, doorPos[1]];
      pushTransition(
        homeRoom.id,
        torchTown.id,
        homeRoom.transitionToPrevious!,
        homeExitTarget
      );
      homeIdx += 1;
    }
  }

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

  const storyRooms: StoryRoom[] = [
    entrance,
    ascent,
    sanctum,
    outdoor,
    bluffPassage,
    bluffCaves,
    bluffSerpentDen,
    outdoorHouse,
    torchTown,
    ...extraRooms,
  ];

  const roomSnapshots: GameState["rooms"] = {};
  for (const room of storyRooms) {
    roomSnapshots[room.id] = {
      mapData: withoutPlayer(room.mapData),
      entryPoint: room.entryPoint,
      enemies: serializeEnemies(room.enemies),
      npcs: serializeNPCs(room.npcs),
      potOverrides: room.potOverrides,
      metadata: room.metadata
        ? (JSON.parse(JSON.stringify(room.metadata)) as Record<string, unknown>)
        : undefined,
    };
  }

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
    diaryEntries: [],
  };

  return gameState;
}

const STORY_ROOM_LABELS: Partial<Record<RoomId, string>> = {
  "story-hall-entrance": "Entrance Hall",
  "story-ascent": "Ascent Corridor",
  "story-sanctum": "Sanctum",
  "story-outdoor-clearing": "Outdoor Clearing",
  "story-outdoor-house": "Caretaker's House",
  "story-torch-town": "Torch Town",
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
    checkpoints.forEach((pos, idx) =>
      pushOption(roomId, pos, "checkpoint", idx)
    );
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
  state.storyFlags = createInitialStoryFlags();
  state.diaryEntries = [];
}

export function buildStoryStateFromConfig(config: StoryResetConfig): GameState {
  const state = buildStoryModeState();
  applyStoryResetConfig(state, config);
  state.lastCheckpoint = createCheckpointSnapshot(state);
  return state;
}
