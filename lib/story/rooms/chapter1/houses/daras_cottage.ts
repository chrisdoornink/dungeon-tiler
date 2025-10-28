/**
 * Dara's Cottage
 * 1 resident: Dara (Outskirts dweller)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

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

// Dara in bed 'c' at [2, 1]
const dara = new NPC({
  id: "npc-dara-night",
  name: "Dara",
  sprite: "/images/npcs/torch-town/dara.png",
  y: 2,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house8", house: HOUSE_LABELS.HOUSE_8 },
});

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-7',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Dara's Cottage",
    description: 'A quiet cottage on the outskirts, home to Dara.',
    conditionalNpcs: {
      "npc-dara-night": { showWhen: [{ timeOfDay: "night" }] },
    },
  },
  environment: 'house',
  npcs: [dara],
};

export function buildDarasCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
