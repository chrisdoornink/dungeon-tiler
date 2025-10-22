/**
 * The Wilds - Entrance
 * 
 * This is a CONFIGURATION FILE - all room logic is handled by the shared framework.
 * To create a new room, copy this file and modify the configuration below.
 */

import { RoomId } from "../../../map";
import type { StoryRoom } from "../types";
import { buildRoom, type RoomConfig } from "../room-builder";

const SIZE = 25;

/**
 * Transition definitions - maps transition IDs to their destinations
 * Each transition in the visual map (0-9, A-Z) references a key here
 */
const TRANSITIONS = {
  // Torch Town connections (left edge, rows 19-23)
  '0': { roomId: 'story-torch-town' as RoomId, target: [10, 33] as [number, number], returnPoint: [19, 1] as [number, number] },
  '1': { roomId: 'story-torch-town' as RoomId, target: [11, 33] as [number, number], returnPoint: [20, 1] as [number, number] },
  '2': { roomId: 'story-torch-town' as RoomId, target: [12, 33] as [number, number], returnPoint: [21, 1] as [number, number] },
  '3': { roomId: 'story-torch-town' as RoomId, target: [13, 33] as [number, number], returnPoint: [22, 1] as [number, number] },
  '4': { roomId: 'story-torch-town' as RoomId, target: [14, 33] as [number, number], returnPoint: [23, 1] as [number, number] },
  '5': { roomId: 'the-wilds-south' as RoomId, target: [1, 20] as [number, number], returnPoint: [24, 1] as [number, number] },
  '6': { roomId: 'the-wilds-north' as RoomId, target: [20, 10] as [number, number], returnPoint: [25, 1] as [number, number] },
  '7': { roomId: 'the-wilds-east' as RoomId, target: [1, 1] as [number, number], returnPoint: [26, 1] as [number, number] },
  '8': { roomId: 'the-wilds-east' as RoomId, target: [2, 1] as [number, number], returnPoint: [27, 1] as [number, number] },
  '9': { roomId: 'the-wilds-east' as RoomId, target: [3, 1] as [number, number], returnPoint: [28, 1] as [number, number] },
  '10': { roomId: 'the-wilds-east' as RoomId, target: [4, 1] as [number, number], returnPoint: [29, 1] as [number, number] },
  '11': { roomId: 'the-wilds-east' as RoomId, target: [5, 1] as [number, number], returnPoint: [30, 1] as [number, number] },
  '12': { roomId: 'the-wilds-east' as RoomId, target: [6, 1] as [number, number], returnPoint: [31, 1] as [number, number] },
  '13': { roomId: 'the-wilds-east' as RoomId, target: [7, 1] as [number, number], returnPoint: [32, 1] as [number, number] },
  '14': { roomId: 'the-wilds-east' as RoomId, target: [8, 1] as [number, number], returnPoint: [33, 1] as [number, number] },
  '15': { roomId: 'the-wilds-east' as RoomId, target: [9, 1] as [number, number], returnPoint: [34, 1] as [number, number] },
  '16': { roomId: 'the-wilds-east' as RoomId, target: [10, 1] as [number, number], returnPoint: [35, 1] as [number, number] },
  '17': { roomId: 'the-wilds-east' as RoomId, target: [11, 1] as [number, number], returnPoint: [36, 1] as [number, number] },
  '18': { roomId: 'the-wilds-east' as RoomId, target: [12, 1] as [number, number], returnPoint: [37, 1] as [number, number] },
  '19': { roomId: 'the-wilds-east' as RoomId, target: [13, 1] as [number, number], returnPoint: [38, 1] as [number, number] },
  '20': { roomId: 'the-wilds-east' as RoomId, target: [14, 1] as [number, number], returnPoint: [39, 1] as [number, number] },
  // Future transitions can be added here with letters or other numbers
  // 'A': { roomId: 'story-deep-wilds', target: [5, 5], returnPoint: [24, 12] },
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
  "# # T T T T T T T T T T T T T T T T T T 6 T T T T T",
  "# # T . T T T T T . T . # # # T T T T T W T T T T T",
  "# # f . T T T T . . T . # . # T T T T . . T T T T T",
  "# # . . . . . . . T . . . . . T T T . . T T T T T T",
  "# # . . . . . . T T . . . . . . . . . . . . . W T T",
  "# # T T . . . . T . . . . . . . . . . . . . . . T T",
  "# # f . . . . . . . . . . . . . . . . . . . . . . T",
  "# # . . . . . . T T T . . . . # . # . . . . . . . 7",
  "# # . . . . . . T T T . . T T T . # . . . . . . . 8",
  "# # . . . # . . T . . . . . T T . . # . . . . . . 9",
  "# # f G . G # . T . . . . . . . # . . . # . . . . 10",
  "# # . . . . # . T . . . . . . . . . . . . # . . . 11",
  "# # . . G . . . T . . . . . # # # # # # . # # . . 12",
  "# # . . . . # . . . . . . . # . . # . . . T . . . 13",
  "# # f . . . # . . . . . # # # # # . . . . T . . . 14",
  "# # . . # # . . . . . . . # . # # . . T # T . . . 15",
  "# # . . . . . T . # # # # . . . . . T T # T . . . 16",
  "w w f . . . . . . . . # . . . . . . . . . . . # . 17",
  "0 @ . . . . . . . . . . # . . . . . . . . . . . . 18",
  "1 . . T T . T T . . . T . T T # # # . . . . # . . 19",
  "2 . . . . . . . . . . # . . . . . . . # . # . . T 20",
  "3 . . . . T . . # . . . T T . . T . T . . T T T . T",
  "4 f . . . T . T . . T . T T T . T T . T T . . T . T",
  "# # T T T T T T T T T T T T T . T T T T T T T T T T",
  "# # T . T T T T T . T . # # # . . . . . . . . p T T",
  "# # f . T T T T . . T . # r # . . . . . . . . . T T",
  "# # . . . . . . . T . . # . # T T T 5 T T T T T T 17"
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
};

/**
 * Build and export the room using the shared framework
 */
export function buildTheWildsEntrance(): StoryRoom {
  return buildRoom(ROOM_CONFIG);
}
