/**
 * Serin's Clinic
 * 1 resident: Serin (Healer) - lives and works here
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [22, 28] as [number, number], returnPoint: [5, 3] as [number, number] },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# a . . . w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-3',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Serin's Clinic",
    description: 'A small clinic where Serin the healer lives and works.',
  },
  environment: 'house',
  npcs: [],
};

export function buildSerinsClinic(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
