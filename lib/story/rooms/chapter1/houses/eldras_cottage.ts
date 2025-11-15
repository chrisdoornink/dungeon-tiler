/**
 * Eldra's Cottage
 * 1 resident: Eldra
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

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

// Eldra sleeps in bed 'a' at position [2, 1] (row 2, col 1)
const eldra = new NPC({
  id: "npc-eldra-night",
  name: "Eldra",
  sprite: "/images/npcs/torch-town/eldra.png",
  y: 2,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house1", house: HOUSE_LABELS.HOUSE_1 },
});

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
  npcs: [eldra],
};

export function buildEldrasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
