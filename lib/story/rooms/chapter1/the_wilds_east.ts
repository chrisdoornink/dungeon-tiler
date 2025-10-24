/**
 * The Wilds - East
 * 
 * This is a CONFIGURATION FILE - all room logic is handled by the shared framework.
 * Open grassland area with goblins in the middle.
 */

import { RoomId } from "../../../map";
import type { StoryRoom } from "../types";
import { buildRoom, type RoomConfig } from "../room-builder";

const WIDTH = 50;
const HEIGHT = 35;

/**
 * Transition definitions - maps transition IDs to their destinations
 * Note: No transitions yet - will be added later
 */
const TRANSITIONS = {
  // Back to Wilds Entrance (left edge, multiple entry points)
  '0': { roomId: 'story-the-wilds-entrance' as RoomId, target: [7, 24] as [number, number], returnPoint: [1, 1] as [number, number] },
  '1': { roomId: 'story-the-wilds-entrance' as RoomId, target: [8, 24] as [number, number], returnPoint: [2, 1] as [number, number] },
  '2': { roomId: 'story-the-wilds-entrance' as RoomId, target: [9, 24] as [number, number], returnPoint: [3, 1] as [number, number] },
  '3': { roomId: 'story-the-wilds-entrance' as RoomId, target: [10, 24] as [number, number], returnPoint: [4, 1] as [number, number] },
  '4': { roomId: 'story-the-wilds-entrance' as RoomId, target: [11, 24] as [number, number], returnPoint: [5, 1] as [number, number] },
  '5': { roomId: 'story-the-wilds-entrance' as RoomId, target: [12, 24] as [number, number], returnPoint: [6, 1] as [number, number] },
  '6': { roomId: 'story-the-wilds-entrance' as RoomId, target: [13, 24] as [number, number], returnPoint: [7, 1] as [number, number] },
  '7': { roomId: 'story-the-wilds-entrance' as RoomId, target: [14, 24] as [number, number], returnPoint: [8, 1] as [number, number] },
  '8': { roomId: 'story-the-wilds-entrance' as RoomId, target: [15, 24] as [number, number], returnPoint: [9, 1] as [number, number] },
  '9': { roomId: 'story-the-wilds-entrance' as RoomId, target: [16, 24] as [number, number], returnPoint: [10, 1] as [number, number] },
  'A': { roomId: 'story-the-wilds-entrance' as RoomId, target: [17, 24] as [number, number], returnPoint: [11, 1] as [number, number] },
  'B': { roomId: 'story-the-wilds-entrance' as RoomId, target: [18, 24] as [number, number], returnPoint: [12, 1] as [number, number] },
  'C': { roomId: 'story-the-wilds-entrance' as RoomId, target: [19, 24] as [number, number], returnPoint: [13, 1] as [number, number] },
  'D': { roomId: 'story-the-wilds-entrance' as RoomId, target: [20, 24] as [number, number], returnPoint: [14, 1] as [number, number] },
};

/**
 * Visual map layout using readable symbols.
 * 
 * NOTE: Spaces are ignored during parsing - use them for visual formatting!
 * 
 * Legend:
 * - '.' = floor (0)
 * - '#' = wall (1)
 * - 'T' = tree (6)
 * - 'h' = house wall (1)
 * - 'R' = roof (4)
 * - 'G' = goblin enemy
 * - 'S' = snake enemy
 * - 'W' = wisp (ghost) enemy
 * - 'd' = door (wall with door subtype)
 * - 'f' = torch on floor tile
 * - 'w' = torch on wall tile
 * - 'r' = pot with rune inside
 * - 'p' = pot with food inside
 * - 's' = pot with snake inside
 * 
 * Transitions:
 * - '0'-'9', 'A'-'D' = Back to Wilds Entrance (left edge)
 */
const VISUAL_MAP = [
  "T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T",
  ". . . G . . . G . . . G . . . G . . . G . . . G . . . . . . . . . . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . G . . . . . . . . T . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . G . . . . T . . . . . . . . . . . . . . T . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . T . . . . . . .",
  ". . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . T . . . . . . . .",
  "0 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . .",
  "1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . T . . . . . . . . . .",
  "2 . . . . . . . . . . . . . . . . . . . . . . G . . T . . . . . . . . . . . T . . . . . . . . . . .",
  "3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . .",
  "4 . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . T . . . . . . . . . . . . . . . . .",
  "5 . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . T . . . . . . . . . . . .",
  "6 . . . . . . . . . . . . . . . . . . . . . . G . . . . . . . . . . . . . . T . . . . . . . . . . .",
  "7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . .",
  "8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . T . . . . . . . . . .",
  "9 . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . T . . . . . . . . .",
  "A . . . . . . . . . . . . . . . . . . . . . . G . . . . T . . . . . . . . . . . T . . . . . . . . .",
  "B . . . . . . . . . . . . . . . . . . . . . G . G . . . . . . . . . . . . T T . . . . . . . . . . .",
  "C . . . . . . . . . . . . . . . . . . . . . . G . . T . . . . . T . . . . . . . . . . . . . . . . .",
  "D . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . G . . . . . T . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . G . . T . . . . . . . . . T . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . G . . . . . . . T . . . . . . . T . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . T . . . T . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . G . . . . G . . . . G . . . G . . . G . . . . . . . . . . . . . . . . . . . . . . . . . .",
  "T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T",
];

/**
 * Room Configuration
 */
const ROOM_CONFIG: RoomConfig = {
  id: 'story-the-wilds-east',
  size: [WIDTH, HEIGHT], // Rectangular room: 50 wide x 25 tall
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: 'The Wilds — East',
    description: 'An open grassland area with hostile goblins.',
  },
  environment: 'outdoor',
  npcs: [],
};

/**
 * Build and export the room using the shared framework
 */
export function buildTheWildsEast(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
