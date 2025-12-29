/**
 * Rhett & Mira's Cottage
 * 2 residents: Rhett (Farmer), Mira (Weaver)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town_new";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd5', offsetY: 1 },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# b . . c w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Rhett is in the fields, Mira is weaving near their house - neither are inside

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-4',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Rhett & Mira's Cottage",
    description: 'Home of Rhett the farmer and Mira the weaver.',
  },
  environment: 'house',
  npcs: [],
};

export function buildRhettAndMirasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
