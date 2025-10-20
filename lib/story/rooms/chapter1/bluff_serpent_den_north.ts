import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../map";
import { Enemy } from "../../../enemy";
import type { StoryRoom } from "../types";

export function buildBluffSerpentDenNorth(): StoryRoom {
  const id = "story-bluff-serpent-den-north" as RoomId;
  const height = 15;
  const width = 20;
  
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  // Create a serpent-filled chamber
  // Main chamber area
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Entry/Exit at bottom (bluff caves) - only way in and out
  const entryY = height - 1;
  const entryX = Math.floor(width / 2);
  tiles[entryY][entryX] = FLOOR;
  subtypes[entryY][entryX] = [TileSubtype.ROOM_TRANSITION];
  const entryPoint: [number, number] = [entryY - 1, entryX];
  
  // Additional exit at (13, 10) that also goes back to bluff caves
  tiles[13][10] = FLOOR;
  subtypes[13][10] = [TileSubtype.ROOM_TRANSITION];
  const transitionToPrevious: [number, number] = [entryY, entryX];

  // Add 5 lanterns scattered around the room
  const lanternPositions: Array<[number, number]> = [
    [3, 4],
    [3, width - 5],
    [height - 4, 4],
    [height - 4, width - 5],
    [Math.floor(height / 2), Math.floor(width / 2)],
  ];
  
  for (const [ly, lx] of lanternPositions) {
    if (tiles[ly]?.[lx] === FLOOR) {
      subtypes[ly][lx] = [TileSubtype.WALL_TORCH];
    }
  }

  // Add 10 snakes throughout the room
  const enemies: Enemy[] = [];
  const snakePositions: Array<[number, number]> = [
    [4, 5],
    [4, 10],
    [4, 15],
    [7, 4],
    [7, 9],
    [7, 14],
    [10, 6],
    [10, 11],
    [10, 16],
    [12, 9],
  ];

  for (const [y, x] of snakePositions) {
    if (tiles[y]?.[x] === FLOOR) {
      const snake = new Enemy({ y, x });
      snake.kind = "snake";
      enemies.push(snake);
    }
  }

  return {
    id,
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    transitionToPrevious,
    enemies,
    metadata: {
      displayLabel: "Serpent Den North",
    },
  };
}
