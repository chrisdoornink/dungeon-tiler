/**
 * The Wilds - North
 * 
 * This is a CONFIGURATION FILE - all room logic is handled by the shared framework.
 * Dense forest area with narrow grass paths, wisps, and snakes.
 */

import { RoomId } from "../../../map";
import type { StoryRoom } from "../types";
import { buildRoom, type RoomConfig } from "../room-builder";

const SIZE = 25;

/**
 * Transition definitions - maps transition IDs to their destinations
 */
const TRANSITIONS = {
  // Back to Wilds Entrance (bottom edge)
  '0': { roomId: 'story-the-wilds-entrance' as RoomId, target: [0, 20] as [number, number], returnPoint: [20, 10] as [number, number] },
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
 * - 'S' = snake enemy
 * - 'W' = wisp (ghost) enemy
 * - 'f' = torch on floor tile
 * - 'p' = pot with food inside
 * 
 * Transitions:
 * - '0' = Back to Wilds Entrance
 */
const VISUAL_MAP = [
  "T T T T T T T T T T T T T T T T T T T T T T T T T",
  "T T T T T T T T T T T T T T T T T T T T T T T T T",
  "T T T T T T . . . T T T T T T T T T T T T T T T T",
  "T T T T T T . W . T T T T T T T T T T T T T T T T",
  "T T T T T T . . . T T T T T T T T T T T T T T T T",
  "T T T T T T T . T T T T T T T T T T T T T T T T T",
  "T T T T T T T . T T T T T T T T . . . . T T T T T",
  "T T T T T T T . T T T T T T T T . S . . T T T T T",
  "T T T T T T T . T T T T T T T T . . . . T T T T T",
  "T T T T T T T . T T T T T T T T T . T T T T T T T",
  "T T T T T T T . T T T T T T T T T . T T T T T T T",
  "T T . . . . . . . . . . . . . T T . T T T T T T T",
  "T T . W . . . . . . . . . . . T T . T T T T T T T",
  "T T . . . . . . . . . . . . . T T . T T T T T T T",
  "T T T T T T T . T T T T T T T T T . T T T T T T T",
  "T T T T T T T . T T T T T T T T T . T T T T T T T",
  "T T T T T T T . T T T T T T T T T . T T T T T T T",
  "T T T T T T T . T T T T T T T T . . . T T T T T T",
  "T T T T T T T . T T T T T T T T . S . T T T T T T",
  "T T T T T T T . T T T T T T T T . . . T T T T T T",
  "T T T T T T T T T T 0 T T T T T T T T T T T T T T",
  "T T T T T T T T T T . T T T T T T T T T T T T T T",
  "T T T T T T T T T T . T T T T T T T T T T T T T T",
  "T T T T T T T T T T . T T T T T T T T T T T T T T",
  "T T T T T T T T T T T T T T T T T T T T T T T T T",
];

/**
 * Room Configuration
 */
const ROOM_CONFIG: RoomConfig = {
  id: 'the-wilds-north',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: 'The Wilds — North',
    description: 'A dense forest with narrow winding paths and dangerous creatures.',
  },
  environment: 'outdoor',
  npcs: [],
};

/**
 * Build and export the room using the shared framework
 */
export function buildTheWildsNorth(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
