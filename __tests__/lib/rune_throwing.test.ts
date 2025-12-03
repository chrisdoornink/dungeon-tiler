import { generateMapWithSubtypes, Direction, TileSubtype, type GameState, performThrowRune } from '../../lib/map';

describe('Rune Throwing - does not remove EXIT tile', () => {
  it('throws a rune at EXIT tile: EXIT remains, rune is not placed', () => {
    const base = generateMapWithSubtypes();
    // Make a small walled area and carve a straight floor corridor to the right
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1; // wall everywhere
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // player floor
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    // Carve 4 floor tiles to the right
    for (let d = 1; d <= 4; d++) {
      base.tiles[py][px + d] = 0;
      base.subtypes[py][px + d] = [];
    }
    // Place EXIT at the 4th tile
    base.subtypes[py][px + 4] = [TileSubtype.EXIT];

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: base,
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      heroHealth: 5,
      heroAttack: 1,
      runeCount: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRune(gameState);

    // Inventory decremented
    expect(after.runeCount).toBe(0);
    // EXIT tile still exists (not removed by rune placement)
    expect(after.mapData.subtypes[py][px + 4]).toContain(TileSubtype.EXIT);
    // Rune is NOT placed on the EXIT tile
    expect(after.mapData.subtypes[py][px + 4]).not.toContain(TileSubtype.RUNE);
  });

  it('throws a rune at DOOR tile: DOOR remains, rune is not placed', () => {
    const base = generateMapWithSubtypes();
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0;
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    for (let d = 1; d <= 4; d++) {
      base.tiles[py][px + d] = 0;
      base.subtypes[py][px + d] = [];
    }
    base.subtypes[py][px + 4] = [TileSubtype.DOOR];

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: base,
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      heroHealth: 5,
      heroAttack: 1,
      runeCount: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRune(gameState);

    expect(after.runeCount).toBe(0);
    expect(after.mapData.subtypes[py][px + 4]).toContain(TileSubtype.DOOR);
    expect(after.mapData.subtypes[py][px + 4]).not.toContain(TileSubtype.RUNE);
  });

  it('rune bounces back from wall and would land on EXIT tile: EXIT remains, rune is not placed', () => {
    const base = generateMapWithSubtypes();
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0;
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    // Create path: floor, floor, EXIT, wall
    base.tiles[py][px + 1] = 0;
    base.subtypes[py][px + 1] = [];
    base.tiles[py][px + 2] = 0;
    base.subtypes[py][px + 2] = [];
    base.tiles[py][px + 3] = 0;
    base.subtypes[py][px + 3] = [TileSubtype.EXIT]; // EXIT on 3rd tile
    // px + 4 is wall (already 1)

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: base,
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      heroHealth: 5,
      heroAttack: 1,
      runeCount: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRune(gameState);

    // Rune hits wall at px+4, should try to land on last floor tile (px+3)
    // But px+3 has EXIT, so rune should not be placed there
    // Note: Rune stays in inventory when it can't land (this is acceptable behavior)
    expect(after.runeCount).toBe(1);
    // EXIT at px+3 should remain intact (this is the critical bug fix)
    expect(after.mapData.subtypes[py][px + 3]).toContain(TileSubtype.EXIT);
    expect(after.mapData.subtypes[py][px + 3]).not.toContain(TileSubtype.RUNE);
  });

  it('rune lands on regular floor tile: rune is placed normally', () => {
    const base = generateMapWithSubtypes();
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0;
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    for (let d = 1; d <= 4; d++) {
      base.tiles[py][px + d] = 0;
      base.subtypes[py][px + d] = [];
    }

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: base,
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      heroHealth: 5,
      heroAttack: 1,
      runeCount: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRune(gameState);

    // Normal behavior: rune lands on 4th tile
    expect(after.runeCount).toBe(0);
    expect(after.mapData.subtypes[py][px + 4]).toContain(TileSubtype.RUNE);
  });

  it('throws a rune at EXITKEY tile: EXITKEY remains, rune is not placed', () => {
    const base = generateMapWithSubtypes();
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0;
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    for (let d = 1; d <= 4; d++) {
      base.tiles[py][px + d] = 0;
      base.subtypes[py][px + d] = [];
    }
    base.subtypes[py][px + 4] = [TileSubtype.EXITKEY];

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: base,
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      heroHealth: 5,
      heroAttack: 1,
      runeCount: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRune(gameState);

    expect(after.runeCount).toBe(0);
    expect(after.mapData.subtypes[py][px + 4]).toContain(TileSubtype.EXITKEY);
    expect(after.mapData.subtypes[py][px + 4]).not.toContain(TileSubtype.RUNE);
  });
});
