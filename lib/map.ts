// Tile type definition
export type TileType = {
  id: number;
  name: string;
  color: string;
  walkable: boolean;
};

// Enemy integration
import { Enemy, placeEnemies, updateEnemies } from "./enemy";
import { enemyTypeAssignement } from "./enemy_assignment";

// Map of tile types by ID
export const tileTypes: Record<number, TileType> = {
  0: { id: 0, name: "floor", color: "#ccc", walkable: true },
  1: { id: 1, name: "wall", color: "#333", walkable: false },
  2: { id: 2, name: "door", color: "#aa7", walkable: false },
  3: { id: 3, name: "key", color: "#ff0", walkable: true },
};

// Define tile types as constants for clarity
const FLOOR = 0;
const WALL = 1;

// Direction vectors for adjacent cells (up, right, down, left)
const dx = [0, 1, 0, -1];
const dy = [-1, 0, 1, 0];

// Constants for dungeon generation
const GRID_SIZE = 25;
const MIN_ROOM_SIZE = 3;
const MAX_ROOM_SIZE = 8;
// Maximum rooms is controlled by numRooms variable in generateMap

/**
 * Room definition for dungeon generation
 */
type Room = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Generate a random 25x25 dungeon map with rooms and connected walls
 * Following the requirements:
 * - Random generation with floor (0) and wall (1) tiles
 * - Connected walls forming continuous paths
 * - Up to 4 rooms surrounded by walls
 * - Majority of perimeter as walls
 * - 50-75% floor tiles
 * - All floor tiles are connected to each other
 */
export function generateMap(): number[][] {
  // Initialize grid with walls
  const grid: number[][] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push(WALL);
    }
    grid.push(row);
  }
  // Create 2-4 rooms
  const numRooms = 2 + Math.floor(Math.random() * 3); // 2-4 rooms
  const rooms: Room[] = [];

  for (let i = 0; i < numRooms; i++) {
    // Try to place a room that doesn't overlap with existing rooms
    let attempts = 0;
    let roomPlaced = false;

    while (!roomPlaced && attempts < 20) {
      // Random room size
      const width =
        MIN_ROOM_SIZE +
        Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));
      const height =
        MIN_ROOM_SIZE +
        Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));

      // Random room position (ensure room is fully within grid)
      const x = 1 + Math.floor(Math.random() * (GRID_SIZE - width - 2));
      const y = 1 + Math.floor(Math.random() * (GRID_SIZE - height - 2));

      const newRoom: Room = { x, y, width, height };

      // Check if this room overlaps with existing rooms
      let overlaps = false;
      for (const room of rooms) {
        if (roomsOverlap(newRoom, room)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        rooms.push(newRoom);
        carveRoom(grid, newRoom);
        roomPlaced = true;
      }

      attempts++;
    }
  }

  // Connect rooms with corridors
  for (let i = 0; i < rooms.length - 1; i++) {
    const roomA = rooms[i];
    const roomB = rooms[i + 1];
    createCorridor(grid, roomA, roomB);
  }

  // Ensure perimeter has at least 50% walls
  enforcePerimeterWalls(grid);

  // Adjust floor percentage to be between 50% and 75%
  adjustFloorPercentage(grid);

  // Ensure all floor tiles are connected
  ensureFloorsConnected(grid);

  return grid;
}

/**
 * Check if all floor tiles in the grid are connected to each other
 * Uses flood fill algorithm to verify connectivity
 * @param grid The tilemap grid to check
 * @returns True if all floor tiles are connected, false otherwise
 */
export function areAllFloorsConnected(grid: number[][]): boolean {
  const regions = findFloorRegions(grid);
  return regions.length === 1;
}

/**
 * Count the number of distinct rooms in the grid
 * A room is defined as a contiguous region of floor tiles surrounded by walls
 * @param grid The tilemap grid to analyze
 * @returns Number of rooms in the grid
 */
export function countRooms(grid: number[][]): number {
  return findFloorRegions(grid).length;
}

/**
 * Count rooms specifically for center-out algorithm by detecting rectangular structures
 * @param grid The tilemap grid to analyze
 * @returns Number of rectangular room structures
 */
/**
 * Map data structure that includes both tiles and subtypes
 */
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
}

export interface MapData {
  tiles: number[][];
  subtypes: number[][][];
}

/**
 * Generate a map with subtypes - all subtypes initialized to 0
 * @returns MapData object containing both tiles and subtypes arrays
 */
export function generateMapWithSubtypes(): MapData {
  const tiles = generateMap();
  // Initialize as a 3D array of empty arrays
  const subtypes = Array(GRID_SIZE)
    .fill(0)
    .map(() =>
      Array(GRID_SIZE)
        .fill(0)
        .map(() => [] as number[])
    );

  return {
    tiles,
    subtypes,
  };
}

/**
 * Generate a map with exit subtype
 * Places exactly one exit on a wall tile adjacent to floor tiles
 * @returns MapData object with exit subtype placed
 */
export function generateMapWithExit(baseMapData?: MapData): MapData {
  // Start with provided map (deep copy) or generate a new one with subtypes
  const mapData = baseMapData
    ? (JSON.parse(JSON.stringify(baseMapData)) as MapData)
    : generateMapWithSubtypes();

  const h = mapData.tiles.length;
  const w = mapData.tiles[0].length;

  // Collect all wall tiles adjacent to at least one floor for exit placement
  const wallsNextToFloor: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mapData.tiles[y][x] !== WALL) continue;
      const hasAdjacentFloor =
        (y > 0 && mapData.tiles[y - 1][x] === FLOOR) ||
        (y < h - 1 && mapData.tiles[y + 1][x] === FLOOR) ||
        (x > 0 && mapData.tiles[y][x - 1] === FLOOR) ||
        (x < w - 1 && mapData.tiles[y][x + 1] === FLOOR);
      if (hasAdjacentFloor) {
        wallsNextToFloor.push([y, x]);
      }
    }
  }

  // Need at least one wall for the exit
  if (wallsNextToFloor.length < 1) {
    console.warn("Not enough walls next to floor tiles for exit placement");
    return mapData;
  }

  // Shuffle candidates
  for (let i = wallsNextToFloor.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wallsNextToFloor[i], wallsNextToFloor[j]] = [
      wallsNextToFloor[j],
      wallsNextToFloor[i],
    ];
  }

  // Place the exit on the first candidate
  const [exitY, exitX] = wallsNextToFloor[0];
  mapData.subtypes[exitY][exitX] = [TileSubtype.EXIT];

  return mapData;
}

