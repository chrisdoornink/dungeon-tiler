import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../../map";
import type { EnvironmentId } from "../../../../environment";
import type { StoryRoom } from "../../types";
import type { NPC } from "../../../../npc";

/**
 * Generic interior room builder for buildings.
 * Produces an enclosed room with floor size (outWidth*2-1) x (outHeight*2-1)
 */
export function buildBuildingInterior(
  id: RoomId,
  outWidth: number,
  outHeight: number,
  environment: EnvironmentId,
  displayLabel: string,
  npcs?: NPC[]
): StoryRoom {
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
    npcs,
    metadata: {
      displayLabel,
    },
  };
}
