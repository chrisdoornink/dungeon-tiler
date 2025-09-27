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
};

// Define tile types as constants for clarity
export const FLOOR = 0;
export const WALL = 1;

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
