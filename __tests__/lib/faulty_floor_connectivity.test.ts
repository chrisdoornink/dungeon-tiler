import { generateCompleteMap, areAllFloorsConnected, TileSubtype } from "../../lib/map";

describe("Faulty Floor Connectivity", () => {
  test("faulty floors do not break map connectivity", () => {
    // Generate multiple maps to test connectivity
    for (let i = 0; i < 10; i++) {
      const mapData = generateCompleteMap();
      
      // Create a test grid where faulty floors are treated as walls
      const testGrid = mapData.tiles.map(row => [...row]);
      
      // Find all faulty floor positions and treat them as walls
      for (let y = 0; y < mapData.subtypes.length; y++) {
        for (let x = 0; x < mapData.subtypes[y].length; x++) {
          if (mapData.subtypes[y][x].includes(TileSubtype.FAULTY_FLOOR)) {
            testGrid[y][x] = 1; // Convert to wall for connectivity test
          }
        }
      }
      
      // All remaining floor tiles should still be connected
      expect(areAllFloorsConnected(testGrid)).toBe(true);
    }
  });

  test("player can reach exit with faulty floors present", () => {
    // Generate a map with faulty floors
    const mapData = generateCompleteMap();
    
    // Find player and exit positions
    let playerPos: [number, number] | null = null;
    let exitPos: [number, number] | null = null;
    
    for (let y = 0; y < mapData.subtypes.length; y++) {
      for (let x = 0; x < mapData.subtypes[y].length; x++) {
        if (mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) {
          playerPos = [y, x];
        }
        if (mapData.subtypes[y][x].includes(TileSubtype.EXIT)) {
          exitPos = [y, x];
        }
      }
    }
    
    expect(playerPos).not.toBeNull();
    expect(exitPos).not.toBeNull();
    
    // Create a walkable grid (treating faulty floors as walls)
    const walkableGrid = mapData.tiles.map(row => [...row]);
    for (let y = 0; y < mapData.subtypes.length; y++) {
      for (let x = 0; x < mapData.subtypes[y].length; x++) {
        if (mapData.subtypes[y][x].includes(TileSubtype.FAULTY_FLOOR)) {
          walkableGrid[y][x] = 1; // Wall
        }
      }
    }
    
    // Verify player can reach exit using pathfinding
    const canReachExit = canReachTarget(walkableGrid, playerPos!, exitPos!);
    expect(canReachExit).toBe(true);
  });

  test("player can reach all essential items with faulty floors present", () => {
    const mapData = generateCompleteMap();
    
    // Find all essential positions
    let playerPos: [number, number] | null = null;
    const essentialPositions: Array<[number, number]> = [];
    
    for (let y = 0; y < mapData.subtypes.length; y++) {
      for (let x = 0; x < mapData.subtypes[y].length; x++) {
        const subtypes = mapData.subtypes[y][x];
        if (subtypes.includes(TileSubtype.PLAYER)) {
          playerPos = [y, x];
        }
        if (subtypes.includes(TileSubtype.EXIT) || 
            subtypes.includes(TileSubtype.KEY) ||
            subtypes.includes(TileSubtype.EXITKEY) ||
            subtypes.includes(TileSubtype.CHEST)) {
          essentialPositions.push([y, x]);
        }
      }
    }
    
    expect(playerPos).not.toBeNull();
    
    // Create walkable grid
    const walkableGrid = mapData.tiles.map(row => [...row]);
    for (let y = 0; y < mapData.subtypes.length; y++) {
      for (let x = 0; x < mapData.subtypes[y].length; x++) {
        if (mapData.subtypes[y][x].includes(TileSubtype.FAULTY_FLOOR)) {
          walkableGrid[y][x] = 1; // Wall
        }
      }
    }
    
    // Verify player can reach all essential items
    for (const target of essentialPositions) {
      const canReach = canReachTarget(walkableGrid, playerPos!, target);
      expect(canReach).toBe(true);
    }
  });
});

/**
 * Simple BFS pathfinding to check if target is reachable from start
 */
function canReachTarget(grid: number[][], start: [number, number], target: [number, number]): boolean {
  const [startY, startX] = start;
  const [targetY, targetX] = target;
  
  if (startY === targetY && startX === targetX) return true;
  
  const height = grid.length;
  const width = grid[0].length;
  const visited = Array(height).fill(0).map(() => Array(width).fill(false));
  const queue: Array<[number, number]> = [[startY, startX]];
  visited[startY][startX] = true;
  
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right
  
  while (queue.length > 0) {
    const [y, x] = queue.shift()!;
    
    for (const [dy, dx] of directions) {
      const ny = y + dy;
      const nx = x + dx;
      
      if (ny >= 0 && ny < height && nx >= 0 && nx < width && 
          !visited[ny][nx] && grid[ny][nx] === 0) { // 0 = floor, walkable
        if (ny === targetY && nx === targetX) {
          return true;
        }
        visited[ny][nx] = true;
        queue.push([ny, nx]);
      }
    }
  }
  
  return false;
}
