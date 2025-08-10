// Tile type definition
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
 * Generate a map with door and exit subtypes
 * Places exactly one door and one exit on wall tiles adjacent to floor tiles
 * @returns MapData object with door and exit subtypes placed
 */
export function generateMapWithDoorAndExit(): MapData {
  // Start with a basic map with subtypes
  const mapData = generateMapWithSubtypes();

  // Find all wall tiles that are adjacent to at least one floor tile
  const wallsNextToFloor: Array<[number, number]> = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      // Check if this is a wall tile
      if (mapData.tiles[y][x] === WALL) {
        // Check if it's adjacent to at least one floor tile
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

  // If we don't have at least two valid positions, return the basic map
  if (wallsNextToFloor.length < 2) {
    console.warn(
      "Not enough walls next to floor tiles for door and exit placement"
    );
    return mapData;
  }

  // Shuffle the array of valid wall positions
  for (let i = wallsNextToFloor.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wallsNextToFloor[i], wallsNextToFloor[j]] = [
      wallsNextToFloor[j],
      wallsNextToFloor[i],
    ];
  }

  // Place the door (first wall)
  const [doorY, doorX] = wallsNextToFloor[0];
  mapData.subtypes[doorY][doorX] = [TileSubtype.DOOR];

  // Place the exit (second wall)
  const [exitY, exitX] = wallsNextToFloor[1];
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
  const mapData = generateMapWithDoorAndExit();

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
 * Some chests will be locked and require a KEY to open.
 */
export function addChestsToMap(
  mapData: MapData,
  options: { count?: number; lockedChance?: number } = {}
): MapData {
  const { count = 2, lockedChance = 0.5 } = options;
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

  const placements = Math.min(count, eligible.length);
  for (let i = 0; i < placements; i++) {
    const [cy, cx] = eligible[i];
    const locked = Math.random() < lockedChance;
    const content = Math.random() < 0.5 ? TileSubtype.SWORD : TileSubtype.SHIELD;
    const sub: number[] = [TileSubtype.CHEST, content];
    if (locked) sub.push(TileSubtype.LOCK);
    newMapData.subtypes[cy][cx] = sub;
    const contentName = content === TileSubtype.SWORD ? "SWORD" : "SHIELD";
    console.log(
      `Placed chest at [${cy}, ${cx}] content:${contentName} locked:${locked ? "YES" : "NO"}`
    );
  }

  return newMapData;
}

/**
 * Generate a complete map with all subtypes (door, exit, key, lock, lightswitch)
 * @returns MapData object with all subtypes properly placed
 */
export function generateCompleteMap(): MapData {
  const mapData = generateMapWithKeyAndLock();
  const withExitKey = addExitKeyToMap(mapData);
  const mapWithLightswitch = addLightswitchToMap(withExitKey);
  const withChests = addChestsToMap(mapWithLightswitch);
  return addPlayerToMap(withChests);
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
  hasKey: boolean;
  hasExitKey: boolean;
  hasSword?: boolean;
  hasShield?: boolean;
  mapData: MapData;
  showFullMap: boolean; // Whether to show the full map (ignores visibility constraints)
  win: boolean; // Win state when player opens exit and steps onto it
}

/**
 * Initialize a new game state with a newly generated map
 * @returns A new GameState object
 */
export function initializeGameState(): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: generateCompleteMap(),
    showFullMap: false,
    win: false,
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

  // If position didn't change, return unchanged state
  if (newY === currentY && newX === currentX) return gameState;

  // Deep clone the map data to avoid modifying the original
  const newMapData = JSON.parse(JSON.stringify(gameState.mapData)) as MapData;
  const newGameState = { ...gameState, mapData: newMapData };

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
    }
    // If it's a lock and player has key, unlock it
    else if (subtype.includes(TileSubtype.LOCK) && newGameState.hasKey) {
      // Convert the lock to floor when unlocked
      newMapData.tiles[newY][newX] = FLOOR;
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
        (type) => type !== TileSubtype.LOCK
      );

      // Move player to the new position and consume the key
      newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
        currentX
      ].filter((type) => type !== TileSubtype.PLAYER);
      newMapData.subtypes[newY][newX].push(TileSubtype.PLAYER);
      newGameState.hasKey = false;
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

    // If it's a key, pick it up
    if (subtype.includes(TileSubtype.KEY)) {
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
      if (isLocked && !newGameState.hasKey) {
        // Block opening and movement if locked and no key
        return newGameState;
      }
      // If locked and we have a key, consume it
      if (isLocked && newGameState.hasKey) {
        newGameState.hasKey = false;
        // Remove LOCK from the tile
        newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
          (t) => t !== TileSubtype.LOCK
        );
      }

      // Grant item contained in chest
      if (subtype.includes(TileSubtype.SWORD)) {
        newGameState.hasSword = true;
      }
      if (subtype.includes(TileSubtype.SHIELD)) {
        newGameState.hasShield = true;
      }

      // Remove chest and its content from the tile
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
        (t) => t !== TileSubtype.CHEST && t !== TileSubtype.SWORD && t !== TileSubtype.SHIELD
      );
    }

    // Move player to the new position
    newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
      currentX
    ].filter((type) => type !== TileSubtype.PLAYER);
    // If current position array is empty after filtering, make it an empty array
    if (newMapData.subtypes[currentY][currentX].length === 0) {
      newMapData.subtypes[currentY][currentX] = [];
    }

    // Handle special case for lightswitch - player and switch coexist on the same tile
    if (subtype.includes(TileSubtype.LIGHTSWITCH)) {
      // Add player to the array if it's not already there
      if (!newMapData.subtypes[newY][newX].includes(TileSubtype.PLAYER)) {
        newMapData.subtypes[newY][newX].push(TileSubtype.PLAYER);
      }
    } else {
      // For other tiles, just set to player
      newMapData.subtypes[newY][newX] = [TileSubtype.PLAYER];
    }
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
