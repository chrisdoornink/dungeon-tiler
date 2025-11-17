/**
 * Guard Tower (Barracks)
 * 4 beds for guards
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

const SIZE = 9;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd2', offsetY: -1 },
};

const VISUAL_MAP = [
  "# # # # # # # # #",
  "# . . . . . . . #",
  "# a . . b . . w #",
  "# . . . . . . . #",
  "# . . . . . . . #",
  "# c . . e . . w #",
  "# . . . . . . . #",
  "# . . . . . . . #",
  "# # # # 0 # # # #"
];

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-guard-tower',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Guard Tower",
    description: 'The town guard barracks with beds for the night watch.',
  },
  environment: 'house',
  npcs: [],
};

export function buildGuardTower(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
