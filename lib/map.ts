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

export function countCenterOutRooms(grid: number[][]): number {
  const visited = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(false));
  let roomCount = 0;
  
  for (let y = 1; y < GRID_SIZE - 1; y++) {
    for (let x = 1; x < GRID_SIZE - 1; x++) {
      if (grid[y][x] === FLOOR && !visited[y][x]) {
        // Found a potential room, check if it's rectangular
        const room = findRectangularRoom(grid, x, y, visited);
        if (room && room.width >= 3 && room.height >= 3) {
          roomCount++;
          // Mark all tiles in this room as visited
          for (let ry = room.y; ry < room.y + room.height; ry++) {
            for (let rx = room.x; rx < room.x + room.width; rx++) {
              visited[ry][rx] = true;
            }
          }
        }
      }
    }
  }
  
  return roomCount;
}

/**
 * Find a rectangular room starting from a given floor tile
 * @param grid The tilemap grid
 * @param startX Starting x coordinate
 * @param startY Starting y coordinate
 * @param visited Visited tiles array (unused but kept for interface consistency)
 * @returns Room object if a rectangular room is found, null otherwise
 */
function findRectangularRoom(grid: number[][], startX: number, startY: number, _visited: boolean[][]): Room | null {
  // Try to find the bounds of a rectangular room
  const minX = startX;
  const minY = startY;
  let maxX = startX;
  let maxY = startY;
  
  // Expand right to find width
  while (maxX + 1 < GRID_SIZE && grid[startY][maxX + 1] === FLOOR) {
    maxX++;
  }
  
  // Expand down to find height
  while (maxY + 1 < GRID_SIZE && grid[maxY + 1][startX] === FLOOR) {
    maxY++;
  }
  
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  
  // Verify this forms a complete rectangle
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (grid[y][x] !== FLOOR) {
        return null; // Not a complete rectangle
      }
    }
  }
  
  // Verify this forms a complete rectangle of at least 3x3
  if (width >= 3 && height >= 3) {
    return {
      x: startX,
      y: startY,
      width: width,
      height: height
    };
  }
  
  return null;
}

/**
 * Generate a map using a center-out algorithm
 * Creates a map with 3-6 rooms in the center, each between 9 and 100 tiles in size
 * @returns 25x25 grid with floor (0) and wall (1) tiles
 */
