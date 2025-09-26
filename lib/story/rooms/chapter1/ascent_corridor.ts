import { FLOOR, WALL, TileSubtype } from "../../../map";
import type { StoryRoom } from "../types";

export function buildAscentCorridor(): StoryRoom {
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

