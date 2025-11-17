/**
 * Serin's Clinic
 * 1 resident: Serin (Healer) - lives and works here
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: 'd12', offsetY: 1 },
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

// Serin is always in her clinic, positioned away from bed at [2, 3]
const serin = new NPC({
  id: "npc-serin",
  name: "Serin",
  sprite: "/images/npcs/torch-town/serin.png",
  y: 2,
  x: 3,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { dayLocation: "house4", nightLocation: "house4", house: HOUSE_LABELS.HOUSE_4 },
});

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-3',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Serin's Clinic",
    description: 'A small clinic where Serin the healer lives and works.',
    // Serin is always visible (clinic always open)
  },
  environment: 'house',
  npcs: [serin],
};

export function buildSerinsClinic(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
