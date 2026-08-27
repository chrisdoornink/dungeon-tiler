/**
 * The Backyard (Hearth & Home) — the open arena the family bursts into when the
 * house is overrun ("there's too many, out the back!"). This is the seam where
 * the authored prologue ends and the survival/slasher core (Quest 6) begins.
 * For now it's a simple tree-ringed field the company fights in.
 */

import type { StoryRoom } from "../types";
import { buildRoom, type RoomConfig } from "../room-builder";

export const BACKYARD_ROOM_ID = "home-backyard";

/** Where the hero lands, coming up out of the back door — bottom-center. */
export const BACKYARD_ENTRY: [number, number] = [11, 6];

const WIDTH = 13;
const HEIGHT = 13;

// Tree-ringed open grass. 'T' = tree (blocks), '.' = grass floor.
const VISUAL_MAP = [
  "T T T T T T T T T T T T T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T . . . . . . . . . . . T",
  "T T T T T T T T T T T T T",
];

const ROOM_CONFIG: RoomConfig = {
  id: BACKYARD_ROOM_ID,
  size: [WIDTH, HEIGHT],
  visualMap: VISUAL_MAP,
  transitions: {},
  metadata: {
    displayLabel: "The Backyard",
    description: "The open yard behind the house — where it really begins.",
  },
  environment: "outdoor",
  npcs: [],
};

export function buildBackyard(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
