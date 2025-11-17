/**
 * Fenna, Tavi & Arin's Cottage
 * 3 residents: Thane (Blacksmith Apprentice), Arin (Carpenter), Tavi (Child)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd8', offsetY: 1 },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# b . . c w #",
  "# e . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Fenna is at the central fire, Arin is at the work site, Tavi is playing in the plaza - all in town

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-6',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Fenna, Tavi & Arin's Cottage",
    description: 'A lively home shared by Fenna, Arin, and young Tavi.',
  },
  environment: 'house',
  npcs: [],
};

export function buildFennaTaviAndArinsCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
