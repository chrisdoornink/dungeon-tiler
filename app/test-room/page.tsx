"use client";

import React, { Suspense } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  TileSubtype,
  type GameState,
  type MapData,
  Direction,
} from "../../lib/map";

const MAP_SIZE = 25;
const FLOOR = 0;
const WALL = 1;
const ROOM_ONE_ID = "test-room-1";
const ROOM_TWO_ID = "test-room-2";

type BuiltRoom = {
  mapData: MapData;
  snapshot: MapData;
  entryPoint: [number, number];
  transitionPosition: [number, number];
  returnPoint?: [number, number];
};

const cloneMap = (mapData: MapData): MapData =>
  JSON.parse(JSON.stringify(mapData)) as MapData;

function createRoomOne(): BuiltRoom {
  const ROOM = 10;
  const tiles: number[][] = Array.from({ length: MAP_SIZE }, () =>
    Array.from({ length: MAP_SIZE }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: MAP_SIZE }, () =>
    Array.from({ length: MAP_SIZE }, () => [])
  );

  const start = Math.floor((MAP_SIZE - ROOM) / 2);
  const end = start + ROOM - 1;

  for (let y = start; y <= end; y++) {
    for (let x = start; x <= end; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const borderPositions: Array<[number, number]> = [];
  for (let x = start; x <= end; x++) {
    borderPositions.push([start, x]);
    borderPositions.push([end, x]);
  }
  for (let y = start + 1; y < end; y++) {
    borderPositions.push([y, start]);
    borderPositions.push([y, end]);
  }

  const cycle = [TileSubtype.CHEST, TileSubtype.POT, TileSubtype.ROCK];
  let chestIdx = 0;
  for (let i = 0; i < borderPositions.length; i++) {
    const [y, x] = borderPositions[i];
    const subtype = cycle[i % cycle.length];
    if (subtype === TileSubtype.CHEST) {
      const content =
        chestIdx % 2 === 0 ? TileSubtype.SWORD : TileSubtype.SHIELD;
      subtypes[y][x] = [TileSubtype.CHEST, content];
      chestIdx++;
    } else if (subtype === TileSubtype.POT) {
      subtypes[y][x] = [TileSubtype.POT];
    } else {
      subtypes[y][x] = [TileSubtype.ROCK];
    }
  }

  const centerY = Math.floor((start + end) / 2);
  const centerX = Math.floor((start + end) / 2);

  const doorwayY = centerY;
  const doorwayXInside = end;
  subtypes[doorwayY][doorwayXInside] = [];
  if (doorwayY - 1 >= start) {
    subtypes[doorwayY - 1][doorwayXInside] = [];
  }
  if (doorwayY + 1 <= end) {
    subtypes[doorwayY + 1][doorwayXInside] = [];
  }

  for (let offset = 1; offset <= 3; offset++) {
    tiles[doorwayY][doorwayXInside + offset] = FLOOR;
  }
  tiles[doorwayY - 1][doorwayXInside + 1] = FLOOR;
  tiles[doorwayY + 1][doorwayXInside + 1] = FLOOR;

  const transitionPosition: [number, number] = [doorwayY, doorwayXInside + 1];
  subtypes[transitionPosition[0]][transitionPosition[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const mapData: MapData = { tiles, subtypes } as MapData;
  const snapshot = cloneMap(mapData);

  subtypes[centerY][centerX] = [TileSubtype.PLAYER];

  return {
    mapData,
    snapshot,
    entryPoint: [centerY, centerX],
    transitionPosition,
    returnPoint: [doorwayY, doorwayXInside],
  };
}

function createRoomTwo(): BuiltRoom {
  const ROOM = 9;
  const tiles: number[][] = Array.from({ length: MAP_SIZE }, () =>
    Array.from({ length: MAP_SIZE }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: MAP_SIZE }, () =>
    Array.from({ length: MAP_SIZE }, () => [])
  );

  const start = Math.floor((MAP_SIZE - ROOM) / 2);
  const end = start + ROOM - 1;

  for (let y = start; y <= end; y++) {
    for (let x = start; x <= end; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryY = Math.floor((start + end) / 2);
  const entryX = start + 1;

  tiles[entryY][start - 1] = FLOOR;
  tiles[entryY][start - 2] = FLOOR;
  tiles[entryY - 1][start - 1] = FLOOR;
  tiles[entryY + 1][start - 1] = FLOOR;

  const transitionPosition: [number, number] = [entryY, start];
  subtypes[transitionPosition[0]][transitionPosition[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const accents: Array<[number, number, number[]]> = [
    [entryY, end - 2, [TileSubtype.ROCK]],
    [entryY - 2, entryX + 3, [TileSubtype.CHEST, TileSubtype.SHIELD]],
    [entryY + 2, entryX + 3, [TileSubtype.POT]],
  ];
  for (const [y, x, values] of accents) {
    if (
      y >= start &&
      y <= end &&
      x >= start &&
      x <= end &&
      subtypes[y][x].length === 0
    ) {
      subtypes[y][x] = values.slice();
    }
  }

  const torchRow = start - 1;
  if (torchRow >= 0) {
    const torchCols = [entryX + 1, entryX + 4, entryX + 7].filter(
      (col) => col < MAP_SIZE
    );
    for (const col of torchCols) {
      if (tiles[torchRow + 1]?.[col] === FLOOR) {
        subtypes[torchRow][col] = [TileSubtype.WALL_TORCH];
      }
    }
  }

  const mapData: MapData = { tiles, subtypes } as MapData;
  const snapshot = cloneMap(mapData);

  return {
    mapData,
    snapshot,
    entryPoint: [entryY, entryX],
    transitionPosition,
  };
}

function buildTestRoom(): GameState {
  const firstRoom = createRoomOne();
  const secondRoom = createRoomTwo();

  const rooms: GameState["rooms"] = {
    [ROOM_ONE_ID]: {
      mapData: cloneMap(firstRoom.snapshot),
      entryPoint: firstRoom.entryPoint,
    },
    [ROOM_TWO_ID]: {
      mapData: cloneMap(secondRoom.snapshot),
      entryPoint: secondRoom.entryPoint,
    },
  };

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [],
    heroHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
    },
    mapData: firstRoom.mapData,
    recentDeaths: [],
    rooms,
    currentRoomId: ROOM_ONE_ID,
    roomTransitions: [
      {
        from: ROOM_ONE_ID,
        to: ROOM_TWO_ID,
        position: firstRoom.transitionPosition,
      },
      {
        from: ROOM_TWO_ID,
        to: ROOM_ONE_ID,
        position: secondRoom.transitionPosition,
        targetEntryPoint: firstRoom.returnPoint ?? firstRoom.entryPoint,
      },
    ],
  };

  return gameState;
}

function TestRoomInner() {
  const initialState = buildTestRoom();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto"
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
      <div className="relative z-10">
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
        />
      </div>
    </div>
  );
}

export default function TestRoomPage() {
  return (
    <Suspense fallback={null}>
      <TestRoomInner />
    </Suspense>
  );
}