/**
 * Generate a map with key and lock subtypes
 * Places exactly one key on a floor tile and one lock on a wall tile adjacent to floor
 * @returns MapData object with key and lock subtypes placed
 */
export function generateMapWithKeyAndLock(): MapData {
  // Start with a map that already has door and exit
  const mapData = generateMapWithExit();

  // Find all available floor tiles for key placement
  const floorTiles: Array<[number, number]> = [];

  // Find all available wall tiles next to floor for lock placement
  const wallsNextToFloor: Array<[number, number]> = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      // Skip tiles that already have subtypes
      if (
        mapData.subtypes[y][x].length > 0 &&
        !mapData.subtypes[y][x].includes(TileSubtype.NONE)
      ) {
        continue;
      }

      // Check for floor tiles for key placement
      if (mapData.tiles[y][x] === FLOOR) {
        floorTiles.push([y, x]);
      }
      // Check for wall tiles next to floor for lock placement
      else if (mapData.tiles[y][x] === WALL) {
        const hasAdjacentFloor =
          (y > 0 && mapData.tiles[y - 1][x] === FLOOR) || // North
          (y < GRID_SIZE - 1 && mapData.tiles[y + 1][x] === FLOOR) || // South
          (x > 0 && mapData.tiles[y][x - 1] === FLOOR) || // West
          (x < GRID_SIZE - 1 && mapData.tiles[y][x + 1] === FLOOR); // East

        if (hasAdjacentFloor) {
          wallsNextToFloor.push([y, x]);
        }
      }
    }
  }

  // If we don't have enough valid positions, return the map without key/lock
  if (floorTiles.length < 1 || wallsNextToFloor.length < 1) {
    console.warn("Not enough valid tiles for key and lock placement");
    return mapData;
  }

  // Shuffle the arrays for random placement
  for (let i = floorTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [floorTiles[i], floorTiles[j]] = [floorTiles[j], floorTiles[i]];
  }

  for (let i = wallsNextToFloor.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wallsNextToFloor[i], wallsNextToFloor[j]] = [
      wallsNextToFloor[j],
      wallsNextToFloor[i],
    ];
  }

  // Place the key on a floor tile
  const [keyY, keyX] = floorTiles[0];
  mapData.subtypes[keyY][keyX] = [TileSubtype.KEY];

  // Place the lock on a wall next to floor
  const [lockY, lockX] = wallsNextToFloor[0];
  mapData.subtypes[lockY][lockX] = [TileSubtype.LOCK];

  return mapData;
}

/**
 * Add a lightswitch to the map
 * @param mapData The map data to add a lightswitch to
 * @returns The updated map data with a lightswitch added
 */
export function addLightswitchToMap(mapData: MapData): MapData {
  // Create a deep copy of the map data
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  // Find all eligible floor tiles (that don't already have a subtype)
  const eligibleTiles: Array<[number, number]> = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligibleTiles.push([y, x]);
      }
    }
  }

  // If we have eligible tiles, place a lightswitch on a random one
  if (eligibleTiles.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
    const [lightswitchY, lightswitchX] = eligibleTiles[randomIndex];

    // Set the lightswitch
    newMapData.subtypes[lightswitchY][lightswitchX] = [TileSubtype.LIGHTSWITCH];
    console.log(`Placed lightswitch at [${lightswitchY}, ${lightswitchX}]`);
  } else {
    console.warn(
      "Could not place lightswitch - no eligible floor tiles available"
    );
  }

  return newMapData;
}

/**
 * Add a small number of rocks to random empty floor tiles.
 * Minimal implementation to satisfy count tests: always place exactly 3 ROCKs
 * (or fewer if there aren't enough eligible tiles).
 */
export function addRocksToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  // Shuffle
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const toPlace = Math.min(3, eligible.length);
  for (let i = 0; i < toPlace; i++) {
    const [ry, rx] = eligible[i];
    newMapData.subtypes[ry][rx] = [TileSubtype.ROCK];
  }

  return newMapData;
}

/**
 * Add a small number of pots to random empty floor tiles.
 * Minimal implementation to satisfy count tests: always place exactly 3 POTs
 * (or fewer if there aren't enough eligible tiles).
 */
export function addPotsToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  // Shuffle
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const toPlace = Math.min(3, eligible.length);
  for (let i = 0; i < toPlace; i++) {
    const [py, px] = eligible[i];
    newMapData.subtypes[py][px] = [TileSubtype.POT];
  }

  return newMapData;
}

/**
 * Place a single generic KEY on a random empty floor tile
 */
export function addSingleKeyToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const h = newMapData.tiles.length;
  const w = newMapData.tiles[0].length;
  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        newMapData.tiles[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }
  if (eligible.length === 0) return newMapData;
  const idx = Math.floor(Math.random() * eligible.length);
  const [ky, kx] = eligible[idx];
  newMapData.subtypes[ky][kx] = [TileSubtype.KEY];
  return newMapData;
}

/**
 * Add an exit key to the map on a random floor tile without other subtypes
 * @param mapData The map data to add an exit key to
 * @returns The updated map data with an exit key added
 */
export function addExitKeyToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligibleTiles: Array<[number, number]> = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligibleTiles.push([y, x]);
      }
    }
  }

  if (eligibleTiles.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
    const [ey, ex] = eligibleTiles[randomIndex];
    newMapData.subtypes[ey][ex] = [TileSubtype.EXITKEY];
    console.log(`Placed exit key at [${ey}, ${ex}]`);
  } else {
    console.warn(
      "Could not place exit key - no eligible floor tiles available"
    );
  }

  return newMapData;
}

