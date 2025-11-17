/**
 * Dara's Cottage
 * 1 resident: Dara (Outskirts dweller)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd11', offsetY: 1 },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# c . . . w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Dara is at the town outskirts - not at home

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-7',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Dara's Cottage",
    description: 'A quiet cottage on the outskirts, home to Dara.',
  },
  environment: 'house',
  npcs: [],
};

export function buildDarasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
