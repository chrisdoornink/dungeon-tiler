import { FLOOR, WALL, TileSubtype } from "../../../map";
import { Enemy } from "../../../enemy";
import type { StoryRoom } from "../types";

export function buildSanctum(): StoryRoom {
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
