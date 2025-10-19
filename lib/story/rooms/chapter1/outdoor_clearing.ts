import { FLOOR, WALL, ROOF, FLOWERS, TileSubtype, Direction, type RoomId } from "../../../map";
import {
  placeStraight,
  placeCorner,
  placeT,
  layStraightBetween,
  layManhattan,
} from "../../../map/roads";
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

  const roadJunctionY = Math.max(1, entryPoint[0] - 7);
  const roadJunctionX = entryPoint[1];
  const checkpointY = 11;
  const checkpointX = 7;
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

  // Add ~5 more rocks randomly on empty floor tiles (non-blocking variety)
  {
    const want = 5;
    let placed = 0;
    const rand = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;
    for (let attempts = 0; attempts < 500 && placed < want; attempts++) {
      const y = rand(1, height - 2);
      const x = rand(1, width - 2);
      if (tiles[y][x] !== FLOOR) continue;
      if (subtypes[y][x].length > 0) continue; // keep clear of other features/NPCs/etc
      subtypes[y][x] = [TileSubtype.ROCK];
      placed++;
    }
  }

  // Place flower tiles at specific coordinates
  const flowerCoords: Array<[number, number]> = [
    [14, 2],
    [13, 2],
    [12, 2],
    [13, 3],
    [12, 3],
    [8, 11],
    [7, 11],
  ];
  for (const [y, x] of flowerCoords) {
    if (tiles[y]?.[x] !== undefined) {
      tiles[y][x] = FLOWERS;
      subtypes[y][x] = [];
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
        // Front wall (highest y value, furthest south) stays as WALL
        // All other walls become ROOF tiles
        const isFrontWall = y === houseHeight - 1;
        tiles[row][col] = isFrontWall ? WALL : ROOF;
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

  // Add Kalen outside the sanctum when he's been rescued
  const kalenY = Math.max(1, entryPoint[0] - 5);
  const kalenX = Math.max(1, entryPoint[1] - 2);
  const kalen = new NPC({
    id: "npc-sanctum-boy",
    name: "Kalen",
    sprite: "/images/npcs/boy-3.png",
    y: kalenY,
    x: kalenX,
    facing: Direction.DOWN,
    canMove: false,
    interactionHooks: [
      {
        id: "kalen-sanctum-greet",
        type: "dialogue",
        description: "Talk to Kalen",
        payload: { dialogueId: "kalen-sanctum-default" },
      },
    ],
    actions: ["talk"],
    metadata: { archetype: "rescued-boy" },
  });

  const npcs: NPC[] = [elder, kalen];

  // Carve an opening at the left wall ~3 tiles down from top to lead to the bluff passageway
  if (tiles[3]?.[0] !== undefined) {
    tiles[3][0] = FLOOR;
    subtypes[3][0] = [TileSubtype.ROOM_TRANSITION];
  }

  // Build sensible dirt roads connecting key points:
  // - From southern entrance to a central hub near the checkpoint
  // - From hub to caretaker's house exterior door
  // - From hub to Torch Town exit (top-right)
  // - From hub to Bluff exit (top-left)

  // Central hub at or near the checkpoint
  const hubY = roadJunctionY;
  const hubX = roadJunctionX;
  const topOfRoomY = 1;

  // 1) Entrance to hub: straight vertical path to the top of the room
  layStraightBetween(tiles, subtypes, entryPoint[0] + 1, entryPoint[1], topOfRoomY, entryPoint[1]);

  // 2) Hub to caretaker's exterior door (horizontal-first)
  layManhattan(tiles, subtypes, hubY, hubX, doorY+1, doorX, "horizontal-first");

  // 3) Hub to Torch Town exit from top of road (top-right)
  layManhattan(tiles, subtypes, topOfRoomY, hubX, 0 , 12, "horizontal-first");
  
  // 4) Hub to Bluff exit (top-left opening at [3,0])
  // Keep the left wall intact: target the tile just inside the map to the right of the opening
  const bluffInside: [number, number] = [3, 0];
  layStraightBetween(tiles, subtypes, bluffInside[0], hubX, bluffInside[0], bluffInside[1]);
  // Junction at (3,6): present N,S,W (missing E)
  placeT(tiles, subtypes, 3, 6, ["N", "S", "W"]);

  // Manual Clean ups:
  // Place a T at the hub
  placeT(tiles, subtypes, hubY, hubX, ["N", "S", "E"]);
  // Place a Corner going S E at 1,6
  placeCorner(tiles, subtypes, 1, 6, ["S", "E"]);
  placeStraight(tiles, subtypes, 0, 12, 90);

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
    metadata: {
      displayLabel: "Forest Clearing",
      conditionalNpcs: {
        "npc-sanctum-boy": {
          showWhen: [{ eventId: "entered-bluff-cave", value: true }]
        }
      }
    },
  };
}

