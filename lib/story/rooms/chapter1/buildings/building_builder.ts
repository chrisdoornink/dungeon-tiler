import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../../map";
import type { EnvironmentId } from "../../../../environment";
import type { StoryRoom } from "../../types";
import type { NPC } from "../../../../npc";

export interface BedPlacement {
  y: number;
  x: number;
  variant: 1 | 2 | 3 | 4; // Which bed style (1-4)
}

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
  npcs?: NPC[],
  beds?: BedPlacement[],
  torchTownDoorId?: string
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

  // Place beds if provided
  if (beds) {
    for (const bed of beds) {
      if (tiles[bed.y]?.[bed.x] === FLOOR) {
        const bedSubtype = TileSubtype[`BED_EMPTY_${bed.variant}` as keyof typeof TileSubtype] as TileSubtype;
        subtypes[bed.y][bed.x] = [bedSubtype];
      }
    }
  }

  return {
    id,
    mapData: { tiles, subtypes, environment },
    entryPoint,
    transitionToPrevious,
    entryFromNext,
    otherTransitions: torchTownDoorId ? [
      {
        id: 'exit', // Unique ID for this transition
        roomId: 'story-torch-town' as RoomId,
        position: transitionToPrevious,
        targetTransitionId: torchTownDoorId, // References the door ID in Torch Town (e.g., 'd1', 'd2')
        offsetY: -1, // Spawn 1 tile above the door (inside the building)
      },
    ] : undefined,
    npcs,
    metadata: {
      displayLabel,
      beds, // Store bed info for day/night switching
    },
  };
}