/**
 * Add chests (with sword/shield contents) to random floor tiles.
 * All chests are locked and require a KEY to open.
 */
export function addChestsToMap(mapData: MapData): MapData {
  // Always place exactly 2 chests: one SWORD and one SHIELD
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }

  // Shuffle
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  if (eligible.length < 2) return newMapData;

  // Choose two positions
  const [p1, p2] = [eligible[0], eligible[1]];
  // Randomize which content goes to which
  const contents = [TileSubtype.SWORD, TileSubtype.SHIELD];
  if (Math.random() < 0.5) contents.reverse();

  // Make all chests locked
  const lockIndices = [0, 1]; // Both indices are locked

  const placements: Array<[[number, number], number, boolean]> = [
    [p1, contents[0], lockIndices.includes(0)],
    [p2, contents[1], lockIndices.includes(1)],
  ];

  for (const [[cy, cx], content, locked] of placements) {
    const sub: number[] = [TileSubtype.CHEST, content];
    if (locked) sub.push(TileSubtype.LOCK);
    newMapData.subtypes[cy][cx] = sub;
    const contentName = content === TileSubtype.SWORD ? "SWORD" : "SHIELD";
    console.log(
      `Placed chest at [${cy}, ${cx}] content:${contentName} locked:${
        locked ? "YES" : "NO"
      }`
    );
  }

  return newMapData;
}

/**
 * Generate a complete map with all subtypes (door, exit, key, lock, lightswitch)
 * @returns MapData object with all subtypes properly placed
 */
export function generateCompleteMap(): MapData {
  // Base tiles
  const base = generateMapWithSubtypes();
  // Place exit
  const withExit = generateMapWithExit(base);
  // Place exit key and lightswitch
  const withExitKey = addExitKeyToMap(withExit);
  const withLights = addLightswitchToMap(withExitKey);
  // Place exactly two chests (sword + shield), some locked
  const withChests = addChestsToMap(withLights);
  // Place exactly one generic key for all generic locks
  const withKeys = addSingleKeyToMap(withChests);
  // Place a small number of pots on empty floor tiles
  const withPots = addPotsToMap(withKeys);
  // Place a small number of rocks on empty floor tiles
  const withRocks = addRocksToMap(withPots);
  // Place 3–6 wall torches on front-facing walls (wall with floor directly below)
  const withTorches = addWallTorchesToMap(withRocks);
  // Finally place player
  return addPlayerToMap(withTorches);
}

/**
 * Add a random number (3–6) of wall torches to front-facing walls.
 * A front-facing wall is defined as a WALL tile that has a FLOOR tile directly below it (south).
 * Avoids tiles that already carry important wall subtypes (EXIT, DOOR, LOCK) or any existing subtype.
 */
export function addWallTorchesToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const h = grid.length;
  const w = grid[0].length;

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== WALL) continue;
      // Front-facing: floor right below
      if (grid[y + 1][x] !== FLOOR) continue;
      // Skip if any existing subtypes (avoid doors/exits/locks/etc.)
      const subs = newMapData.subtypes[y][x];
      if (subs.length > 0 && !subs.includes(TileSubtype.NONE)) continue;
      eligible.push([y, x]);
    }
  }

  if (eligible.length === 0) return newMapData;

  // Shuffle eligible positions
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const baseCount = 3 + Math.floor(Math.random() * 4); // 3–6
  // Reduce by ~20%, but keep at least 1 if eligible exist
  const reduced = Math.max(1, Math.floor(baseCount * 0.8));
  const toPlace = Math.min(reduced, eligible.length);
  for (let i = 0; i < toPlace; i++) {
    const [ty, tx] = eligible[i];
    newMapData.subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
    // Optional: log for debugging
    // console.log(`Placed wall torch at [${ty}, ${tx}]`);
  }

  return newMapData;
}

/**
 * Find a strategic wall tile suitable for placing a DOOR: a single-tile choke between
 * two opposite floor tiles (left-right or up-down), with the other two neighbors being walls.
 * Returns [y, x] or null if none found.
 */
export function findStrategicDoorWall(
  mapData: MapData
): [number, number] | null {
  const h = mapData.tiles.length;
  const w = mapData.tiles[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mapData.tiles[y][x] !== WALL) continue;

      const up = y > 0 ? mapData.tiles[y - 1][x] : WALL;
      const down = y < h - 1 ? mapData.tiles[y + 1][x] : WALL;
      const left = x > 0 ? mapData.tiles[y][x - 1] : WALL;
      const right = x < w - 1 ? mapData.tiles[y][x + 1] : WALL;

      const upIsFloor = up === FLOOR;
      const downIsFloor = down === FLOOR;
      const leftIsFloor = left === FLOOR;
      const rightIsFloor = right === FLOOR;

      // Opposite-side floor neighbors form a corridor; other two sides should be walls
      const lrChoke = leftIsFloor && rightIsFloor && !upIsFloor && !downIsFloor;
      const udChoke = upIsFloor && downIsFloor && !leftIsFloor && !rightIsFloor;

      if (lrChoke || udChoke) {
        return [y, x];
      }
    }
  }
  return null;
}

/**
 * Add a player character to the map on a random floor tile
 * @param mapData The map data to add a player to
 * @returns The updated map data with a player added
 */
export function addPlayerToMap(mapData: MapData): MapData {
  // Create a deep copy of the map data
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  // Find all eligible floor tiles (that don't have a subtype)
  const eligibleTiles: Array<[number, number]> = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligibleTiles.push([y, x]);
      }
    }
  }

  // If we have eligible tiles, place a player on a random one
  if (eligibleTiles.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
    const [playerY, playerX] = eligibleTiles[randomIndex];

    // Place the player
    newMapData.subtypes[playerY][playerX] = [TileSubtype.PLAYER];
    console.log(`Placed player at [${playerY}, ${playerX}]`);
  } else {
    console.warn("Could not place player - no eligible floor tiles available");
  }

  return newMapData;
}

