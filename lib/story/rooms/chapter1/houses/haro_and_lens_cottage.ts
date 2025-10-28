/**
 * Haro & Len's Cottage
 * 2 residents: Haro (Fisher), Len (Fisher)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [26, 28] as [number, number], returnPoint: [5, 3] as [number, number] },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# e . . a w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Haro in bed 'e' at [2, 1], Len in bed 'a' at [2, 4]
const haro = new NPC({
  id: "npc-haro-night",
  name: "Haro",
  sprite: "/images/npcs/torch-town/haro.png",
  y: 2,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house6", house: HOUSE_LABELS.HOUSE_6 },
});

const len = new NPC({
  id: "npc-len-night",
  name: "Len",
  sprite: "/images/npcs/torch-town/len.png",
  y: 2,
  x: 4,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house6", house: HOUSE_LABELS.HOUSE_6 },
});

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-5',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Haro & Len's Cottage",
    description: 'Home of Haro and Len, the fisher brothers.',
    conditionalNpcs: {
      "npc-haro-night": { showWhen: [{ timeOfDay: "night" }] },
      "npc-len-night": { showWhen: [{ timeOfDay: "night" }] },
    },
  },
  environment: 'house',
  npcs: [haro, len],
};

export function buildHaroAndLensCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
