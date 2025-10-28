/**
 * Jorin & Yanna's Cottage
 * 2 residents: Jorin (Blacksmith), Yanna (Herbalist)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [19, 25] as [number, number], returnPoint: [5, 3] as [number, number] },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# c . . e w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Jorin in bed 'c' at [2, 1], Yanna in bed 'e' at [2, 4]
const jorin = new NPC({
  id: "npc-jorin-night",
  name: "Jorin",
  sprite: "/images/npcs/torch-town/jorin.png",
  y: 2,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house3", house: HOUSE_LABELS.HOUSE_3 },
});

const yanna = new NPC({
  id: "npc-yanna-night",
  name: "Yanna",
  sprite: "/images/npcs/torch-town/yanna.png",
  y: 2,
  x: 4,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house3", house: HOUSE_LABELS.HOUSE_3 },
});

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-2',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Jorin & Yanna's Cottage",
    description: 'Home of Jorin the blacksmith and Yanna the herbalist.',
    conditionalNpcs: {
      "npc-jorin-night": { showWhen: [{ timeOfDay: "night" }] },
      "npc-yanna-night": { showWhen: [{ timeOfDay: "night" }] },
    },
  },
  environment: 'house',
  npcs: [jorin, yanna],
};

export function buildJorinAndYannasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
