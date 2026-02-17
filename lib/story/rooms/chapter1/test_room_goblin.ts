import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../map";
import type { StoryRoom } from "../types";
import { Enemy } from "../../../enemy";

export function buildTestRoomGoblin(): StoryRoom {
  const ROOM_SIZE = 20;
  const height = ROOM_SIZE + 2; // +2 for walls
  const width = ROOM_SIZE + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  // Create floor area
  for (let y = 1; y <= ROOM_SIZE; y++) {
    for (let x = 1; x <= ROOM_SIZE; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Scatter a few small wall clusters for cover
  const wallPositions: Array<[number, number]> = [
    [5, 5], [5, 6],
    [8, 14], [9, 14],
    [14, 4], [14, 5],
    [10, 10],
    [17, 16], [17, 17],
  ];
  for (const [wy, wx] of wallPositions) {
    tiles[wy][wx] = WALL;
  }

  // Entry point in the center
  const entryPoint: [number, number] = [Math.floor(height / 2), Math.floor(width / 2)];

  // Single pink goblin for testing
  const enemies: Enemy[] = [];
  const pg = new Enemy({ y: 4, x: 15 });
  pg.kind = 'pink-goblin';
  enemies.push(pg);

  // Add some wall torches for visibility
  const torchPositions: Array<[number, number]> = [
    [0, 5],   // Top wall
    [0, 16],  // Top wall
    [21, 5],  // Bottom wall
    [21, 16], // Bottom wall
  ];
  
  for (const [ty, tx] of torchPositions) {
    subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
  }

  return {
    id: "test-room-goblin" as RoomId,
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    enemies,
  };
}
