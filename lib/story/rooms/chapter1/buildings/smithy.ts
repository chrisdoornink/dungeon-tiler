import { Direction, type RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";

const SIZE = 9;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd4', offsetY: 1 },
};

const VISUAL_MAP = [
  "# # # # # # # # #",
  "# . . . . . . . #",
  "# . . . . . . . #",
  "# . . . . . . . #",
  "# # # # 0 # # # #",
];

export function buildSmithy(): StoryRoom {
  const config: RoomConfig = {
    id: 'story-torch-town-smithy',
    size: SIZE,
    visualMap: VISUAL_MAP,
    transitions: TRANSITIONS,
    metadata: {
      displayLabel: "Smithy",
    },
    environment: 'house',
    npcs: [],
  };
  
  const room = buildRoom(config);
  
  const jorin = new NPC({
    id: "npc-jorin",
    name: "Jorin",
    sprite: "/images/npcs/torch-town/jorin.png",
    y: 2,
    x: 4,
    facing: Direction.DOWN,
    canMove: false,
  });

  room.npcs = [jorin];
  
  return room;
}
