/**
 * Torch Town - Visual Map Version
 * A walled settlement with houses, buildings, roads, and NPCs
 * 
 * Legend:
 * - '.' = floor/grass
 * - '#' = wall
 * - 'R' = roof
 * - '=' = road (auto-detects shape)
 * - 'F' = flowers
 * - '@' = town sign
 * - 'f' = floor torch
 * - '0'-'9', 'A'-'H' = room transitions (houses/buildings)
 * - 'd' = door
 */

import { RoomId, Direction, TileSubtype } from "../../../map";
import type { StoryRoom } from "../types";
import { buildRoom, type RoomConfig } from "../room-builder";
import { NPC } from "../../../npc";
import { autoDetectRoadShapes } from "../../../map/road-auto-detection";

// House labels - defined once and reused
export const HOUSE_LABELS = {
  HOUSE_1: "Eldra's Cottage",
  HOUSE_2: "Maro & Kira's Cottage",
  HOUSE_3: "Jorin & Yanna's Cottage",
  HOUSE_4: "Serin's Clinic",
  HOUSE_5: "Rhett & Mira's Cottage",
  HOUSE_6: "Haro & Len's Cottage",
  HOUSE_7: "Fenna, Tavi & Arin's Cottage",
  HOUSE_8: "Dara's Cottage",
} as const;

const WIDTH = 33;
const HEIGHT = 27;

// Simplified 35x35 Torch Town with roads, buildings, and houses
const VISUAL_MAP = [
  "# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #",
  "# # # . . . . . . . . . . . . . . . . . . . . . . . . . . . # # #",
  "# # # . . F . . . . . . . . . R R R R R . . . F . . R R R R # # #",
  "# # # . . . . . . . F . . . . R R R R R . . F F . . R R R R # # #",
  "# # # . . . . . . . . . . . . h h d h h . . . . . . h h d h # # #",
  "# # # . . R R R R R R R . . . . . = . . . . . . . . . . = . # # #",
  "# # # . . R R R R R R R . T . . . = . . . R R R R . . . = . # # #",
  "# # # . . R R R R R R R . . . = = = = = . h R R R . . . = . # # #",
  "# # # . . h h h d h h h . . . = . . . = . . h d h . . . = . # # #",
  "# # # . . . . F = = = = = = = = . C . = = = = = = = = = = = = = 0    ",
  "# # # . . . . F F F . . . . . = . . . = . . . . . . . . . . # # #",
  "# # # . . . . . . . . . . . . = = = = = . . . R R R R . . F # # #",
  "# # # . R R R . R R R R F . . . . = . . . . . R R R R . . . # # #",
  "# # # . R R R . R R R R F . . . . = . . . . . h h d h . . . # # #",
  "# # # . d h h . h h d h F . . . . = . . T T . . . = . . . . # # #",
  "# # # . . F F . . . = . . . . . . = . . T T . . . = . R R R # # #",
  "# # # . = = = = = = = = = = = = = = . . . . . . . = . R R R # # #",
  "# # # . . . . . . . . . . . . . . = . R R R . . . = . d h h # # #",
  "# # # . . . . . . R R R . . . . . = . R R R . . = = = = F F # # #",
  "# # # . R R R R . R R R . R R R . = . h d h . . = . . . . . # # #",
  "# # # . R R R R . h d h . R R R . = . . = . . . = . . . . . # # #",
  "# # # . h h d h . . = . . h d h . = = = = = = = = = . R R R # # #",
  "# # # . . . . . . . = . . . = . . = F F . F F . F = . R R R # # #",
  "# # # . T . = = = = = = = = = = = = . F . . F F . = . h d h # # #",
  "# # # . . . . . . . . . . . . . . = . . . . . . . = = = = . # # #",
  "# # # # # # # # # # # # # # # # # = # # # # # # # # # # # # # # #",
  "# # # # # # # # # # # # # # # # # 1 # # # # # # # # # # # # # # #",
];

const TRANSITIONS = {
  '0': { roomId: 'story-the-wilds-entrance' as RoomId, target: [1, 17] as [number, number], returnPoint: [32, 9] as [number, number] },
  '1': { roomId: 'story-outdoor-clearing' as RoomId, target: [1, 17] as [number, number], returnPoint: [17, 1] as [number, number] },  
};

export function buildTorchTownNew(): StoryRoom {
  const config: RoomConfig = {
    id: 'story-torch-town',
    size: [WIDTH, HEIGHT],
    visualMap: VISUAL_MAP,
    transitions: TRANSITIONS,
    metadata: {
      displayLabel: "Torch Town",
      description: "A walled settlement in the southwest corner of the map.",
    },
    environment: 'outdoor',
    npcs: [],
  };

  const room = buildRoom(config);
  
  // Debug: Check transitions
  console.log('[TORCH TOWN] Other transitions:', room.otherTransitions);
  console.log('[TORCH TOWN] Checking transition tiles:');
  for (let y = 0; y < room.mapData.tiles.length; y++) {
    for (let x = 0; x < room.mapData.tiles[y].length; x++) {
      if (room.mapData.subtypes[y]?.[x]?.includes(TileSubtype.ROOM_TRANSITION)) {
        console.log(`  Found transition at (${y}, ${x}), tile=${room.mapData.tiles[y][x]}, subtypes=`, room.mapData.subtypes[y][x]);
      }
    }
  }
  
  // Auto-detect road shapes based on adjacency
  autoDetectRoadShapes(room.mapData.tiles, room.mapData.subtypes);
  
  // Add NPCs
  const npcs: NPC[] = [];
  
  // Golden Dog - wandering in plaza
  npcs.push(new NPC({
    id: "npc-dog-golden",
    name: "Golden Dog",
    sprite: "/images/dog-golden/dog-front-1.png",
    y: 14,
    x: 13,
    facing: Direction.DOWN,
    canMove: true,
    tags: ["dog", "pet"],
    metadata: { 
      behavior: "dog",
      dayLocation: "plaza", 
      nightLocation: "plaza" 
    },
  }));
  
  // Tavi - wandering child in plaza
  npcs.push(new NPC({
    id: "npc-tavi",
    name: "Tavi",
    sprite: "/images/npcs/torch-town/tavi.png",
    y: 13,
    x: 13,
    facing: Direction.LEFT,
    canMove: true,
    metadata: { 
      behavior: "wander",
      wanderBounds: { minY: 5, maxY: 13, minX: 5, maxX: 13 },
      dayLocation: "plaza", 
      nightLocation: "house7", 
      house: HOUSE_LABELS.HOUSE_7 
    },
  }));

  return {
    ...room,
    npcs,
  };
}
