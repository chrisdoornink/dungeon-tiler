// Tile type definition
export type TileType = {
  id: number;
  name: string;
  color: string;
  walkable: boolean;
};

// Map of tile types by ID
export const tileTypes: Record<number, TileType> = {
  0: { id: 0, name: 'floor', color: '#ccc', walkable: true },
  1: { id: 1, name: 'wall', color: '#333', walkable: false },
  2: { id: 2, name: 'door', color: '#aa7', walkable: false },
  3: { id: 3, name: 'key', color: '#ff0', walkable: true },
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
      const width = MIN_ROOM_SIZE + Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));
      const height = MIN_ROOM_SIZE + Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));
      
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
  LOCK = 4
}

export interface MapData {
  tiles: number[][];
  subtypes: number[][];
}

/**
 * Generate a map with subtypes - all subtypes initialized to 0
 * @returns MapData object containing both tiles and subtypes arrays
 */
export function generateMapWithSubtypes(): MapData {
  const tiles = generateMap();
  const subtypes = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
  
  return {
    tiles,
    subtypes
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
        const hasAdjacentFloor = (
          (y > 0 && mapData.tiles[y-1][x] === FLOOR) ||              // North
          (y < GRID_SIZE-1 && mapData.tiles[y+1][x] === FLOOR) ||    // South
          (x > 0 && mapData.tiles[y][x-1] === FLOOR) ||              // West
          (x < GRID_SIZE-1 && mapData.tiles[y][x+1] === FLOOR)       // East
        );
        
        if (hasAdjacentFloor) {
          wallsNextToFloor.push([y, x]);
        }
      }
    }
  }
  
  // If we don't have at least two valid positions, return the basic map
  if (wallsNextToFloor.length < 2) {
    console.warn('Not enough walls next to floor tiles for door and exit placement');
    return mapData;
  }
  
  // Shuffle the array of valid wall positions
  for (let i = wallsNextToFloor.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wallsNextToFloor[i], wallsNextToFloor[j]] = [wallsNextToFloor[j], wallsNextToFloor[i]];
  }
  
  // Place the door (first wall)
  const [doorY, doorX] = wallsNextToFloor[0];
  mapData.subtypes[doorY][doorX] = TileSubtype.DOOR;
  
  // Place the exit (second wall)
  const [exitY, exitX] = wallsNextToFloor[1];
  mapData.subtypes[exitY][exitX] = TileSubtype.EXIT;
  
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
      if (mapData.subtypes[y][x] !== TileSubtype.NONE) {
        continue;
      }
      
      // Check for floor tiles for key placement
      if (mapData.tiles[y][x] === FLOOR) {
        floorTiles.push([y, x]);
      }
      // Check for wall tiles next to floor for lock placement
      else if (mapData.tiles[y][x] === WALL) {
        const hasAdjacentFloor = (
          (y > 0 && mapData.tiles[y-1][x] === FLOOR) ||              // North
          (y < GRID_SIZE-1 && mapData.tiles[y+1][x] === FLOOR) ||    // South
          (x > 0 && mapData.tiles[y][x-1] === FLOOR) ||              // West
          (x < GRID_SIZE-1 && mapData.tiles[y][x+1] === FLOOR)       // East
        );
        
        if (hasAdjacentFloor) {
          wallsNextToFloor.push([y, x]);
        }
      }
    }
  }
  
  // If we don't have enough valid positions, return the map without key/lock
  if (floorTiles.length < 1 || wallsNextToFloor.length < 1) {
    console.warn('Not enough valid tiles for key and lock placement');
    return mapData;
  }
  
  // Shuffle the arrays for random placement
  for (let i = floorTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [floorTiles[i], floorTiles[j]] = [floorTiles[j], floorTiles[i]];
  }
  
  for (let i = wallsNextToFloor.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wallsNextToFloor[i], wallsNextToFloor[j]] = [wallsNextToFloor[j], wallsNextToFloor[i]];
  }
  
  // Place the key on a floor tile
  const [keyY, keyX] = floorTiles[0];
  mapData.subtypes[keyY][keyX] = TileSubtype.KEY;
  
  // Place the lock on a wall next to floor
  const [lockY, lockX] = wallsNextToFloor[0];
  mapData.subtypes[lockY][lockX] = TileSubtype.LOCK;
  
  return mapData;
}

/**
 * Generate a complete map with all subtypes (door, exit, key, lock)
 * @returns MapData object with all subtypes properly placed
 */
export function generateCompleteMap(): MapData {
  return generateMapWithKeyAndLock();
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
    if (Math.random() < 0.7) { // 70% chance of being a wall
      grid[0][x] = WALL;
      grid[GRID_SIZE - 1][x] = WALL;
    }
  }
  
  // Left and right columns
  for (let y = 0; y < GRID_SIZE; y++) {
    if (Math.random() < 0.7) { // 70% chance of being a wall
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
  const visited = Array(height).fill(0).map(() => Array(width).fill(false));
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
            
            if (ny >= 0 && ny < height && nx >= 0 && nx < width && 
                grid[ny][nx] === FLOOR && !visited[ny][nx]) {
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
function connectRegions(grid: number[][], regionA: Array<[number, number]>, regionB: Array<[number, number]>): void {
  // Find the closest pair of tiles between the two regions
  let minDist = Infinity;
  let bestPair: [[number, number], [number, number]] | null = null;
  
  for (const [y1, x1] of regionA) {
    for (const [y2, x2] of regionB) {
      const dist = Math.abs(y2 - y1) + Math.abs(x2 - x1);
      if (dist < minDist) {
        minDist = dist;
        bestPair = [[y1, x1], [y2, x2]];
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
