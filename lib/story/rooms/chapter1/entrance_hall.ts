import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../map";
import type { StoryRoom, StoryRoomLink } from "../types";
import type { NPC } from "../../../npc";

export function buildEntranceHall(): StoryRoom {
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

  // Keep tiles at (1,1) and (3,1) as walls
  tiles[1][1] = WALL;
  tiles[3][1] = WALL;

  const midRow = 1 + Math.floor(HALL_WIDTH / 2);
  const entryPoint: [number, number] = [midRow, 2];
  const returnEntryPoint: [number, number] = [
    midRow,
    Math.max(2, HALL_LENGTH - 1),
  ];
  const leftWallX = 0;
  for (let y = 1; y <= HALL_WIDTH; y++) {
    tiles[y][leftWallX] = FLOOR;
    subtypes[y][leftWallX] = [];
  }
  // Keep tiles at (1,0) and (3,0) as walls
  tiles[1][0] = WALL;
  tiles[3][0] = WALL;
  const depthsTransition: [number, number] = [midRow, leftWallX];
  subtypes[depthsTransition[0]][depthsTransition[1]] = [
    TileSubtype.ROOM_TRANSITION,
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
    [1, Math.max(3, Math.floor(width / 4))], // Left
    [3, 16], // Right
  ];
  for (const [py, px] of potPositions) {
    if (tiles[py]?.[px] === FLOOR) {
      subtypes[py][px] = [TileSubtype.POT];
      potOverrides[`${py},${px}`] = TileSubtype.FOOD;
    }
  }

  // No mentor in the entrance hall; elder is placed outside in the clearing
  const npcs: NPC[] = [];

  const otherTransitions: StoryRoomLink[] = [
    {
      id: "depths-entry",
      roomId: "story-depths-despair-1" as RoomId,
      position: depthsTransition,
      targetTransitionId: "0",
    },
  ];

  return {
    id: "story-hall-entrance",
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    returnEntryPoint,
    transitionToNext,
    potOverrides,
    npcs,
    otherTransitions,
  };
}

