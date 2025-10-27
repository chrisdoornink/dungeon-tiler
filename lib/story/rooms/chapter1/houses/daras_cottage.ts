/**
 * Dara's Cottage
 * 1 resident: Dara (Outskirts dweller)
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [26, 19] as [number, number], returnPoint: [5, 3] as [number, number] },
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
