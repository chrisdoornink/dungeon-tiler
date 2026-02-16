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

  // Entry point in the center
  const entryPoint: [number, number] = [Math.floor(height / 2), Math.floor(width / 2)];

  // Place 6 goblins around the edges, spread out
  const enemies: Enemy[] = [];
  
  // Top edge - 2 goblins
  enemies.push(new Enemy({ y: 2, x: 5 }));
  enemies.push(new Enemy({ y: 2, x: 16 }));
  
  // Right edge - 1 goblin
  enemies.push(new Enemy({ y: 11, x: 19 }));
  
  // Bottom edge - 2 goblins
  enemies.push(new Enemy({ y: 19, x: 5 }));
  enemies.push(new Enemy({ y: 19, x: 16 }));
  
  // Left edge - 1 goblin
  enemies.push(new Enemy({ y: 11, x: 2 }));

  // All enemies are goblins by default
  enemies.forEach(e => {
    e.kind = 'goblin';
  });

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
