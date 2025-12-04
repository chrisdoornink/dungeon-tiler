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
 * - '0', '1' = world transitions (Wilds Entrance, Outdoor Clearing)
 * - '[d1]'-'[d11]' = house door transitions (wall + door + transition)
 * - 'h' = house wall
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
  "# # # . . . . . . . . . . . . hh[d1]h h . . . . . . hh[d2]h # # #",
  "# # # . . R R R R R R R . . . . . = . . . . . . . . . . = . # # #",
  "# # # . . R R R R R R R . T . . . = . . . R R R R . . . = . # # #",
  "# # # . . R R R R R R R . . . = = = = = . h R R R . . . = . # # #",
  "# # # . . h hh[d3]h h h . . . = . . . = . .h[d4]h . . . = . # # #",
  "# # # . . . . F = = = = = = = = . C . = = = = = = = = = = = = = 0",
  "# # # . . . . F F F . . . . . = . . . = . . . . . . . . . . # # #",
  "# # # . . . . . . . . . . . . = = = = = . . . R R R R . . F # # #",
  "# # # . R R R . R R R R F . . . . = . . . . . R R R R . . . # # #",
  "# # # . R R R . R R R R F . . . . = . T T T . hh[d12]h. . . # # #",
  "# # # . [d5]hh .hh[d6]h F . . . . = . T T T . . . = . . . . # # #",
  "# # # . . F F . . . = . . . . . . = . . . . . . . = . . . . # # #",
  "# # # . = = = = = = = = = = = = = = . R R R . . . = . R R R # # #",
  "# # # . . . . . . . . . . . . . . = . R R R . . . = . R R R # # #",
  "# # # . . . . . . R R R . . . . . = . h[d7]h. . . = . [d11]hh## #",
  "# # # . R R R R . R R R . R R R . = . . = . . . = = = = F F # # #",
  "# # # . R R R R . h[d8]h. R R R . = = = = = = = = . . . . . # # #",
  "# # # . hh[d9]h . . = . . h[d10]h.= . . . . F . . . . . F . # # #",
  "# # # . . . . . . . = . . . . . . = . . F F F . . . F . T . # # #",
  "# # # . T . = = = = = = = = = = = = . F . . F F . F T F F . # # #",
  "# # # . . . . . . . . . . . . . . = . . . . . . . . F . . . # # #",
  "# # # # # # # # # # # # # # # # # = # # # # # # # # # # # # # # #",
  "# # # # # # # # # # # # # # # # # 1 # # # # # # # # # # # # # # #",
];

