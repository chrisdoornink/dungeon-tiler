import { Direction } from "../../../../map";
import type { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";

const SIZE = 9;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd3', offsetY: 1 },
};

const VISUAL_MAP = [
  "# # # # # # # # #",
  "# . . . . . . . #",
  "# . . . . . . . #",
  "# . . . . . . . #",
  "# # # # 0 # # # #",
];

export function buildStore(): StoryRoom {
  const config: RoomConfig = {
    id: 'story-torch-town-store',
    size: SIZE,
    visualMap: VISUAL_MAP,
    transitions: TRANSITIONS,
    metadata: {
      displayLabel: "Store",
    },
    environment: 'house',
    npcs: [],
  };
  
  const room = buildRoom(config);
  
  // Maro the storekeeper
  const maro = new NPC({
    id: "npc-maro",
    name: "Maro",
    sprite: "/images/npcs/torch-town/maro.png",
    y: 2,
    x: 4,
    facing: Direction.DOWN,
    canMove: false,
  });
  
  room.npcs = [maro];
  
  return room;
}
