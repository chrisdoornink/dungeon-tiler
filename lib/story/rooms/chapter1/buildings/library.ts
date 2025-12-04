import type { RoomId } from "../../../../map";
import { Direction, TileSubtype } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";

const SIZE = 11;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd1', offsetY: 1 },
};

const VISUAL_MAP = [
  "# # # # # # # # # # #",
  "# . . . . . . . . . #",
  "# . . . . . . . . . #",
  "# . . . . . . . . . #",
  "# . . . . . . . . . #",
  "# # # # # 0 # # # # #",
];

export function buildLibrary(): StoryRoom {
  const config: RoomConfig = {
    id: 'story-torch-town-library',
    size: SIZE,
    visualMap: VISUAL_MAP,
    transitions: TRANSITIONS,
    metadata: {
      displayLabel: "Library",
    },
    environment: 'house',
    npcs: [],
  };
  
  const room = buildRoom(config);
  
  // Add bookshelves as overlays on floor tiles
  // Top row (1, 1-9)
  for (let x = 1; x <= 9; x++) {
    room.mapData.subtypes[1][x] = [TileSubtype.BOOKSHELF];
  }
  
  // Middle row left side (4, 1-3)
  for (let x = 1; x <= 3; x++) {
    room.mapData.subtypes[4][x] = [TileSubtype.BOOKSHELF];
  }
  
  // Middle row right side (4, 7-9)
  for (let x = 7; x <= 9; x++) {
    room.mapData.subtypes[4][x] = [TileSubtype.BOOKSHELF];
  }
  
  // Place Eldra (the librarian) inside
  const eldra = new NPC({
    id: "npc-eldra",
    name: "Eldra",
    sprite: "/images/npcs/torch-town/eldra.png",
    y: 3,
    x: 5,
    facing: Direction.DOWN,
    canMove: false,
  });
  
  room.npcs = [eldra];
  
  return room;
}
