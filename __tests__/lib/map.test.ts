import {
  generateMap,
  countRooms,
  areAllFloorsConnected,
  generateMapWithSubtypes,
  TileSubtype,
  generateMapWithExit,
  generateMapWithKeyAndLock,
  generateCompleteMap,
} from "../../lib/map";

describe("Map Generation", () => {
  it("should generate a 25x25 grid", () => {
    const map = generateMap();
    expect(map.length).toBe(25);
    expect(map[0].length).toBe(25);
  });
  
  it("generation should only place SWORD inside a CHEST", () => {
    const mapData = generateCompleteMap();
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        const subs = mapData.subtypes[y][x];
        if (subs.includes(TileSubtype.SWORD)) {
          expect(subs.includes(TileSubtype.CHEST)).toBe(true);
        }
      }
    }
  });

  it("should generate a random map with floor and wall tiles", () => {
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

  it("should have majority of perimeter as walls", () => {
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

  it("should have between 50% and 75% floor tiles", () => {
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
  it("should have all floor tiles connected to each other", () => {
    const map = generateMap();
    expect(areAllFloorsConnected(map)).toBe(true);
  });

  // DT-4: Test for room count
  it("should have between 1 and 4 rooms", () => {
    const map = generateMap();
    const roomCount = countRooms(map);

    expect(roomCount).toBeGreaterThanOrEqual(1);
    expect(roomCount).toBeLessThanOrEqual(4);
  });
});

// Open style map generation is now the default approach

describe("Tile Subtypes", () => {
  it("should generate maps with tile subtypes initialized to 0", () => {
    const mapData = generateMapWithSubtypes();

    // Check that we have both tiles and subtypes
    expect(mapData.tiles).toBeDefined();
    expect(mapData.subtypes).toBeDefined();
    expect(mapData.tiles.length).toBe(25);
    expect(mapData.subtypes.length).toBe(25);
    expect(mapData.tiles[0].length).toBe(25);
    expect(mapData.subtypes[0].length).toBe(25);

    // Check that all subtypes are initialized to empty arrays
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        expect(Array.isArray(mapData.subtypes[y][x])).toBe(true);
        expect(mapData.subtypes[y][x].length).toBe(0);
      }
    }
  });
  
  it("should place exactly one exit (subtype 1) on a wall tile next to floor tiles", () => {
    const mapData = generateMapWithExit();
    
    // Check for exactly one exit (subtype 1)
    let exitCount = 0;
    let exitPosition: [number, number] | null = null;
    
    // Count exit tiles
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        if (mapData.tiles[y][x] === 1 && mapData.subtypes[y][x].includes(TileSubtype.EXIT)) {
          exitCount++;
          exitPosition = [y, x];
        }
      }
    }
    
    // Should have exactly one exit
    expect(exitCount).toBe(1);
    
    // Exit should be next to at least one floor tile
    expect(exitPosition).not.toBeNull();
    if (exitPosition) {
      const [y, x] = exitPosition;
      const hasAdjacentFloor = (
        (y > 0 && mapData.tiles[y-1][x] === 0) ||                 // North
        (y < 24 && mapData.tiles[y+1][x] === 0) ||                // South
        (x > 0 && mapData.tiles[y][x-1] === 0) ||                 // West
        (x < 24 && mapData.tiles[y][x+1] === 0)                   // East
      );
      expect(hasAdjacentFloor).toBe(true);
    }
  });
  
  it("should place exactly one key (subtype 3) on a floor tile and one lock (subtype 4) on a wall tile", () => {
    const mapData = generateMapWithKeyAndLock();
    
    // Check for exactly one key (subtype 3)
    let keyCount = 0;
    let keyPosition: [number, number] | null = null;
    
    // Check for exactly one lock (subtype 4)
    let lockCount = 0;
    let lockPosition: [number, number] | null = null;
    
    // Count key and lock tiles
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        if (mapData.tiles[y][x] === 0 && mapData.subtypes[y][x].includes(TileSubtype.KEY)) {
          keyCount++;
          keyPosition = [y, x];
        }
        if (mapData.tiles[y][x] === 1 && mapData.subtypes[y][x].includes(TileSubtype.LOCK)) {
          lockCount++;
          lockPosition = [y, x];
        }
      }
    }
    
    // Should have exactly one key and one lock
    expect(keyCount).toBe(1);
    expect(lockCount).toBe(1);
    
    // Key should be on a floor tile
    expect(keyPosition).not.toBeNull();
    if (keyPosition) {
      const [y, x] = keyPosition;
      expect(mapData.tiles[y][x]).toBe(0); // Floor tile
    }
    
    // Lock should be on a wall tile next to at least one floor tile
    expect(lockPosition).not.toBeNull();
    if (lockPosition) {
      const [y, x] = lockPosition;
      expect(mapData.tiles[y][x]).toBe(1); // Wall tile
      
      const hasAdjacentFloor = (
        (y > 0 && mapData.tiles[y-1][x] === 0) ||                 // North
        (y < 24 && mapData.tiles[y+1][x] === 0) ||                // South
        (x > 0 && mapData.tiles[y][x-1] === 0) ||                 // West
        (x < 24 && mapData.tiles[y][x+1] === 0)                   // East
      );
      expect(hasAdjacentFloor).toBe(true);
    }
  });
});