/**
 * Find the current player position on the map
 * @param mapData The map data to search for player
 * @returns The [y, x] coordinates of the player or null if not found
 */
export function findPlayerPosition(mapData: MapData): [number, number] | null {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      // Check if the PLAYER subtype is in the array
      if (mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) {
        return [y, x];
      }
    }
  }
  return null;
}

/**
 * Throw a rock up to 4 tiles in the player's facing direction.
 * Minimal slice: if inventory has a rock and there is a clear 4-tile floor path,
 * land a ROCK on the 4th tile and decrement rockCount. No collisions/effects yet.
 */
export function performThrowRock(gameState: GameState): GameState {
  const pos = findPlayerPosition(gameState.mapData);
  if (!pos) return gameState;
  const [py, px] = pos;
  const count = gameState.rockCount ?? 0;
  if (count <= 0) return gameState;

  // Treat throw as a player turn: enemies move first relative to current player position
  const preTickState: GameState = { ...gameState };
  // Reset transient deaths for this tick
  preTickState.recentDeaths = [];
  if (preTickState.enemies && Array.isArray(preTickState.enemies)) {
    const damage = updateEnemies(
      preTickState.mapData.tiles,
      preTickState.enemies,
      { y: py, x: px },
      {
        rng: preTickState.combatRng,
        defense: preTickState.hasShield ? 2 : 0,
        // Ghosts adjacent this tick should not deal damage
        suppress: (e) =>
          Math.abs(e.y - py) + Math.abs(e.x - px) === 1 && e.kind === "ghost",
      }
    );
    if (damage > 0) {
      const applied = Math.min(2, damage);
      preTickState.heroHealth = Math.max(0, preTickState.heroHealth - applied);
      preTickState.stats = {
        ...preTickState.stats,
        damageTaken: preTickState.stats.damageTaken + applied,
      };
    }
    // Note: Do NOT apply adjacent ghost vanish on rock-throw turns; only move enemies.
  }

  // Determine direction vector
  let vx = 0,
    vy = 0;
  switch (preTickState.playerDirection) {
    case Direction.UP:
      vy = -1;
      break;
    case Direction.RIGHT:
      vx = 1;
      break;
    case Direction.DOWN:
      vy = 1;
      break;
    case Direction.LEFT:
      vx = -1;
      break;
  }

  const newMapData = JSON.parse(
    JSON.stringify(preTickState.mapData)
  ) as MapData;
  // Verify a clear floor path for 4 tiles
  let ty = py;
  let tx = px;
  for (let step = 1; step <= 4; step++) {
    ty += vy;
    tx += vx;
    if (ty < 0 || ty >= GRID_SIZE || tx < 0 || tx >= GRID_SIZE) {
      // Early stop: consume a rock, no placement (future: collide/bam)
      return { ...preTickState, rockCount: count - 1 };
    }
    // Check enemy collision first
    const enemies = preTickState.enemies ?? [];
    const hitIdx = enemies.findIndex((e) => e.y === ty && e.x === tx);
    if (hitIdx !== -1) {
      const newEnemies = enemies.slice();
      const target: Enemy = newEnemies[hitIdx];
      const newHealth = (target.health ?? 1) - 2; // rock deals 2 damage
      if (newHealth <= 0) {
        // Enemy dies: remove and record for spirit VFX
        const removed = newEnemies.splice(hitIdx, 1)[0];
        const newStats = {
          ...preTickState.stats,
          enemiesDefeated: preTickState.stats.enemiesDefeated + 1,
        };
        // Track per-kind kill for rock kills
        const byKind = newStats.byKind || { goblin: 0, ghost: 0, 'stone-exciter': 0 };
        if (removed.kind === 'goblin') byKind.goblin += 1;
        else if (removed.kind === 'ghost') byKind.ghost += 1;
        else if (removed.kind === 'stone-exciter') byKind['stone-exciter'] += 1;
        newStats.byKind = byKind;
        const newRecent = (
          preTickState.recentDeaths ? preTickState.recentDeaths.slice() : []
        ).concat([[removed.y, removed.x] as [number, number]]);
        return {
          ...preTickState,
          enemies: newEnemies,
          stats: newStats,
          recentDeaths: newRecent,
          rockCount: count - 1,
        };
      } else {
        // Enemy survives: update its health in place
        target.health = newHealth;
        newEnemies[hitIdx] = target;
        return {
          ...preTickState,
          enemies: newEnemies,
          rockCount: count - 1,
        };
      }
    }
    if (newMapData.tiles[ty][tx] !== FLOOR) {
      // Early stop on wall/obstacle: consume a rock, no placement
      return { ...preTickState, rockCount: count - 1 };
    }
    // Floor tile: check for pot collision
    const subs = newMapData.subtypes[ty][tx] || [];
    if (subs.includes(TileSubtype.POT)) {
      // Remove the pot and consume the rock; no rock placement
      newMapData.subtypes[ty][tx] = subs.filter((s) => s !== TileSubtype.POT);
      return { ...preTickState, mapData: newMapData, rockCount: count - 1 };
    }
  }

  // Land the rock on the 4th tile
  newMapData.subtypes[ty][tx] = [TileSubtype.ROCK];

  return {
    ...preTickState,
    mapData: newMapData,
    rockCount: count - 1,
  };
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

/**
 * Game state interface for tracking player inventory and game progress
 */
export interface GameState {
  hasKey: boolean; // Player has the universal generic key
  hasExitKey: boolean;
  hasSword?: boolean;
  hasShield?: boolean;
  mapData: MapData;
  showFullMap: boolean; // Whether to show the full map (ignores visibility constraints)
  win: boolean; // Win state when player opens exit and steps onto it
  playerDirection: Direction; // Track the player's facing direction
  enemies?: Enemy[]; // Active enemies on the map
  heroHealth: number; // Player health points for current run
  heroAttack: number; // Player base attack for current run
  // Optional RNG for combat variance injection in tests; falls back to Math.random
  combatRng?: () => number;
  // Inventory
  rockCount?: number; // Count of collected rocks
  stats: {
    damageDealt: number;
    damageTaken: number;
    enemiesDefeated: number;
    steps: number;
    byKind?: { goblin: number; ghost: number; 'stone-exciter': number };
  };
  // Transient: positions where enemies died this tick
  recentDeaths?: Array<[number, number]>;
  // Torch state: when false, player's personal light is out (e.g., stolen by ghost)
  heroTorchLit?: boolean;
}

/**
 * Initialize a new game state with a newly generated map
 * @returns A new GameState object
 */
export function initializeGameState(): GameState {
  const mapData = generateCompleteMap();
  // Find player position to place enemies at a safe distance
  const playerPos = findPlayerPosition(mapData);
  const enemies = playerPos
    ? placeEnemies({
        grid: mapData.tiles,
        player: { y: playerPos[0], x: playerPos[1] },
        count: Math.floor(Math.random() * 5) + 6, // 6–10 enemies
        minDistanceFromPlayer: 8,
      })
    : [];

  enemyTypeAssignement(enemies);

  if (enemies.length > 0) {
    console.log(
      `Placed ${enemies.length} enemies:`,
      enemies.map((e) => `[${e.y}, ${e.x}]`).join(", ")
    );
  } else {
    console.log("No enemies placed.");
  }

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN, // Default facing down/front
    enemies,
    heroHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    heroTorchLit: true,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: { goblin: 0, ghost: 0, 'stone-exciter': 0 },
    },
    recentDeaths: [],
  };
}

