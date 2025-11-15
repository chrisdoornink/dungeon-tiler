/**
 * Fenna, Tavi & Arin's Cottage
 * 3 residents: Thane (Blacksmith Apprentice), Arin (Carpenter), Tavi (Child)
 */

import { RoomId, Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { buildRoom, type RoomConfig } from "../../room-builder";
import { NPC } from "../../../../npc";
import { HOUSE_LABELS } from "../torch_town";

const SIZE = 7;

const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, target: [27, 24] as [number, number], returnPoint: [5, 3] as [number, number] },
};

const VISUAL_MAP = [
  "# # # # # # #",
  "# . . . . . #",
  "# b . . c w #",
  "# e . . . . #",
  "# w . . . . #",
  "# . . . . . #",
  "# # # 0 # # #"
];

// Fenna in bed 'b' at [2, 1], Arin in bed 'c' at [2, 4], Tavi in bed 'e' at [3, 1]
const fenna = new NPC({
  id: "npc-fenna-night",
  name: "Old Fenna",
  sprite: "/images/npcs/torch-town/old-fenna.png",
  y: 2,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house7", house: HOUSE_LABELS.HOUSE_7 },
});

const arin = new NPC({
  id: "npc-arin-night",
  name: "Arin",
  sprite: "/images/npcs/torch-town/arin.png",
  y: 2,
  x: 4,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house7", house: HOUSE_LABELS.HOUSE_7 },
});

const tavi = new NPC({
  id: "npc-tavi-night",
  name: "Tavi",
  sprite: "/images/npcs/torch-town/tavi.png",
  y: 3,
  x: 1,
  facing: Direction.DOWN,
  canMove: false,
  metadata: { nightLocation: "house7", house: HOUSE_LABELS.HOUSE_7 },
});

const ROOM_CONFIG: RoomConfig = {
  id: 'story-torch-town-home-6',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: "Fenna, Tavi & Arin's Cottage",
    description: 'A lively home shared by Fenna, Arin, and young Tavi.',
  },
  environment: 'house',
  npcs: [fenna, arin, tavi],
};

export function buildFennaTaviAndArinsCottage(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