const TRANSITIONS = {
  // World transitions
  '0': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '0' },
  '1': { roomId: 'story-outdoor-clearing' as RoomId, targetTransitionId: 'outdoor-torch', offsetY: 1 },
  
  // Buildings
  'd1': { roomId: 'story-torch-town-library' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Library
  'd2': { roomId: 'story-torch-town-guard-tower' as RoomId, targetTransitionId: 'exit', offsetY: -1 }, // Guard Tower
  'd3': { roomId: 'story-torch-town-store' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Store
  'd4': { roomId: 'story-torch-town-smithy' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Smithy
  
  // Houses
  'd5': { roomId: 'story-torch-town-home-4' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Rhett & Mira's Cottage
  'd6': { roomId: 'story-torch-town-home-2' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Jorin & Yanna's Cottage
  'd7': { roomId: 'story-torch-town-home-5' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Haro & Len's Cottage
  'd8': { roomId: 'story-torch-town-home-6' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Fenna, Tavi & Arin's Cottage
  'd9': { roomId: 'story-torch-town-home-0' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Eldra's Cottage
  'd10': { roomId: 'story-torch-town-home-1' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Maro & Kira's Cottage
  'd11': { roomId: 'story-torch-town-home-7' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Dara's Cottage
  'd12': { roomId: 'story-torch-town-home-3' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Serin's Clinic
  // 'd13': { roomId: 'story-torch-town-home-4' as RoomId, targetTransitionId: '0', offsetY: -1 }, // Rhett & Mira's Cottage (duplicate)
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
  
  // Auto-detect road shapes based on adjacency
  autoDetectRoadShapes(room.mapData.tiles, room.mapData.subtypes);
  
  // Add building signs next to doors
  // Library sign (next to d1 door at row 4, col ~17)
  const librarySignPos = [4, 16]; // One tile to the left of d1
  if (!room.mapData.subtypes[librarySignPos[0]][librarySignPos[1]].includes(TileSubtype.SIGN_LIBRARY)) {
    room.mapData.subtypes[librarySignPos[0]][librarySignPos[1]].push(TileSubtype.SIGN_LIBRARY);
  }
  
  // Store sign (next to d3 door at row 8, col ~11)
  const storeSignPos = [8, 9]; // One tile to the left of d3
  if (!room.mapData.subtypes[storeSignPos[0]][storeSignPos[1]].includes(TileSubtype.SIGN_STORE)) {
    room.mapData.subtypes[storeSignPos[0]][storeSignPos[1]].push(TileSubtype.SIGN_STORE);
  }
  
  // Smithy sign (next to d4 door at row 8, col ~24)
  const smithySignPos = [8, 22]; // One tile to the left of d4
  if (!room.mapData.subtypes[smithySignPos[0]][smithySignPos[1]].includes(TileSubtype.SIGN_SMITHY)) {
    room.mapData.subtypes[smithySignPos[0]][smithySignPos[1]].push(TileSubtype.SIGN_SMITHY);
  }
  
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
    metadata: { behavior: "dog" },
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
      wanderBounds: { minY: 2, maxY: 12, minX: 10, maxX: 22 }
    },
  }));
  
  // Captain Bren (Guard Captain) - Patrol in plaza
  npcs.push(new NPC({
    id: "npc-captain-bren",
    name: "Captain Bren",
    sprite: "/images/npcs/torch-town/captain-bren.png",
    y: 8,
    x: 29,
    facing: Direction.DOWN,
    canMove: false,
  }));
  
  // Yanna (Herbalist) - Forest edge near gate
  npcs.push(new NPC({
    id: "npc-yanna",
    name: "Yanna",
    sprite: "/images/npcs/torch-town/yanna.png",
    y: 23,
    x: 24,
    facing: Direction.LEFT,
    canMove: false,
  }));
  
  // Rhett (Farmer) - Fields near gate
  npcs.push(new NPC({
    id: "npc-rhett",
    name: "Rhett",
    sprite: "/images/npcs/torch-town/rhett.png",
    y: 22,
    x: 26,
    facing: Direction.DOWN,
    canMove: false,
  }));
  
  // Mira (Weaver) - Weaving near house
  npcs.push(new NPC({
    id: "npc-mira",
    name: "Mira",
    sprite: "/images/npcs/torch-town/mira.png",
    y: 15,
    x: 7,
    facing: Direction.LEFT,
    canMove: false,
  }));
  
  // Kira (Teen) - Wandering in plaza
  npcs.push(new NPC({
    id: "npc-kira",
    name: "Kira",
    sprite: "/images/npcs/torch-town/kira.png",
    y: 10,
    x: 14,
    facing: Direction.RIGHT,
    canMove: false,
  }));
  
  // Lio (Hunter) - Near gate
  npcs.push(new NPC({
    id: "npc-lio",
    name: "Lio",
    sprite: "/images/npcs/torch-town/lio.png",
    y: 15,
    x: 28,
    facing: Direction.DOWN,
    canMove: false,
  }));
  
  // Dara (Outsider) - Town outskirts
  npcs.push(new NPC({
    id: "npc-dara",
    name: "Dara",
    sprite: "/images/npcs/torch-town/dara.png",
    y: 17,
    x: 12,
    facing: Direction.DOWN,
    canMove: false,
  }));
  
  // Sela (Guard) - Training yard
  npcs.push(new NPC({
    id: "npc-sela",
    name: "Sela",
    sprite: "/images/npcs/torch-town/sela.png",
    y: 5,
    x: 28,
    facing: Direction.LEFT,
    canMove: false,
  }));
  
  // Thane (Guard) - Training yard
  npcs.push(new NPC({
    id: "npc-thane",
    name: "Thane",
    sprite: "/images/npcs/torch-town/thane.png",
    y: 5,
    x: 26,
    facing: Direction.RIGHT,
    canMove: false,
  }));
  
  // Old Fenna (Flame Caretaker) - Central fire
  npcs.push(new NPC({
    id: "npc-fenna",
    name: "Old Fenna",
    sprite: "/images/npcs/torch-town/old-fenna.png",
    y: 9,
    x: 15,
    facing: Direction.DOWN,
    canMove: false,
  }));
  
  // Arin (Carpenter) - Work site near houses
  npcs.push(new NPC({
    id: "npc-arin",
    name: "Arin",
    sprite: "/images/npcs/torch-town/arin.png",
    y: 19,
    x: 19,
    facing: Direction.LEFT,
    canMove: false,
  }));
  
  // Haro (Fisher) - Fishing area
  npcs.push(new NPC({
    id: "npc-haro",
    name: "Haro",
    sprite: "/images/npcs/torch-town/haro.png",
    y: 21,
    x: 25,
    facing: Direction.DOWN,
    canMove: false,
  }));
  
  // Len (Fisher) - Fishing area
  npcs.push(new NPC({
    id: "npc-len",
    name: "Len",
    sprite: "/images/npcs/torch-town/len.png",
    y: 21,
    x: 24,
    facing: Direction.RIGHT,
    canMove: false,
  }));

  return {
    ...room,
    npcs,
  };
}
