/**
 * Fenna, Tavi & Arin's Cottage
 * 3 residents: Thane (Blacksmith Apprentice), Arin (Carpenter), Tavi (Child)
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [27, 24] as [number, number], returnPoint: [5, 3] as [number, number] },
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

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-6',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Fenna, Tavi & Arin's Cottage",
    description: 'A lively home shared by Thane, Arin, and young Tavi.',
  },
  environment: 'house',
  npcs: [],
};

export function buildFennaTaviAndArinsCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
