import { FLOOR, WALL, TileSubtype, Direction, type RoomId } from "../../../map";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildOutdoorClearing(): StoryRoom {
  const OUTER_WIDTH = 12;
  const OUTER_HEIGHT = 20;
  const width = OUTER_WIDTH + 2;
  const height = OUTER_HEIGHT + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y <= OUTER_HEIGHT; y++) {
    for (let x = 1; x <= OUTER_WIDTH; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryX = 1 + Math.floor((OUTER_WIDTH - 1) / 2);
  const entryY = height - 4;
  const bottomOpeningY = height - 1;
  tiles[bottomOpeningY][entryX] = FLOOR;
  subtypes[bottomOpeningY][entryX] = [TileSubtype.ROOM_TRANSITION];

  const entryPoint: [number, number] = [bottomOpeningY - 1, entryX];
  const transitionToPrevious: [number, number] = [bottomOpeningY, entryX];

  const checkpointY = Math.max(1, entryPoint[0] - 7);
  const checkpointX = entryPoint[1];
  if (tiles[checkpointY]?.[checkpointX] === FLOOR) {
    subtypes[checkpointY][checkpointX] = [TileSubtype.CHECKPOINT];
  }

  // Add small clusters of rocks to give the outdoor space some structure
  const featureSpots: Array<[number, number, number[]]> = [
    [entryY - 4, entryX - 4, [TileSubtype.ROCK]],
    [entryY - 6, entryX + 3, [TileSubtype.ROCK]],
    [entryY + 2, entryX - 3, [TileSubtype.ROCK]],
  ];
  for (const [fy, fx, values] of featureSpots) {
    if (tiles[fy]?.[fx] === FLOOR && subtypes[fy][fx].length === 0) {
      subtypes[fy][fx] = values.slice();
    }
  }

  const houseTopY = entryY - 12;
  const houseHeight = 3;
  const houseLeftX = OUTER_WIDTH - 4;

  for (let y = 0; y < houseHeight; y++) {
    const row = houseTopY + y;
    for (let x = 0; x < 3; x++) {
      const col = houseLeftX + x;
      if (tiles[row]?.[col] !== undefined) {
        tiles[row][col] = WALL;
        subtypes[row][col] = [];
      }
    }
  }

  const doorY = houseTopY + houseHeight - 1;
  const doorX = houseLeftX + 1;
  tiles[doorY][doorX] = WALL;
  subtypes[doorY][doorX] = [TileSubtype.DOOR, TileSubtype.ROOM_TRANSITION];

  const exteriorDoorY = doorY + 1;
  if (tiles[exteriorDoorY]?.[doorX] === WALL) {
    tiles[exteriorDoorY][doorX] = FLOOR;
    subtypes[exteriorDoorY][doorX] = [];
  }

  const torchTownTransition: [number, number] = [0, width - 2];
  tiles[torchTownTransition[0]][torchTownTransition[1]] = FLOOR;
  subtypes[torchTownTransition[0]][torchTownTransition[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];
  const torchTownReturn: [number, number] = [
    Math.min(height - 2, torchTownTransition[0] + 1),
    torchTownTransition[1],
  ];
  if (tiles[torchTownReturn[0]]?.[torchTownReturn[1]] === WALL) {
    tiles[torchTownReturn[0]][torchTownReturn[1]] = FLOOR;
    subtypes[torchTownReturn[0]][torchTownReturn[1]] = [];
  }

  // Place Elder Rowan just outside the cave entrance: 3 tiles up and 3 to the right of the mouth
  const elderY = Math.max(1, entryPoint[0] - 3);
  const elderX = Math.min(width - 2, entryPoint[1] + 3);
  const elder = new NPC({
    id: "npc-elder-rowan",
    name: "Elder Rowan",
    sprite: "/images/npcs/boy-1.png",
    y: elderY,
    x: elderX,
    facing: Direction.DOWN,
    canMove: false,
    memory: {
      metHero: false,
    },
    interactionHooks: [
      {
        id: "elder-rowan-greet",
        type: "dialogue",
        description: "Greet the elder",
        payload: {
          dialogueId: "elder-rowan-intro",
        },
      },
    ],
    actions: ["greet"],
    metadata: {
      archetype: "mentor",
    },
  });

  const npcs: NPC[] = [elder];

  // Carve an opening at the left wall ~3 tiles down from top to lead to the bluff passageway
  if (tiles[3]?.[0] !== undefined) {
    tiles[3][0] = FLOOR;
    subtypes[3][0] = [TileSubtype.ROOM_TRANSITION];
  }

  return {
    id: "story-outdoor-clearing",
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    transitionToPrevious,
    entryFromNext: [exteriorDoorY, doorX],
    transitionToNext: [doorY, doorX],
    otherTransitions: [
      {
        roomId: "story-torch-town" as RoomId,
        position: torchTownTransition,
        returnEntryPoint: torchTownReturn,
      },
      // Opening on the left wall near the top leading to the bluff passageway
      {
        roomId: "story-bluff-passage" as RoomId,
        position: [3, 0],
        returnEntryPoint: [4, 1],
      },
    ],
    npcs,
  };
}