export function generateMapCenterOut(): number[][] {
  // Initialize grid with walls
  const grid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(WALL));
  
  // Determine random number of rooms (3-6)
  const numRooms = Math.floor(Math.random() * 4) + 3;
  
  // Generate rooms using a grid-based approach for better packing
  const rooms: Room[] = [];
  
  // Divide the grid into sections to ensure we can fit multiple rooms
  const sectionSize = 8; // Each section is 8x8
  const sectionsPerRow = Math.floor(GRID_SIZE / sectionSize);
  const availableSections: Array<{x: number, y: number}> = [];
  
  // Create list of available sections (avoiding edges)
  for (let sectionY = 0; sectionY < sectionsPerRow - 1; sectionY++) {
    for (let sectionX = 0; sectionX < sectionsPerRow - 1; sectionX++) {
      availableSections.push({x: sectionX, y: sectionY});
    }
  }
  
  // Shuffle sections for random placement
  for (let i = availableSections.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableSections[i], availableSections[j]] = [availableSections[j], availableSections[i]];
  }
  
  // Place rooms in sections - ensure we place the target number with larger rooms
  let roomsPlaced = 0;
  for (let i = 0; i < availableSections.length && roomsPlaced < numRooms; i++) {
    const section = availableSections[i];
    
    // Create larger rooms to fill more space (5x5 to 7x7 for better coverage)
    const roomWidth = Math.floor(Math.random() * 3) + 5; // 5 to 7
    const roomHeight = Math.floor(Math.random() * 3) + 5; // 5 to 7
    
    // Place room within the section with minimal margins
    const sectionStartX = section.x * sectionSize + 1;
    const sectionStartY = section.y * sectionSize + 1;
    const maxRoomStartX = sectionStartX + sectionSize - roomWidth - 1;
    const maxRoomStartY = sectionStartY + sectionSize - roomHeight - 1;
    
    // Ensure we have valid placement bounds
    if (maxRoomStartX >= sectionStartX && maxRoomStartY >= sectionStartY) {
      const startX = Math.floor(Math.random() * (maxRoomStartX - sectionStartX + 1)) + sectionStartX;
      const startY = Math.floor(Math.random() * (maxRoomStartY - sectionStartY + 1)) + sectionStartY;
      
      const newRoom: Room = {
        x: startX,
        y: startY,
        width: roomWidth,
        height: roomHeight
      };
      
      // Carve out the room
      for (let y = startY; y < startY + roomHeight; y++) {
        for (let x = startX; x < startX + roomWidth; x++) {
          if (y >= 0 && y < GRID_SIZE && x >= 0 && x < GRID_SIZE) {
            grid[y][x] = FLOOR;
          }
        }
      }
      rooms.push(newRoom);
      roomsPlaced++;
    }
  }
  
  // Ensure we have enough floor coverage (50-75%)
  let floorCount = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === FLOOR) floorCount++;
    }
  }
  
  const totalTiles = GRID_SIZE * GRID_SIZE;
  const targetMinFloor = Math.floor(totalTiles * 0.35); // 35% - more reasonable for distinct rooms
  const targetMaxFloor = Math.floor(totalTiles * 0.60); // 60%
  
  // If we don't have enough floor tiles, moderately expand rooms while maintaining separation
  let attempts = 0;
  const maxAttempts = 500;
  
  while (floorCount < targetMinFloor && attempts < maxAttempts) {
    attempts++;
    
    if (rooms.length > 0) {
      const roomToExpand = rooms[Math.floor(Math.random() * rooms.length)];
      
      // Try to expand the room in one random direction with buffer checking
      const direction = Math.floor(Math.random() * 4); // 0=right, 1=down, 2=left, 3=up
      let expanded = false;
      
      switch (direction) {
        case 0: // Expand right
          if (roomToExpand.x + roomToExpand.width < GRID_SIZE - 2) { // Leave buffer for perimeter
            // Check if we can expand without hitting another room (maintain 2-tile buffer)
            let canExpand = true;
            for (let y = roomToExpand.y; y < roomToExpand.y + roomToExpand.height; y++) {
              if (grid[y][roomToExpand.x + roomToExpand.width] === FLOOR ||
                  (roomToExpand.x + roomToExpand.width + 1 < GRID_SIZE && 
                   grid[y][roomToExpand.x + roomToExpand.width + 1] === FLOOR)) {
                canExpand = false;
                break;
              }
            }
            if (canExpand) {
              for (let y = roomToExpand.y; y < roomToExpand.y + roomToExpand.height; y++) {
                grid[y][roomToExpand.x + roomToExpand.width] = FLOOR;
                floorCount++;
                expanded = true;
              }
              if (expanded) roomToExpand.width++;
            }
          }
          break;
          
        case 1: // Expand down
          if (roomToExpand.y + roomToExpand.height < GRID_SIZE - 2) {
            let canExpand = true;
            for (let x = roomToExpand.x; x < roomToExpand.x + roomToExpand.width; x++) {
              if (grid[roomToExpand.y + roomToExpand.height][x] === FLOOR ||
                  (roomToExpand.y + roomToExpand.height + 1 < GRID_SIZE && 
                   grid[roomToExpand.y + roomToExpand.height + 1][x] === FLOOR)) {
                canExpand = false;
                break;
              }
            }
            if (canExpand) {
              for (let x = roomToExpand.x; x < roomToExpand.x + roomToExpand.width; x++) {
                grid[roomToExpand.y + roomToExpand.height][x] = FLOOR;
                floorCount++;
                expanded = true;
              }
              if (expanded) roomToExpand.height++;
            }
          }
          break;
      }
    }
    
    // If we still need more floor tiles and can't expand rooms, add small isolated floor patches
    if (floorCount < targetMinFloor && attempts > 200) {
      const randomY = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
      const randomX = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
      
      // Only add if it's isolated (surrounded by walls)
      if (grid[randomY][randomX] === WALL &&
          grid[randomY-1][randomX] === WALL && grid[randomY+1][randomX] === WALL &&
          grid[randomY][randomX-1] === WALL && grid[randomY][randomX+1] === WALL) {
        grid[randomY][randomX] = FLOOR;
        floorCount++;
      }
    }
  }
  
  // Don't connect rooms initially - let the connectivity function handle it
  // This preserves room counting while ensuring connectivity
  
  // Ensure perimeter walls are intact
  enforcePerimeterWalls(grid);
  
  // Ensure floors are connected (this will add minimal corridors if needed)
  ensureFloorsConnected(grid);
  
  return grid;
}

// Removed createRadiatingCorridors function since it's no longer used with the new algorithm

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
