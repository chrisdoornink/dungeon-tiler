// Core map constants and enumerations shared across map modules.

// Tile type definition used by the legend and rendering layer.
export type TileType = {
  id: number;
  name: string;
  color: string;
  walkable: boolean;
};

// Map of tile types by ID
export const tileTypes: Record<number, TileType> = {
  0: { id: 0, name: "floor", color: "#ccc", walkable: true },
  1: { id: 1, name: "wall", color: "#333", walkable: false },
  2: { id: 2, name: "door", color: "#aa7", walkable: false },
  3: { id: 3, name: "key", color: "#ff0", walkable: true },
  4: { id: 4, name: "roof", color: "#8b4513", walkable: false },
  5: { id: 5, name: "flowers", color: "#90EE90", walkable: true },
  6: { id: 6, name: "tree", color: "#228B22", walkable: false },
};

// Define tile types as constants for clarity
export const FLOOR = 0;
export const WALL = 1;
export const ROOF = 4;
export const FLOWERS = 5;
export const TREE = 6;

export const DEFAULT_ROOM_ID = "__base__";
export type RoomId = string;

// Direction vectors for adjacent cells (up, right, down, left)
export const dx = [0, 1, 0, -1];
export const dy = [-1, 0, 1, 0];

// Constants for dungeon generation (configurable via env)
export const GRID_SIZE = Number(process.env.NEXT_PUBLIC_MAP_SIZE) || 25;
export const MIN_ROOM_SIZE = 3;
export const MAX_ROOM_SIZE = 8;

// Subtype enum values for better readability
export enum TileSubtype {
  NONE = 0,
  EXIT = 1,
  DOOR = 2,
  KEY = 3,
  LOCK = 4,
  PLAYER = 5,
  LIGHTSWITCH = 6,
  EXITKEY = 7,
  CHEST = 8,
  SWORD = 9,
  SHIELD = 10,
  OPEN_CHEST = 11,
  POT = 12,
  ROCK = 13,
  FOOD = 14,
  MED = 15,
  WALL_TORCH = 16,
  RUNE = 17,
  FAULTY_FLOOR = 18,
  DARKNESS = 19,
  SNAKE = 20,
  ROOM_TRANSITION = 21,
  CHECKPOINT = 22,
  WINDOW = 23,
  CAVE_OPENING = 24,
  ROAD = 25,
  ROAD_STRAIGHT = 26,
  ROAD_CORNER = 27,
  ROAD_T = 28,
  ROAD_END = 29,
  ROAD_ROTATE_90 = 30,
  ROAD_ROTATE_180 = 31,
  ROAD_ROTATE_270 = 32,
  SIGN_STORE = 33,
  SIGN_LIBRARY = 34,
  SIGN_SMITHY = 35,
  BOOKSHELF = 36,
  TOWN_SIGN = 37,
  FLOOR_TORCH = 38,
  SNAKE_MEDALLION = 39,
  PORTAL = 40,
  BED_EMPTY_1 = 41,
  BED_EMPTY_2 = 42,
  BED_EMPTY_3 = 43,
  BED_EMPTY_4 = 44,
  BED_FULL_1 = 45,
  BED_FULL_2 = 46,
  BED_FULL_3 = 47,
  BED_FULL_4 = 48,
  PINK_RING = 49,
  EXTRA_HEART = 50,
}

/**
 * Enum representing possible movement directions
 */
export enum Direction {
  UP,
  RIGHT,
  DOWN,
  LEFT,
}
