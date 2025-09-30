import { FLOOR, WALL, TileSubtype, Direction } from "../../../map";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildOutdoorHouse(): StoryRoom {
  const SIZE = 5;
  const tiles: number[][] = Array.from({ length: SIZE + 2 }, () =>
    Array.from({ length: SIZE + 2 }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: SIZE + 2 }, () =>
    Array.from({ length: SIZE + 2 }, () => [] as number[])
  );

  for (let y = 1; y <= SIZE; y++) {
    for (let x = 1; x <= SIZE; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const doorCol = Math.floor(SIZE / 2) + 1;
  const entryPoint: [number, number] = [SIZE, doorCol];
  const transitionToPrevious: [number, number] = [SIZE + 1, doorCol];
  subtypes[transitionToPrevious[0]][transitionToPrevious[1]] = [
    TileSubtype.DOOR,
    TileSubtype.ROOM_TRANSITION,
  ];
  const entryFromNext: [number, number] = [SIZE - 1, doorCol];

  const windowCols = [2, SIZE - 1];
  for (const col of windowCols) {
    const wallCol = col;
    if (tiles[0]?.[wallCol] === WALL) {
      subtypes[0][wallCol] = [TileSubtype.WINDOW];
    }
  }

  const cornerTorches: Array<[number, number]> = [
    [1, 1],
    [1, SIZE],
    [SIZE, 1],
    [SIZE, SIZE],
  ];
  for (const [ty, tx] of cornerTorches) {
    if (tiles[ty]?.[tx] === FLOOR) {
      subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
    }
  }

  const caretaker = new NPC({
    id: "npc-grounds-caretaker",
    name: "Caretaker Lysa",
    sprite: "/images/npcs/girl-1.png",
    y: Math.max(2, Math.floor(SIZE / 2)),
    x: Math.max(2, Math.floor(SIZE / 2)),
    facing: Direction.DOWN,
    canMove: false,
    memory: {
      sharedStories: 0,
      restingSpotUnlocked: false,
    },
    interactionHooks: [
      {
        id: "lysa-intro",
        type: "dialogue",
        description: "Hear Lysa's introduction",
        payload: {
          dialogueId: "caretaker-lysa-intro",
        },
      },
    ],
    actions: ["talk", "rest"],
    metadata: {
      archetype: "caretaker",
    },
  });
  const npcs = [caretaker];

  return {
    id: "story-outdoor-house",
    mapData: { tiles, subtypes, environment: "house" },
    entryPoint,
    transitionToPrevious,
    entryFromNext,
    npcs,
  };
}
