/**
 * Eldra's Cottage
 * 1 resident: Eldra
 */

import { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [20, 19] as [number, number], returnPoint: [5, 3] as [number, number] },
};

/**
 * Visual map layout
 * 
 * Legend:
 * - '.' = floor
 * - '#' = wall
 * - 'a' = bed empty variant 1 (Eldra's bed)
 * - 'w' = wall torch
 * - '0' = transition to Torch Town
 */
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
  id: 'story-torch-town-home-0',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Eldra's Cottage",
    description: 'A cozy cottage belonging to Eldra.',
  },
  environment: 'house',
  npcs: [],
};

export function buildEldrasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
