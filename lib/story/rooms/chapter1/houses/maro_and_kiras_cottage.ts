/**
 * Maro & Kira's Cottage
 * 2 residents: Maro (Storekeeper), Kira (Teen)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [23, 20] as [number, number], returnPoint: [5, 3] as [number, number] },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# a . . b w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Maro in bed 'a' at [2, 1], Kira in bed 'b' at [2, 4]
const maro = new NPC({
  id: "npc-maro-night",
  name: "Maro",
  sprite: "/images/npcs/torch-town/maro.png",
  y: 2,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house2", house: HOUSE_LABELS.HOUSE_2 },
});

const kira = new NPC({
  id: "npc-kira-night",
  name: "Kira",
  sprite: "/images/npcs/torch-town/kira.png",
  y: 2,
  x: 4,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house2", house: HOUSE_LABELS.HOUSE_2 },
});

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-1',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Maro & Kira's Cottage",
    description: 'Home of Maro the storekeeper and his daughter Kira.',
    conditionalNpcs: {
      "npc-maro-night": { showWhen: [{ timeOfDay: "night" }] },
      "npc-kira-night": { showWhen: [{ timeOfDay: "night" }] },
    },
  },
  environment: 'house',
  npcs: [maro, kira],
};

export function buildMaroAndKirasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
