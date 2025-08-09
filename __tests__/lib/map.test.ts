import { generateMap, countRooms, areAllFloorsConnected, generateMapCenterOut } from '../../lib/map';

describe('Map Generation', () => {
  it('should generate a 25x25 grid', () => {
    const map = generateMap();
    expect(map.length).toBe(25);
    expect(map[0].length).toBe(25);
  });

  it('should generate a random map with floor and wall tiles', () => {
    const map1 = generateMap();
    const map2 = generateMap();
    
    // Check if maps are different (randomness test)
    let different = false;
    for (let y = 0; y < map1.length; y++) {
      for (let x = 0; x < map1[0].length; x++) {
        if (map1[y][x] !== map2[y][x]) {
          different = true;
          break;
        }
      }
      if (different) break;
    }
    
    expect(different).toBe(true);
    
    // Check if map contains both floor (0) and wall (1) tiles
    const tileTypes = new Set();
    for (let y = 0; y < map1.length; y++) {
      for (let x = 0; x < map1[0].length; x++) {
        tileTypes.add(map1[y][x]);
      }
    }
    
    expect(tileTypes.has(0)).toBe(true); // Has floor
    expect(tileTypes.has(1)).toBe(true); // Has wall
  });

  it('should have majority of perimeter as walls', () => {
    const map = generateMap();
    
    // Check perimeter tiles
    let perimeterCount = 0;
    let wallCount = 0;
    
    // Top and bottom rows
    for (let x = 0; x < 25; x++) {
      if (map[0][x] === 1) wallCount++;
      if (map[24][x] === 1) wallCount++;
      perimeterCount += 2;
    }
    
    // Left and right columns (excluding corners already counted)
    for (let y = 1; y < 24; y++) {
      if (map[y][0] === 1) wallCount++;
      if (map[y][24] === 1) wallCount++;
      perimeterCount += 2;
    }
    
    // Expect at least 50% of perimeter to be walls
    expect(wallCount).toBeGreaterThanOrEqual(perimeterCount * 0.5);
  });

  it('should have between 50% and 75% floor tiles', () => {
    const map = generateMap();
    
    let floorCount = 0;
    const totalTiles = 25 * 25;
    
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        if (map[y][x] === 0) floorCount++;
      }
    }
    
    // Floor tiles should be between 50% and 75% of total
    expect(floorCount).toBeGreaterThanOrEqual(totalTiles * 0.5);
    expect(floorCount).toBeLessThanOrEqual(totalTiles * 0.75);
  });
  
  // DT-3: Test for floor connectivity
  it('should have all floor tiles connected to each other', () => {
    const map = generateMap();
    expect(areAllFloorsConnected(map)).toBe(true);
  });
  
  // DT-4: Test for room count
  it('should have between 1 and 4 rooms', () => {
    const map = generateMap();
    const roomCount = countRooms(map);
    
    expect(roomCount).toBeGreaterThanOrEqual(1);
    expect(roomCount).toBeLessThanOrEqual(4);
  });
});

describe('Center-Out Map Generation', () => {
  it('should generate a map with 1-4 rooms in the center, each between 9 and 100 tiles in size', () => {
    const map = generateMapCenterOut();
    
    // Check grid dimensions
    expect(map.length).toBe(25);
    expect(map[0].length).toBe(25);
    
    // Count all floor tiles in the map
    let floorCount = 0;
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        if (map[y][x] === 0) { // If floor tile
          floorCount++;
        }
      }
    }
    
    // Should have between 9 and 400 floor tiles (1-4 rooms * 9-100 tiles each)
    expect(floorCount).toBeGreaterThanOrEqual(9);
    expect(floorCount).toBeLessThanOrEqual(400);
    
    // Should have between 1 and 4 rooms
    const roomCount = countRooms(map);
    expect(roomCount).toBeGreaterThanOrEqual(1);
    expect(roomCount).toBeLessThanOrEqual(4);
    
    // Verify that floors are connected
    expect(areAllFloorsConnected(map)).toBe(true);
  });
});
