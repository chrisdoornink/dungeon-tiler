/**
 * Maro & Kira's Cottage
 * 2 residents: Maro (Storekeeper), Kira (Teen)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [23, 20] as [number, number], returnPoint: [5, 3] as [number, number] },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# a . . b w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Maro is at the store, Kira is in the plaza - neither are home

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-1',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Maro & Kira's Cottage",
    description: 'Home of Maro the storekeeper and his daughter Kira.',
  },
  environment: 'house',
  npcs: [],
};

export function buildMaroAndKirasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
