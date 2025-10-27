/**
 * Haro & Len's Cottage
 * 2 residents: Haro (Fisher), Len (Fisher)
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

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

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-5',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Haro & Len's Cottage",
    description: 'Home of Haro and Len, the fisher brothers.',
  },
  environment: 'house',
  npcs: [],
};

export function buildHaroAndLensCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
