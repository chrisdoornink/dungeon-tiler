/**
 * The Wilds - South
 * 
 * This is a CONFIGURATION FILE - all room logic is handled by the shared framework.
 * Similar landscape to the entrance with town wall protection on the left.
 */

import { RoomId } from "../../../map";
import type { StoryRoom } from "../types";
import { buildRoom, type RoomConfig } from "../room-builder";

const SIZE = 25;

/**
 * Transition definitions - maps transition IDs to their destinations
 */
const TRANSITIONS = {
  // Back to Wilds Entrance (bottom edge where '5' is located)
  '0': { roomId: 'story-the-wilds-entrance' as RoomId, target: [26, 18] as [number, number], returnPoint: [1, 20] as [number, number] },
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
 * - 'G' = goblin enemy
 * - 'S' = snake enemy
 * - 'W' = wisp (ghost) enemy
 * - 'f' = torch on floor tile
 * - 'p' = pot with food inside
 * 
 * Transitions:
 * - '0' = Back to Wilds Entrance
 */
const VISUAL_MAP = [
  "# # T T T T T T T T T T T T T T T T T T 0 T T T T T",
  "# # T . T T T T . . T T T T T . . T T T . T T T T T",
  "# # f . T T T . . . . T T T . . . . T T . . T T T T",
  "# # . . . . . . . . . . T . . . . . . . . . . T T T",
  "# # . . . . . . . . . . . . . . . . . . . . . . T T",
  "# # T T . . . . . . . . . . . . . . . . . . . . . T",
  "# # f . . . . . . . . . . . . . . . . . . . . . . T",
  "# # . . . . . T T . . . . . . . . . . . . . . . . T",
  "# # . . . . . T T T . . . . . . . . . . . . . . . T",
  "# # . . . . . . T . . . . . . . . . . . . . . . . T",
  "# # f G . . . . . . . . . . . . . . . . . . . . . T",
  "# # . . . . . . . . . . . . . . . . . . . . . . . T",
  "# # . . G . . . . . . . . . . . . . . . . . . . . T",
  "# # . . . . . . . . . . . . . . . . . . . . . . . T",
  "# # f . . . . . . . . . . . . . . . . . . . . . . T",
  "# # . . . . . . . . . . . . . . . . . . . . . . T T",
  "# # . . . . . . . . . . . . . . . . . . . . . T T T",
  "# # . . . S . . . . . . . . . . . . . . . . T T T T",
  "w w f . . . . . . . . . . . . . . . . . . . T T T T",
  "w w . . . . . . . . . . . . . . . . . . . T T T T T",
  "w w . . . . . . . . . . . . . . . . . . T T T T T T",
  "w w . . . . . . . . . . . . . . . . . T T T T T T T",
  "w w . . . . . . . . . . . . . . . . T T T T T T T T",
  "w w . . . . . . . . . . . . . . . T T T T T T T T T",
  "# # T T T T T T T T T T T T T T T T T T T T T T T T",
];

/**
 * Room Configuration
 */
const ROOM_CONFIG: RoomConfig = {
  id: 'the-wilds-south',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: 'The Wilds — South',
    description: 'The southern wilds, protected by the town wall to the west.',
  },
  environment: 'outdoor',
  npcs: [],
};

/**
 * Build and export the room using the shared framework
 */
export function buildTheWildsSouth(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
