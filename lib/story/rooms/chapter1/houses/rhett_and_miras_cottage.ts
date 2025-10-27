/**
 * Rhett & Mira's Cottage
 * 2 residents: Rhett (Farmer), Mira (Weaver)
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [24, 24] as [number, number], returnPoint: [5, 3] as [number, number] },
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