/**
 * Move the player in the specified direction if possible
 * @param gameState Current game state
 * @param direction Direction to move
 * @returns Updated game state after movement attempt
 */
export function movePlayer(
  gameState: GameState,
  direction: Direction
): GameState {
  const position = findPlayerPosition(gameState.mapData);
  if (!position) return gameState; // No player found

  const [currentY, currentX] = position;
  let newY = currentY;
  let newX = currentX;

  // Calculate new position based on direction
  switch (direction) {
    case Direction.UP:
      newY = Math.max(0, currentY - 1);
      break;
    case Direction.RIGHT:
      newX = Math.min(GRID_SIZE - 1, currentX + 1);
      break;
    case Direction.DOWN:
      newY = Math.min(GRID_SIZE - 1, currentY + 1);
      break;
    case Direction.LEFT:
      newX = Math.max(0, currentX - 1);
      break;
  }

  // If position didn't change, return state with updated direction only
  if (newY === currentY && newX === currentX) {
    return { ...gameState, playerDirection: direction };
  }

  // Deep clone the map data to avoid modifying the original
  const newMapData = JSON.parse(JSON.stringify(gameState.mapData)) as MapData;
  // Always update the player direction regardless of whether movement succeeds
  const newGameState = {
    ...gameState,
    mapData: newMapData,
    playerDirection: direction,
  };
  // Reset transient deaths for this tick
  newGameState.recentDeaths = [];
  // Track if player actually changed tiles this turn
  let moved = false;

  // Tick enemies BEFORE resolving player movement so adjacent enemies can attack
  const playerPosNow = [currentY, currentX] as [number, number];
  if (newGameState.enemies && Array.isArray(newGameState.enemies)) {
    const damage = updateEnemies(
      newMapData.tiles,
      newGameState.enemies,
      { y: playerPosNow[0], x: playerPosNow[1] },
      {
        rng: newGameState.combatRng,
        defense: newGameState.hasShield ? 2 : 0,
        // Suppress only when the player moves directly away from an adjacent enemy along the same axis
        suppress: (e) => {
          const dy = newY - currentY;
          const dx = newX - currentX;
          const adj = Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1;
          // Ghosts adjacent this tick should not deal damage
          if (e.kind === "ghost" && adj) return true;
          if (!adj) return false;
          // Enemy is to the right, player moved left
          if (e.y === currentY && e.x === currentX + 1 && dx === -1)
            return true;
          // Enemy is to the left, player moved right
          if (e.y === currentY && e.x === currentX - 1 && dx === 1) return true;
          // Enemy is below, player moved up
          if (e.x === currentX && e.y === currentY + 1 && dy === -1)
            return true;
          // Enemy is above, player moved down
          if (e.x === currentX && e.y === currentY - 1 && dy === 1) return true;
          return false;
        },
      }
    );
    if (damage > 0) {
      const applied = Math.min(2, damage);
      newGameState.heroHealth = Math.max(0, newGameState.heroHealth - applied);
      newGameState.stats.damageTaken += applied;
    }
    console.log(
      "Enemies updated:",
      newGameState.enemies.map((e) => `[${e.y}, ${e.x}]`).join(", ")
    );

    // Ghost effect: any ghost ending adjacent snuffs torch and vanishes with death effect
    const adjacentGhosts = newGameState.enemies.filter(
      (e) =>
        e.kind === "ghost" &&
        Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1
    );
    if (adjacentGhosts.length > 0) {
      newGameState.heroTorchLit = false;
      // Record death VFX positions
      for (const g of adjacentGhosts) {
        newGameState.recentDeaths?.push([g.y, g.x]);
      }
      // Count them as defeated
      newGameState.stats.enemiesDefeated += adjacentGhosts.length;
      // Track type-specific defeats (all ghosts here)
      if (!newGameState.stats.byKind) newGameState.stats.byKind = { goblin: 0, ghost: 0, 'stone-exciter': 0 };
      newGameState.stats.byKind.ghost += adjacentGhosts.length;
      // Remove adjacent ghosts from active enemies
      newGameState.enemies = newGameState.enemies.filter(
        (e) =>
          !(
            e.kind === "ghost" &&
            Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1
          )
      );
    }
  }

  // Check if the new position is a wall
  if (newMapData.tiles[newY][newX] === WALL) {
    // Check if it's a door or lock
    const subtype = newMapData.subtypes[newY][newX];

    // If it's a door, player can pass through
    if (subtype.includes(TileSubtype.DOOR)) {
      // Convert the door to floor when player passes through
      newMapData.tiles[newY][newX] = FLOOR;
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
        (type) => type !== TileSubtype.DOOR
      );

      // Move player to the new position
      newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
        currentX
      ].filter((type) => type !== TileSubtype.PLAYER);
      newMapData.subtypes[newY][newX].push(TileSubtype.PLAYER);
      moved = true;

      // Relight hero torch if adjacent to any wall torch after moving
      const adj: Array<[number, number]> = [
        [newY - 1, newX],
        [newY + 1, newX],
        [newY, newX - 1],
        [newY, newX + 1],
      ];
      for (const [ay, ax] of adj) {
        if (
          ay >= 0 &&
          ay < GRID_SIZE &&
          ax >= 0 &&
          ax < GRID_SIZE &&
          newMapData.subtypes[ay][ax]?.includes(TileSubtype.WALL_TORCH)
        ) {
          newGameState.heroTorchLit = true;
          break;
        }
      }
    }
    // If it's a lock and player has key, unlock it
    else if (subtype.includes(TileSubtype.LOCK) && newGameState.hasKey) {
      // Convert the lock to floor when unlocked; universal key is not consumed
      newMapData.tiles[newY][newX] = FLOOR;
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
        (type) => type !== TileSubtype.LOCK
      );
      // Move the player onto the unlocked floor tile
      newMapData.subtypes[currentY][currentX].filter(
        (type) => type !== TileSubtype.PLAYER
      );
      newMapData.subtypes[newY][newX].push(TileSubtype.PLAYER);
      // Keep hasKey true (universal key is not consumed)
      moved = true;
    }
    // If it's an exit, require EXITKEY to open
    else if (subtype.includes(TileSubtype.EXIT)) {
      if (newGameState.hasExitKey) {
        // Convert the exit to floor when player opens it
        newMapData.tiles[newY][newX] = FLOOR;
        newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][
          newX
        ].filter((type) => type !== TileSubtype.EXIT);

        // Move player to the new position and consume the exit key
        newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
          currentX
        ].filter((type) => type !== TileSubtype.PLAYER);
        newMapData.subtypes[newY][newX].push(TileSubtype.PLAYER);
        newGameState.hasExitKey = false;
        newGameState.win = true;
        moved = true;

        // Here you would typically trigger a win condition
        console.log("Player opened the exit!");
      }
      // If no exit key, blocked by exit wall
    }

    // For regular walls, do nothing - player cannot move there
    return newGameState;
  }

  // If the new position is a floor tile
  if (newMapData.tiles[newY][newX] === FLOOR) {
    const subtype = newMapData.subtypes[newY][newX];

    // If it's a POT, reveal content without moving
    if (subtype.includes(TileSubtype.POT)) {
      // Reveal FOOD or MED with a simple 50/50
      const reveal = Math.random() < 0.5 ? TileSubtype.FOOD : TileSubtype.MED;
      newMapData.subtypes[newY][newX] = [reveal];
      return newGameState;
    }

    // If it's FOOD or MED, apply healing (capped at 5) and proceed to move
    if (
      subtype.includes(TileSubtype.FOOD) ||
      subtype.includes(TileSubtype.MED)
    ) {
      const heal = subtype.includes(TileSubtype.MED) ? 2 : 1;
      newGameState.heroHealth = Math.min(5, newGameState.heroHealth + heal);
      // Movement/clearing of the item happens below in the generic move logic
    }

    // If it's an item revealed from a chest (SWORD/SHIELD), pick it up on entry
    // but ONLY if the tile no longer has a CHEST (i.e., after it's been opened)
    if (
      (subtype.includes(TileSubtype.SWORD) ||
        subtype.includes(TileSubtype.SHIELD)) &&
      !subtype.includes(TileSubtype.CHEST)
    ) {
      if (subtype.includes(TileSubtype.SWORD)) {
        newGameState.hasSword = true;
        console.log("Player obtained a SWORD!");
      }
      if (subtype.includes(TileSubtype.SHIELD)) {
        newGameState.hasShield = true;
        console.log("Player obtained a SHIELD!");
      }
      // Clearing of item happens below when we set dest tile subtypes
    }

    // If it's a ROCK, pick it up (increment inventory) and clear the tile
    if (subtype.includes(TileSubtype.ROCK)) {
      newGameState.rockCount = (newGameState.rockCount || 0) + 1;
      newMapData.subtypes[newY][newX] = [];
      console.log(
        "Player picked up a rock! Total rocks:",
        newGameState.rockCount
      );
    }

    // Combat: if an enemy occupies the destination, resolve attack
    if (newGameState.enemies && Array.isArray(newGameState.enemies)) {
      const idx = newGameState.enemies.findIndex(
        (e) => e.y === newY && e.x === newX
      );
      if (idx !== -1) {
        // Apply hero damage to enemy with variance and sword bonus
        const enemy = newGameState.enemies[idx];
        const rng = newGameState.combatRng; // undefined => no variance
        const variance = rng
          ? ((r) => (r < 1 / 3 ? -1 : r < 2 / 3 ? 0 : 1))(rng())
          : 0;
        const swordBonus = newGameState.hasSword ? 2 : 0;
        // Stone-exciter takes exactly 1 damage from melee regardless of sword/variance
        const heroDamage =
          enemy.kind === "stone-exciter"
            ? 1
            : Math.max(0, newGameState.heroAttack + swordBonus + variance);
        enemy.health -= heroDamage;
        newGameState.stats.damageDealt += heroDamage;

        if (enemy.health <= 0) {
          // Remove enemy; player stays in current position (do not step into enemy tile)
          newGameState.enemies.splice(idx, 1);
          newGameState.stats.enemiesDefeated += 1;
          // Track per-kind kill for melee
          if (!newGameState.stats.byKind) newGameState.stats.byKind = { goblin: 0, ghost: 0, 'stone-exciter': 0 };
          if (enemy.kind === 'goblin') newGameState.stats.byKind.goblin += 1;
          else if (enemy.kind === 'ghost') newGameState.stats.byKind.ghost += 1;
          else if (enemy.kind === 'stone-exciter') newGameState.stats.byKind['stone-exciter'] += 1;
          // Record death at the enemy's tile (newY, newX)
          if (!newGameState.recentDeaths) newGameState.recentDeaths = [];
          newGameState.recentDeaths.push([newY, newX]);

          // After combat (no movement), update enemies relative to current player position
          const finalPlayerPos = [currentY, currentX] as [number, number];
          if (newGameState.enemies && Array.isArray(newGameState.enemies)) {
            const damage = updateEnemies(
              newMapData.tiles,
              newGameState.enemies,
              { y: finalPlayerPos[0], x: finalPlayerPos[1] },
              {
                rng: newGameState.combatRng,
                defense: newGameState.hasShield ? 2 : 0,
              }
            );
            if (damage > 0) {
              const applied = Math.min(2, damage);
              newGameState.heroHealth = Math.max(
                0,
                newGameState.heroHealth - applied
              );
              newGameState.stats.damageTaken += applied;
            }
            console.log(
              "Enemies updated:",
              newGameState.enemies.map((e) => `[${e.y}, ${e.x}]`).join(", ")
            );
          }
          return newGameState;
        } else {
          // Enemy survived: player stays put; update enemies and return
          const finalPlayerPos = [currentY, currentX] as [number, number];
          const damage = updateEnemies(
            newMapData.tiles,
            newGameState.enemies,
            { y: finalPlayerPos[0], x: finalPlayerPos[1] },
            {
              rng: newGameState.combatRng,
              defense: newGameState.hasShield ? 2 : 0,
            }
          );
          if (damage > 0) {
            const applied = Math.min(2, damage);
            newGameState.heroHealth = Math.max(
              0,
              newGameState.heroHealth - applied
            );
            newGameState.stats.damageTaken += applied;
          }
          console.log(
            "Enemies updated:",
            newGameState.enemies.map((e) => `[${e.y}, ${e.x}]`).join(", ")
          );
          return newGameState;
        }
      }
    }

    // If it's a key, pick it up
    if (subtype.includes(TileSubtype.KEY)) {
      // Universal generic key: once picked up, always available for generic locks
      newGameState.hasKey = true;
      newMapData.subtypes[newY][newX] = [];
      console.log("Player picked up a key!");
    }

    // If it's an exit key, pick it up
    if (subtype.includes(TileSubtype.EXITKEY)) {
      newGameState.hasExitKey = true;
      newMapData.subtypes[newY][newX] = [];
      console.log("Player picked up the exit key!");
    }

    // If it's a lightswitch, toggle full map visibility
    if (subtype.includes(TileSubtype.LIGHTSWITCH)) {
      // Toggle the showFullMap flag
      newGameState.showFullMap = !newGameState.showFullMap;
      console.log(
        `Player toggled light switch! Full map visibility: ${
          newGameState.showFullMap ? "ON" : "OFF"
        }`
      );

      // Keep the lightswitch on the tile (don't remove it)
      // Player and lightswitch will coexist on the same tile
    }

    // If it's a chest, handle opening logic (supports optional lock)
    if (subtype.includes(TileSubtype.CHEST)) {
      const isLocked = subtype.includes(TileSubtype.LOCK);
      // If locked and no key, block movement and do not open
      if (isLocked && !newGameState.hasKey) {
        console.log("Chest is locked. Need a key.");
        return newGameState;
      }

      // Remove LOCK if present (universal key is not consumed)
      if (isLocked && newGameState.hasKey) {
        newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][
          newX
        ].filter((t) => t !== TileSubtype.LOCK);
      }

      // Open the chest in place, but DO NOT grant item yet and DO NOT move the player
      // Keep the item (SWORD/SHIELD) visible on top of the opened chest
      // Remove only the CHEST marker, leave item subtype as-is
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
        (t) => t !== TileSubtype.CHEST
      );
      if (!newMapData.subtypes[newY][newX].includes(TileSubtype.OPEN_CHEST)) {
        newMapData.subtypes[newY][newX].push(TileSubtype.OPEN_CHEST);
      }
      // Return without moving
      return newGameState;
    }

    // Move player to the new position
    newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
      currentX
    ].filter((type) => type !== TileSubtype.PLAYER);
    // If current position array is empty after filtering, make it an empty array
    if (newMapData.subtypes[currentY][currentX].length === 0) {
      newMapData.subtypes[currentY][currentX] = [];
    }

    // Handle special cases where player coexists with a persistent tile subtype
    const destSubtypes = newMapData.subtypes[newY][newX];
    if (
      destSubtypes.includes(TileSubtype.LIGHTSWITCH) ||
      destSubtypes.includes(TileSubtype.OPEN_CHEST) ||
      destSubtypes.includes(TileSubtype.CHEST)
    ) {
      if (!destSubtypes.includes(TileSubtype.PLAYER)) {
        destSubtypes.push(TileSubtype.PLAYER);
      }
    } else {
      // For other tiles, just set to player
      newMapData.subtypes[newY][newX] = [TileSubtype.PLAYER];
    }
    // If we picked up FOOD/MED/SWORD/SHIELD, remove those subtypes from dest
    newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
      (t) =>
        t !== TileSubtype.FOOD &&
        t !== TileSubtype.MED &&
        t !== TileSubtype.SWORD &&
        t !== TileSubtype.SHIELD
    );
    moved = true;

    // Relight hero torch if adjacent to any wall torch after normal movement
    const adj2: Array<[number, number]> = [
      [newY - 1, newX],
      [newY + 1, newX],
      [newY, newX - 1],
      [newY, newX + 1],
    ];
    for (const [ay, ax] of adj2) {
      if (
        ay >= 0 &&
        ay < GRID_SIZE &&
        ax >= 0 &&
        ax < GRID_SIZE &&
        newMapData.subtypes[ay][ax]?.includes(TileSubtype.WALL_TORCH)
      ) {
        newGameState.heroTorchLit = true;
        break;
      }
    }
  }

  // Enemies have already been updated at the start of this turn
  // Increment steps if a move occurred
  if (moved) {
    newGameState.stats.steps += 1;
  }

  return newGameState;
}

