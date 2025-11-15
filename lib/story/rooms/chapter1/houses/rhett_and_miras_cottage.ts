/**
 * Rhett & Mira's Cottage
 * 2 residents: Rhett (Farmer), Mira (Weaver)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [24, 24] as [number, number], returnPoint: [5, 3] as [number, number] },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# b . . c w #",
  "# . . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Rhett in bed 'b' at [2, 1], Mira in bed 'c' at [2, 4]
const rhett = new NPC({
  id: "npc-rhett-night",
  name: "Rhett",
  sprite: "/images/npcs/torch-town/rhett.png",
  y: 2,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house5", house: HOUSE_LABELS.HOUSE_5 },
});

const mira = new NPC({
  id: "npc-mira-night",
  name: "Mira",
  sprite: "/images/npcs/torch-town/mira.png",
  y: 2,
  x: 4,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house5", house: HOUSE_LABELS.HOUSE_5 },
});

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-4',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Rhett & Mira's Cottage",
    description: 'Home of Rhett the farmer and Mira the weaver.',
  },
  environment: 'house',
  npcs: [rhett, mira],
};

export function buildRhettAndMirasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
