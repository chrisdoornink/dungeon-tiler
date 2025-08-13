import {
  Direction,
  GameState,
  MapData,
  TileSubtype,
  movePlayer,
  findPlayerPosition,
} from "../../lib/map";

describe("Player Movement Behaviors", () => {
  // Test that player direction updates when moving
  it("should update player direction when moving", () => {
    // Create a 25x25 map with player in center
    const mapData: MapData = {
      tiles: Array(25)
        .fill(0)
        .map(() => Array(25).fill(0)),
      subtypes: Array(25)
        .fill(0)
        .map(() =>
          Array(25)
            .fill(0)
            .map(() => [])
        ),
    };
    
    // Place player at position [12, 12] (center)
    mapData.subtypes[12][12] = [TileSubtype.PLAYER];

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData,
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN, // Initial direction
    };

    // Test each direction
    const directions = [
      { move: Direction.UP, expected: Direction.UP },
      { move: Direction.RIGHT, expected: Direction.RIGHT },
      { move: Direction.DOWN, expected: Direction.DOWN },
      { move: Direction.LEFT, expected: Direction.LEFT },
    ];
    
    // Test each direction independently
    for (const { move, expected } of directions) {
      // Create a fresh game state for each test
      const testState = { ...gameState };
      
      // Move in the test direction
      const newState = movePlayer(testState, move);
      
      // Verify direction was updated
      expect(newState.playerDirection).toBe(expected);
    }
  });

  // Test that player can't move outside map boundaries
  it("should prevent player from moving outside map boundaries", () => {
    // Create a 25x25 map with player at the edge (0,0)
    const mapData: MapData = {
      tiles: Array(25)
        .fill(0)
        .map(() => Array(25).fill(0)),
      subtypes: Array(25)
        .fill(0)
        .map(() =>
          Array(25)
            .fill(0)
            .map(() => [])
        ),
    };
    
    // Place player at position [0, 0] (top-left corner)
    mapData.subtypes[0][0] = [TileSubtype.PLAYER];

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData,
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
    };

    // Try to move up (outside the map)
    const newState = movePlayer(gameState, Direction.UP);
    
    // Player should stay in the same position
    const position = findPlayerPosition(newState.mapData);
    expect(position).toEqual([0, 0]);
    
    // Try to move left (outside the map)
    const newState2 = movePlayer(gameState, Direction.LEFT);
    
    // Player should stay in the same position
    const position2 = findPlayerPosition(newState2.mapData);
    expect(position2).toEqual([0, 0]);
  });

  // Test player movement with obstacles in different directions
  it("should handle obstacles correctly in all directions", () => {
    // Create a 25x25 map with player surrounded by walls in some directions
    const mapData: MapData = {
      tiles: Array(25)
        .fill(0)
        .map(() => Array(25).fill(0)),
      subtypes: Array(25)
        .fill(0)
        .map(() =>
          Array(25)
            .fill(0)
            .map(() => [])
        ),
    };
    
    // Create a pattern with player at [12, 12] and walls in specific positions
    mapData.subtypes[12][12] = [TileSubtype.PLAYER];
    
    // Place walls in specific positions
    mapData.tiles[11][11] = 1; // Wall at top-left
    mapData.tiles[11][13] = 1; // Wall at top-right
    mapData.tiles[13][11] = 1; // Wall at bottom-left
    mapData.tiles[13][13] = 1; // Wall at bottom-right

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData,
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
    };

    // Test movement in all directions
    const directions = [
      { move: Direction.UP, expectedY: 11, expectedX: 12 }, // Can move up
      { move: Direction.RIGHT, expectedY: 12, expectedX: 13 }, // Can move right
      { move: Direction.DOWN, expectedY: 13, expectedX: 12 }, // Can move down
      { move: Direction.LEFT, expectedY: 12, expectedX: 11 }, // Can move left
    ];

    for (const { move, expectedY, expectedX } of directions) {
      // Create a fresh game state for each test
      const testState = { ...gameState };
      
      // Move in the test direction
      const newState = movePlayer(testState, move);
      const position = findPlayerPosition(newState.mapData);
      
      // Verify position
      expect(position).toEqual([expectedY, expectedX]);
    }
  });

  // Test that player can't move through walls
  it("should prevent player from moving through walls", () => {
    // Create a 25x25 map with player surrounded by walls in all directions
    const mapData: MapData = {
      tiles: Array(25)
        .fill(0)
        .map(() => Array(25).fill(0)),
      subtypes: Array(25)
        .fill(0)
        .map(() =>
          Array(25)
            .fill(0)
            .map(() => [])
        ),
    };
    
    // Place player at position [12, 12] (center)
    mapData.subtypes[12][12] = [TileSubtype.PLAYER];
    
    // Place walls around player
    mapData.tiles[11][12] = 1; // Wall above
    mapData.tiles[12][13] = 1; // Wall to the right
    mapData.tiles[13][12] = 1; // Wall below
    mapData.tiles[12][11] = 1; // Wall to the left

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData,
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
    };

    // Try to move in each direction
    const directions = [Direction.UP, Direction.RIGHT, Direction.DOWN, Direction.LEFT];
    
    for (const direction of directions) {
      // Move in the test direction
      const newState = movePlayer(gameState, direction);
      const position = findPlayerPosition(newState.mapData);
      
      // Player should stay in the same position
      expect(position).toEqual([12, 12]);
    }
  });
});
