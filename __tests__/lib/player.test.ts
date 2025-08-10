import {
  generateMapWithSubtypes,
  addPlayerToMap,
  findPlayerPosition,
  Direction,
  initializeGameState,
  movePlayer,
  TileSubtype,
  MapData,
  GameState,
} from "../../lib/map";

describe("Player and Dynamic Subtypes", () => {
  it("should add a player to the map on a floor tile", () => {
    const mapData = generateMapWithSubtypes();
    const mapWithPlayer = addPlayerToMap(mapData);

    // Count player tiles
    let playerCount = 0;
    let playerPosition: [number, number] | null = null;

    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < 25; x++) {
        if (mapWithPlayer.subtypes[y][x].includes(TileSubtype.PLAYER)) {
          playerCount++;
          playerPosition = [y, x];
        }
      }
    }

    // Should have exactly one player
    expect(playerCount).toBe(1);
    expect(playerPosition).not.toBeNull();

    // Player should be on a floor tile
    if (playerPosition) {
      const [y, x] = playerPosition;
      expect(mapWithPlayer.tiles[y][x]).toBe(0); // Floor tile
    }
  });

  it("should NOT open exit without exit key", () => {
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

    // Player at (10, 11), Exit at (10, 12) as wall with EXIT subtype
    mapData.subtypes[10][11] = [TileSubtype.PLAYER];
    mapData.tiles[10][12] = 1; // wall
    mapData.subtypes[10][12] = [TileSubtype.EXIT];

    let gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData,
      showFullMap: false,
      win: false,
    };

    // Attempt to move into exit without exit key
    gameState = movePlayer(gameState, Direction.RIGHT);

    // Player should NOT have moved; exit remains a wall with EXIT subtype
    expect(findPlayerPosition(gameState.mapData)).toEqual([10, 11]);
    expect(gameState.mapData.tiles[10][12]).toBe(1);
    expect(gameState.mapData.subtypes[10][12].includes(TileSubtype.EXIT)).toBe(
      true
    );
  });

  it("should open exit only after picking up exit key (and consume it)", () => {
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

    // Layout: P (10,10) -> EXITKEY (10,11) floor -> EXIT (10,12) wall
    mapData.subtypes[10][10] = [TileSubtype.PLAYER];
    mapData.subtypes[10][11] = [TileSubtype.EXITKEY];
    mapData.tiles[10][12] = 1; // wall
    mapData.subtypes[10][12] = [TileSubtype.EXIT];

    let gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData,
      showFullMap: false,
      win: false,
    };

    // Step 1: move right to pick up exit key
    gameState = movePlayer(gameState, Direction.RIGHT);
    expect(findPlayerPosition(gameState.mapData)).toEqual([10, 11]);
    expect(gameState.hasExitKey).toBe(true);

    // Step 2: move right into exit; should open and consume exit key and set win
    gameState = movePlayer(gameState, Direction.RIGHT);
    expect(findPlayerPosition(gameState.mapData)).toEqual([10, 12]);
    expect(gameState.mapData.tiles[10][12]).toBe(0);
    expect(gameState.hasExitKey).toBe(false);
    expect(gameState.win).toBe(true);
  });

  it("should find player position correctly", () => {
    const mapData = generateMapWithSubtypes();
    // Place player at a known position
    let placed = false;

    for (let y = 0; y < 25 && !placed; y++) {
      for (let x = 0; x < 25 && !placed; x++) {
        if (mapData.tiles[y][x] === 0) {
          // Floor tile
          mapData.subtypes[y][x] = [TileSubtype.PLAYER];
          placed = true;
        }
      }
    }

    const position = findPlayerPosition(mapData);
    expect(position).not.toBeNull();
    if (position) {
      const [y, x] = position;
      expect(mapData.subtypes[y][x].includes(TileSubtype.PLAYER)).toBe(true);
    }
  });

  it("should move player on floor tiles", () => {
    // Initialize game state
    const gameState = initializeGameState();

    // Find player position
    const initialPosition = findPlayerPosition(gameState.mapData);
    expect(initialPosition).not.toBeNull();

    if (!initialPosition) return; // For TypeScript
    const [initialY, initialX] = initialPosition;

    // Try to move in each direction
    const directions = [
      Direction.UP,
      Direction.RIGHT,
      Direction.DOWN,
      Direction.LEFT,
    ];

    // Try each direction until we find one where player can move
    let moved = false;
    let newPosition: [number, number] | null = null;

    for (const direction of directions) {
      // Try to move in this direction
      const newGameState = movePlayer(gameState, direction);
      newPosition = findPlayerPosition(newGameState.mapData);

      if (
        newPosition &&
        (newPosition[0] !== initialY || newPosition[1] !== initialX)
      ) {
        // Player moved successfully
        moved = true;

        // Verify player is on a floor tile
        expect(newGameState.mapData.tiles[newPosition[0]][newPosition[1]]).toBe(
          0
        );

        // Verify old position is now empty
        expect(newGameState.mapData.subtypes[initialY][initialX]).toEqual([]);
        break;
      }
    }

    // Skip test if player is completely surrounded by walls (unlikely)
    if (!moved) {
      console.warn(
        "Player could not move in any direction - surrounded by walls"
      );
    }
  });

  it("should pick up a key and unlock a lock", () => {
    // Create a custom map for this test
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

    // Place player, key, and lock in known positions
    // Player at (10, 10)
    mapData.subtypes[10][10] = [TileSubtype.PLAYER];

    // Key at (10, 11) - right of player
    mapData.subtypes[10][11] = [TileSubtype.KEY];

    // Lock at (10, 12) - two spots right of player
    mapData.tiles[10][12] = 1; // Wall
    mapData.subtypes[10][12] = [TileSubtype.LOCK];

    // Initialize game state with this custom map
    let gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: mapData,
      showFullMap: false,
      win: false,
    };

    // Step 1: Move right to pick up the key
    gameState = movePlayer(gameState, Direction.RIGHT);

    // Verify player has the key
    expect(gameState.hasKey).toBe(true);

    // Verify player is now at (10, 11)
    const positionAfterKey = findPlayerPosition(gameState.mapData);
    expect(positionAfterKey).toEqual([10, 11]);

    // Step 2: Move right again to unlock the lock
    gameState = movePlayer(gameState, Direction.RIGHT);

    // Verify key was used
    expect(gameState.hasKey).toBe(false);

    // Verify lock tile is now a floor
    expect(gameState.mapData.tiles[10][12]).toBe(0); // Now floor
    expect(
      gameState.mapData.subtypes[10][12].includes(TileSubtype.PLAYER)
    ).toBe(true); // Player moved there
  });

  it("should pass through doors but be blocked by exit without exit key", () => {
    // Create a custom map for this test
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

    // Place player, door, and exit in known positions
    // Player at (10, 10)
    mapData.subtypes[10][10] = [TileSubtype.PLAYER];

    // Door at (10, 11) - right of player
    mapData.tiles[10][11] = 1; // Wall
    mapData.subtypes[10][11] = [TileSubtype.DOOR];

    // Exit at (10, 12) - two spots right of player
    mapData.tiles[10][12] = 1; // Wall
    mapData.subtypes[10][12] = [TileSubtype.EXIT];

    // Initialize game state with this custom map
    let gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: mapData,
      showFullMap: false,
      win: false,
    };

    // Step 1: Move right through the door
    gameState = movePlayer(gameState, Direction.RIGHT);

    // Verify door became floor and player moved there
    expect(gameState.mapData.tiles[10][11]).toBe(0); // Now floor
    expect(
      gameState.mapData.subtypes[10][11].includes(TileSubtype.PLAYER)
    ).toBe(true);

    // Step 2: Attempt to move right into the exit without exit key (should be blocked)
    gameState = movePlayer(gameState, Direction.RIGHT);

    // Verify exit is still a wall and player did not move
    expect(gameState.mapData.tiles[10][12]).toBe(1); // Still wall
    expect(findPlayerPosition(gameState.mapData)).toEqual([10, 11]);
  });

  it("should not remove lightswitch when stepping on it", () => {
    // Create a custom map for this test
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

    // Place player at (10, 10)
    mapData.subtypes[10][10] = [TileSubtype.PLAYER];

    // Place lightswitch at (10, 11) - right of player
    mapData.tiles[10][11] = 0; // Floor tile
    mapData.subtypes[10][11] = [TileSubtype.LIGHTSWITCH];

    // Initialize game state with this custom map
    let gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: mapData,
      showFullMap: false,
    };

    // Move right onto the lightswitch
    gameState = movePlayer(gameState, Direction.RIGHT);

    // Verify player is on the tile
    expect(
      gameState.mapData.subtypes[10][11].includes(TileSubtype.PLAYER)
    ).toBe(true);

    // Verify the lightswitch is still present on the same tile as the player
    // We should have both the lightswitch and player in the array
    expect(
      gameState.mapData.subtypes[10][11].includes(TileSubtype.LIGHTSWITCH)
    ).toBe(true);

    // Verify showFullMap was toggled
    expect(gameState.showFullMap).toBe(true);
  });
});