/**
 * Check if two rooms overlap
 */
function roomsOverlap(roomA: Room, roomB: Room): boolean {
  return (
    roomA.x <= roomB.x + roomB.width &&
    roomA.x + roomA.width >= roomB.x &&
    roomA.y <= roomB.y + roomB.height &&
    roomA.y + roomA.height >= roomB.y
  );
}

/**
 * Carve a room in the grid by setting its tiles to floor
 */
function carveRoom(grid: number[][], room: Room): void {
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      grid[y][x] = FLOOR;
    }
  }
}

/**
 * Create a corridor between two rooms
 */
function createCorridor(grid: number[][], roomA: Room, roomB: Room): void {
  // Get center points of each room
  const x1 = Math.floor(roomA.x + roomA.width / 2);
  const y1 = Math.floor(roomA.y + roomA.height / 2);
  const x2 = Math.floor(roomB.x + roomB.width / 2);
  const y2 = Math.floor(roomB.y + roomB.height / 2);

  // Create an L-shaped corridor
  if (Math.random() < 0.5) {
    // Horizontal then vertical
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      grid[y1][x] = FLOOR;
    }
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      grid[y][x2] = FLOOR;
    }
  } else {
    // Vertical then horizontal
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      grid[y][x1] = FLOOR;
    }
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      grid[y2][x] = FLOOR;
    }
  }
}

