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
  // offsetX: 1 spawns player 1 tile to the right to avoid immediate re-trigger
  '0': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '7', offsetX: -1 },
  '1': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '8', offsetX: -1 },
  '2': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '9', offsetX: -1 },
  '3': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '10', offsetX: -1 },
  '4': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '11', offsetX: -1 },
  '5': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '12', offsetX: -1 },
  '6': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '13', offsetX: -1 },
  '7': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '14', offsetX: -1 },
  '8': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '15', offsetX: -1 },
  '9': { roomId: 'story-the-wilds-entrance' as RoomId, targetTransitionId: '16', offsetX: -1 },
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
  "T . . G . . . G . . . G . . . G . . . G . . . G . . . . . . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . G . . . . . . . . T . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . . . . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . G . . . . T . . . . . . . . . . . . . . T . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . T . . . . . . .",
  "T . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . . T . . . . . . . .",
  "0 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . .",
  "1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . T . . . . . . . . . .",
  "2 . . . . . . . . . . . . . . . . . . . . . . G . . T . . . . . . . . . . . T . . . . . . . . . . .",
  "3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . .",
  "4 . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . T . . . . . . . . . . . . . . . . .",
  "5 . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . T . . . . . . . . . . . .",
  "6 . . . . . . . . . . . . . . . . . . . . . . G . . . . . . . . . . . . . . T . . . . . . . . . . .",
  "7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . .",
  "8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . T . . . . . . . . .",
  "9 . . . . . . . . . . . . . . . . . . . . . . . . . T . . . . . . . . . . . . . T . . . . . . . . .",
  "T . . G . . . G . . . G . . . G . . . G . . . G . . . T . . . . . . . . . . . T . . . . . . . . . .",
  "T T T . T T T T T T . T T T T T T T . T T T T T T T T T T T T T T T T . T T . . . . . . . . . . . .",
  "T T T T . T T T . . . T T T T T T T . . T T T T T T T T T T T T T T T . . . . . . . . . . . . . . .",
  "T T . T T T T . . T T T T T T T T T T . T T T T T T T T T T T T T T T . . . . . . . . . . . . . . .",
  "T T T T T T . . T T T T T T T T T T T . . T T T T T T T T T T T T T T . T . . . . . . . . . . . . .",
  "T T T T T . T T T T T T T T T T T T T T . T T T T T T T T T T T T T T . . T . . . . . . . . . . . .",
  "T T T T T T T T T T T T T T T T T T T T . T T T T T T T T T T T T T T . . . T . . . . . . . . . . .",
  "T T T T T T T T T T T T T T T T T T T T . T T T T T T T T T T T T T T . . . . T . . . . . . . . . .",
  "T T T T T T T T T T T T T T T T T T T T . T T T T T T T T T T T T T T . T . . . T . . . . . . . . .",
  "T T T T T T T T T T T T T T T T T T T T . . T T T T T T T T T T T T T . . . . . . . . . . . . . . .",
  "T T T T T T T T T T T T T T T T T T T T T . T T T T T T T T T T T T T . . . . . . . . . . . . . . .",
  "T T T T T T T T T T T T T T T T T T T T T [10] T T T T T T T T T T T T T T T T T T T T T T T T T T T T",
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
