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
  OPEN_ABYSS = 51,
  // Bomb item: BOMB is the carryable/chest pickup (grants a 3-pack), BOMB_LIVE is a
  // thrown bomb resting on the floor with its 1-turn fuse armed, SINGED is the scorch
  // overlay left on tiles caught in a blast, BREACH marks an outer-wall floor tile blown
  // open by a bomb (the doorway to the outside world).
  BOMB = 52,
  BOMB_LIVE = 53,
  SINGED = 54,
  BREACH = 55,
  // Pink realm prizes (scattered on the realm floor, picked up like a rock):
  // PINK_HEART is the rare pink flaming heart (full heal + 3 temporary pink hearts on
  // use, or kept as an end-screen prize); BERRY is the belted berry (heals 2-3 on use).
  PINK_HEART = 56,
  BERRY = 57,
  // Elemental terrain — see .claude/features/water-lava-elements/index.md.
  // LAVA is a walkable-but-instant-death floor overlay (a glowing wall): the player dies on
  // entry, most enemies avoid it, stone goblins cross freely, and a thrown rock cools a lava
  // tile into OBSIDIAN — a safe, walkable stepping stone (the only on-foot crossing).
  // WATER comes in two tiers: SHALLOW_WATER is free to wade (torch stays lit) and rings
  // DEEP_WATER, which the hero swims — the torch snuffs and stays out while swimming (and a
  // snuffed torch hides the hero from most enemies). Only true swimmers cross deep water.
  // A thrown rock landing in deep water becomes a STEPPING_STONE: a dry, walkable crossing.
  SHALLOW_WATER = 58,
  DEEP_WATER = 59,
  LAVA = 60,
  OBSIDIAN = 61,
  STEPPING_STONE = 62,
  // Boss-room entrances (see .claude/features/boss-daily-entrances/index.md).
  // BOSS_ENTRANCE is a lockless cave mouth (renders like CAVE_OPENING) that warps
  // the hero into the boss arena when stepped on — used behind a moat and in the
  // outside world. DARK_PORTAL is the "douse-to-see" variant: it is invisible and
  // inert while the hero's torch is lit, and only appears + warps once the torch is
  // out (snuffed by deep water). Kept distinct from CAVE_OPENING so story-mode cave
  // visuals never accidentally trigger a boss warp.
  BOSS_ENTRANCE = 63,
  DARK_PORTAL = 64,
  // WALL_SEAL is a walled-up doorway: a WALL tile wearing a crack decal. Bomb it and
  // it opens into whatever the day stashed behind it (a BOSS_ENTRANCE on the real one,
  // a reward POT on a decoy) — see sealPayloads in game-state.ts. Only ever placed on
  // a wall tile with FLOOR directly below it, because that is the only wall the
  // renderer gives a camera-facing face to (see Tile.tsx's isFloorBelow), so the crack
  // is always readable. The real seal is bracketed left and right by WALL_TORCHes;
  // decoys are bare. That torch-pair grammar is the whole tell.
  WALL_SEAL = 65,
  // SPIKES: the outdoor world's impassable hazard — a bed of iron spikes sunk into
  // the ground. It is a FLOOR overlay, NOT a wall tile, and that distinction is the
  // whole point: thrown rocks/runes fly OVER it (the throw scan only breaks on
  // non-FLOOR tiles), while the hero can never enter — bumping into it costs
  // SPIKES_BUMP_DAMAGE and the move is refused, so it can't be crossed at any HP.
  // Gives outdoor arenas a hard barrier where lava/abyss would look wrong.
  SPIKES = 66,
  // Switch-and-gate puzzle pieces (see .claude/features/boss-arena-switch-mechanic/index.md).
  // PRESSURE_PLATE is a floor switch the hero throws by standing on it — the step-on
  // pattern of LIGHTSWITCH, so the hero and the plate coexist on the tile — and it
  // becomes PRESSURE_PLATE_PRESSED for good once thrown. Which plate clears which
  // barrier is wired per-arena in GameState.gateGroups, not encoded in the subtype, so
  // one arena can run any number of plate/barrier sets.
  //
  // The barrier itself is just SPIKES. That reuses a shipped, fully-behaved hazard —
  // impassable to every entity, 1 damage and a refused move for the hero, rocks fly over
  // — and, being a FLOOR overlay rather than a wall, it looks identical from every
  // direction. An earlier version used a WALL tile wearing a portcullis, which needed a
  // separate sprite per orientation and, seen edge-on, could not read as a gate at all.
  //
  // SPIKE_HOLES is the retracted state: the spikes have sunk into the ground and left
  // bare sockets. Purely cosmetic and fully walkable — it is the visible record that a
  // switch was thrown, readable from across the room.
  //
  // Numbered from 67 because SPIKES took 66 on main while this branch was in flight.
  // Subtype numbers end up inside serialized maps, so these are numbered around a value
  // that has already shipped rather than shuffling it.
  PRESSURE_PLATE = 67,
  PRESSURE_PLATE_PRESSED = 68,
  SPIKE_HOLES = 69,
  // A fixed mouth that a boss's summons climb out of — a floor overlay you can walk over.
  // Placed by the arena, never generated. The Quarrymaster has exactly two, flanking his
  // chamber, and fields one monster from each. Art is undetermined; renders as a placeholder.
  SPAWN_POD = 70,
  // The Amber Moth: a teardrop of amber with a moth curled inside, wings faintly alight —
  // a moment of the world caught and kept. A one-time rewind charm from the Level 2 chest
  // pool. Break it and the hero is carried back up to 10 steps (the player picks where to
  // stop), and it also fires by itself the turn the hero would have died, rewinding 5.
  // Amber rather than a clockwork camera/stopwatch because every other item in the game is
  // organic-mystical, and amber is literally preserved time. See lib/map/rewind.ts for the
  // snapshot ring buffer and .claude/features/amber-moth-rewind/index.md for the design.
  AMBER_MOTH = 71,
  // A wisp curled up inside a pot, stamped at map generation (lib/map/wisp.ts
  // stampWispPots) so the SAME pots hold wisps for every player on a daily seed.
  // Never rendered — the marker only means "this pot releases a wisp when smashed";
  // the wisp turn hook consumes it. Rides on [POT, WISP] like [POT, SNAKE] does.
  WISP = 72,
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