/**
 * Ensure that the perimeter has at least 50% wall tiles
 */
function enforcePerimeterWalls(grid: number[][]): void {
  // Top and bottom rows
  for (let x = 0; x < GRID_SIZE; x++) {
    if (Math.random() < 0.7) {
      // 70% chance of being a wall
      grid[0][x] = WALL;
      grid[GRID_SIZE - 1][x] = WALL;
    }
  }

  // Left and right columns
  for (let y = 0; y < GRID_SIZE; y++) {
    if (Math.random() < 0.7) {
      // 70% chance of being a wall
      grid[y][0] = WALL;
      grid[y][GRID_SIZE - 1] = WALL;
    }
  }
}

/**
 * Ensure all floor tiles are connected
 * Uses a flood-fill algorithm to check connectivity and connects separate regions
 */
function ensureFloorsConnected(grid: number[][]): void {
  // Step 1: Find all separate floor regions using flood fill
  const regions = findFloorRegions(grid);

  // If there's only one region, all floors are already connected
  if (regions.length <= 1) return;

  // Step 2: Connect all regions to the first region
  for (let i = 1; i < regions.length; i++) {
    connectRegions(grid, regions[0], regions[i]);
  }
}

/**
 * Find all separate floor regions in the grid
 * @returns Array of regions, each containing coordinates of floor tiles in that region
 */
