/**
 * Jorin & Yanna's Cottage
 * 2 residents: Jorin (Blacksmith), Yanna (Herbalist)
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

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
  npcs: [],
};

export function buildJorinAndYannasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
