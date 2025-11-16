/**
 * The Wilds - Entrance
 * 
 * This is a CONFIGURATION FILE - all room logic is handled by the shared framework.
 * To create a new room, copy this file and modify the configuration below.
 */

import { RoomId, TileSubtype } from "../../../map";
import type { StoryRoom } from "../types";
import { buildRoom, type RoomConfig } from "../room-builder";

const SIZE = 25;

/**
 * Transition definitions - maps transition IDs to their destinations
 * Each transition in the visual map (0-9, A-Z) references a key here
 */
const TRANSITIONS = {
  '0': { roomId: 'story-torch-town' as RoomId, targetTransitionId: '0', offsetX: -1 },
  '5': { roomId: 'story-the-wilds-south' as RoomId, targetTransitionId: '0', offsetY: 1 },
  '6': { roomId: 'story-the-wilds-north' as RoomId, targetTransitionId: '0' },
  // Transitions to Wilds East (right edge) - offsetX: -1 spawns player 1 tile to the left
  '7': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '0', offsetX: 1 },
  '8': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '1', offsetX: 1 },
  '9': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '2', offsetX: 1 },
  '10': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '3', offsetX: 1 },
  '11': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '4', offsetX: 1 },
  '12': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '5', offsetX: 1 },
  '13': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '6', offsetX: 1 },
  '14': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '7', offsetX: 1 },
  '15': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '8', offsetX: 1 },
  '16': { roomId: 'story-the-wilds-east' as RoomId, targetTransitionId: '9', offsetX: 1 },
};

/**
 * Visual map layout using readable symbols.
 * 
 * NOTE: Spaces are ignored during parsing - use them for visual formatting!
 * Example: "# # T T" is the same as "##TT"
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
 * - '@' = town sign (subtype)
 * - 'd' = door (wall with door subtype)
 * - 'f' = torch on floor tile
 * - 'w' = torch on wall tile
 * - 'r' = pot with rune inside
 * - 'p' = pot with food inside
 * - 's' = pot with snake inside
 * 
 * Transitions (use keys from TRANSITIONS object above):
 * - '0', '1', '2', '3', '4' = Torch Town connections (rows 19-23)
 * - '5'-'9', 'A'-'Z' = available for future areas
 */
const VISUAL_MAP = [
  "# # T T T T T T T T T T T T T T T T T T 6 T T T T",
  "# # T . T T T T T . T . # # # T T T T T W T T T T",
  "# # f . T T T T . . T . # G # T T T T . . T T T T",
  "# # . . . . . . . T . . G . G T T T . . T T T T T",
  "# # . . . . . . T T . . . . . . . . . . . . W T T",
  "# # T T . . . . T . . . . . . . . . . . . . . T T",
  "# # f . . . . . . . . . . . . . . . . . . . . . T",
  "# # . . . . . . T T T . . . . # . # . . . . . . 7",
  "# # . . . . . . T T T . G T T T S . . . . . . T 8",
  "# # . . . # . . T . . . . . T T . . # G . . T T 9",
  "# # f G . G # . T . . . . . . . # . . . # . . . [10]",
  "# # . . . . # . T . . . . . . . . . . . . # . . [11]",
  "# # . . G . . . T . . . . S . . . . . # . T . . [12]",
  "# # . . . . # . . . . . . . . . . . . . . . . . [13]",
  "# # f . . . # . . . . . # # . . . . . . . T . . [14]",
  "# # . . # # . . . . . . . # . . . . . T # T . . [15]",
  "# # . . . . . T . # . . # . . . . . T T # . . . [16]",
  "# # . . . . . . . . . . . . . . . . . . . . # . T",
  "# # f . . . . . . . . . . . . . . . . . . . . . T",
  "# @ . . . . T T . . . T . T T # # # . . . # . . T",
  "0 . . . . . . . . . . # . . . . . . . . # . . T T",
  "# @ . . . T . . # . . . T T . . T . T . T T T . T",
  "# # f . . T . T . . T . T T T . . T . T . . T . T",
  "# # T T T T T T T T T T T T T . . . T T T T T T T",
  "# # T . T T T T T . T . # # # . . . . . . . p T T",
  "# # f . T T T T . . T . # r # . . . . . . . . T T",
  "# # . . . . . . . T . . # . # T T T 5 T T T T T M"
];

/**
 * Room Configuration
 * All room settings in one place - easy to copy and modify for new rooms
 */
const ROOM_CONFIG: RoomConfig = {
  id: 'story-the-wilds-entrance',
  size: SIZE,
  visualMap: VISUAL_MAP,
  transitions: TRANSITIONS,
  metadata: {
    displayLabel: 'The Wilds — Entrance',
    description: 'A dangerous wilderness area teeming with hostile creatures.',
  },
  environment: 'outdoor',
  npcs: [],
  randomItems: [
    { subtype: TileSubtype.ROCK, count: 20 }
  ],
};

/**
 * Build and export the room using the shared framework
 */
export function buildTheWildsEntrance(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
