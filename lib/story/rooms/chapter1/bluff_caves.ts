import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../map";
import { Enemy } from "../../../enemy";
import type { StoryRoom } from "../types";

export function buildBluffCaves(): StoryRoom {
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

  // Pot with a potion reward at the end of the short top-left branch
  const potOverrides: Record<string, TileSubtype.FOOD | TileSubtype.MED> = {};
  const potionSpot: [number, number] = [6, 13];
  if (tiles[potionSpot[0]]?.[potionSpot[1]] === FLOOR) {
    subtypes[potionSpot[0]][potionSpot[1]] = [TileSubtype.POT];
    potOverrides[`${potionSpot[0]},${potionSpot[1]}`] = TileSubtype.MED; // guaranteed potion
  }

  return {
    id: "story-bluff-caves" as RoomId,
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    transitionToNext,
    enemies,
    potOverrides,
    metadata: {
      onRoomEnter: {
        effects: [{ eventId: "entered-bluff-cave", value: true }]
      }
    },
  };
}
