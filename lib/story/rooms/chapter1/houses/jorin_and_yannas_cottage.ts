/**
 * Jorin & Yanna's Cottage
 * 2 residents: Jorin (Blacksmith), Yanna (Herbalist)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town_new";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd6', offsetY: 1 },
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

// Jorin is at home (not in town), Yanna is at forest edge
const jorin = new NPC({
  id: "npc-jorin",
  name: "Jorin",
  sprite: "/images/npcs/torch-town/jorin.png",
  y: 3,
  x: 2,
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
  },
  environment: 'house',
  npcs: [jorin],
};

export function buildJorinAndYannasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