function findFloorRegions(grid: number[][]): Array<Array<[number, number]>> {
  const height = grid.length;
  const width = grid[0].length;
  const visited = Array(height)
    .fill(0)
    .map(() => Array(width).fill(false));
  const regions: Array<Array<[number, number]>> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === FLOOR && !visited[y][x]) {
        // Found a new region, flood fill to find all connected floor tiles
        const region: Array<[number, number]> = [];
        const queue: Array<[number, number]> = [[y, x]];
        visited[y][x] = true;

        while (queue.length > 0) {
          const [cy, cx] = queue.shift()!;
          region.push([cy, cx]);

          // Check all four adjacent cells (up, right, down, left)
          for (let dir = 0; dir < 4; dir++) {
            const ny = cy + dy[dir];
            const nx = cx + dx[dir];

            if (
              ny >= 0 &&
              ny < height &&
              nx >= 0 &&
              nx < width &&
              grid[ny][nx] === FLOOR &&
              !visited[ny][nx]
            ) {
              queue.push([ny, nx]);
              visited[ny][nx] = true;
            }
          }
        }

        regions.push(region);
      }
    }
  }

  return regions;
}

/**
 * Connect two separate floor regions by creating a path between them
 */
function connectRegions(
  grid: number[][],
  regionA: Array<[number, number]>,
  regionB: Array<[number, number]>
): void {
  // Find the closest pair of tiles between the two regions
  let minDist = Infinity;
  let bestPair: [[number, number], [number, number]] | null = null;

  for (const [y1, x1] of regionA) {
    for (const [y2, x2] of regionB) {
      const dist = Math.abs(y2 - y1) + Math.abs(x2 - x1);
      if (dist < minDist) {
        minDist = dist;
        bestPair = [
          [y1, x1],
          [y2, x2],
        ];
      }
    }
  }

  if (bestPair) {
    const [[y1, x1], [y2, x2]] = bestPair;

    // Create a path between the two points
    // First horizontally, then vertically (L-shaped path)
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      grid[y1][x] = FLOOR;
    }

    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      grid[y][x2] = FLOOR;
    }
  }
}

/**
 * Adjust the percentage of floor tiles to be between 50% and 75%
 */
function adjustFloorPercentage(grid: number[][]): void {
  let floorCount = 0;
  const totalTiles = GRID_SIZE * GRID_SIZE;

  // Count current floor tiles
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === FLOOR) floorCount++;
    }
  }

  const minFloor = Math.ceil(totalTiles * 0.5);
  const maxFloor = Math.floor(totalTiles * 0.75);

  if (floorCount < minFloor) {
    // Add more floor tiles if below minimum
    while (floorCount < minFloor) {
      const x = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));
      const y = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));

      if (grid[y][x] === WALL) {
        grid[y][x] = FLOOR;
        floorCount++;
      }
    }
  } else if (floorCount > maxFloor) {
    // Convert some floor tiles to walls if above maximum
    while (floorCount > maxFloor) {
      const x = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));
      const y = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));

      if (grid[y][x] === FLOOR) {
        grid[y][x] = WALL;
        floorCount--;
      }
    }
  }
}
