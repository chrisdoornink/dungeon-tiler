import { generateMapWithSubtypes, Direction, TileSubtype, type GameState, performThrowRock } from '../../lib/map';
import { Enemy } from '../../lib/enemy';

/**
 * First slice: clear path over floor places a ROCK exactly 4 tiles away
 * and decrements rockCount by 1. No player movement, no BAM/effects asserted here.
 */

describe('Rock Throwing - clear path lands as rock at 4 tiles', () => {
  it('throws a rock 4 tiles over clear floor and lands as ROCK, decrements inventory', () => {
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
      rockCount: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRock(gameState);

    // Inventory decremented
    expect(after.rockCount).toBe(0);
    // Player remains in place
    const playerPos = (() => {
      for (let y = 0; y < after.mapData.subtypes.length; y++) {
        for (let x = 0; x < after.mapData.subtypes[y].length; x++) {
          if (after.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x] as const;
        }
      }
      throw new Error('player not found');
    })();
    expect(playerPos).toEqual([py, px]);

    // Rock lands exactly 4 tiles away to the right
    expect(after.mapData.subtypes[py][px + 4]).toContain(TileSubtype.ROCK);
  });

describe('Rock Throwing - inventory depletion prevents throw', () => {
  it('does nothing when rockCount is 0: no map/enemy/stat changes', () => {
    const base = generateMapWithSubtypes();
    // Simple corridor to the right
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 10, px = 10;
    base.tiles[py][px] = 0; base.subtypes[py][px] = [TileSubtype.PLAYER];
    for (let d = 1; d <= 4; d++) { base.tiles[py][px + d] = 0; base.subtypes[py][px + d] = []; }

    const before: GameState = {
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
      rockCount: 0,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRock(before);

    // No changes expected
    expect(after).toBe(before);
    expect(after.rockCount).toBe(0);
    expect(after.enemies?.length ?? 0).toBe(0);
    expect(after.stats).toEqual(before.stats);
    // Ensure no rock placed on the path
    for (let d = 1; d <= 4; d++) {
      expect(after.mapData.subtypes[py][px + d]).not.toContain(TileSubtype.ROCK);
    }
  });
});

describe('Rock Throwing - hit pot: pot removed, no rock placed', () => {
  it('throws a rock that hits a pot within 4 tiles: removes pot, no rock placed, inventory decremented', () => {
    const base = generateMapWithSubtypes();
    // Start with all walls
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // player floor
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    // Carve floor path to the right up to 3 tiles and place POT at +3
    base.tiles[py][px + 1] = 0; base.subtypes[py][px + 1] = [];
    base.tiles[py][px + 2] = 0; base.subtypes[py][px + 2] = [];
    base.tiles[py][px + 3] = 0; base.subtypes[py][px + 3] = [TileSubtype.POT];

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
      rockCount: 2,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRock(gameState);

    // Inventory decremented
    expect(after.rockCount).toBe(1);
    // Pot removed
    expect(after.mapData.subtypes[py][px + 3]).not.toContain(TileSubtype.POT);
    // No rock placed anywhere along path
    expect(after.mapData.subtypes[py][px + 1]).not.toContain(TileSubtype.ROCK);
    expect(after.mapData.subtypes[py][px + 2]).not.toContain(TileSubtype.ROCK);
    expect(after.mapData.subtypes[py][px + 3]).not.toContain(TileSubtype.ROCK);
    expect(after.mapData.subtypes[py][px + 4] ?? []).not.toContain(TileSubtype.ROCK);
  });
});

describe('Rock Throwing - hit ghost: 2 damage per rock, spirit on death', () => {
  it('first hit deals 2 damage (enemy remains), no rock placed; second hit defeats and records death', () => {
    const base = generateMapWithSubtypes();
    // Start with all walls
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // player floor
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    // Carve floor path to the right up to 4 tiles
    for (let d = 1; d <= 4; d++) {
      base.tiles[py][px + d] = 0;
      base.subtypes[py][px + d] = [];
    }

    // Place a ghost 2 tiles to the right
    const ghost = new Enemy({ y: py, x: px + 2 });
    ghost.kind = 'ghost';

    const gameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: base,
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [ghost],
      heroHealth: 5,
      heroAttack: 1,
      rockCount: 3,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    // First throw: enemy should take 2 damage (from 3 -> 1), remain alive
    const after1 = performThrowRock(gameState);
    expect(after1.rockCount).toBe(2);
    expect(after1.enemies?.length ?? 0).toBe(1);
    expect(after1.enemies![0].y).toBe(py);
    expect(after1.enemies![0].x).toBe(px + 2);
    expect(after1.enemies![0].health).toBe(1);
    expect(after1.stats.enemiesDefeated).toBe(0);
    // No rock placed on path when hitting enemy
    expect(after1.mapData.subtypes[py][px + 1]).not.toContain(TileSubtype.ROCK);
    expect(after1.mapData.subtypes[py][px + 2]).not.toContain(TileSubtype.ROCK);
    expect(after1.mapData.subtypes[py][px + 3]).not.toContain(TileSubtype.ROCK);
    expect(after1.mapData.subtypes[py][px + 4]).not.toContain(TileSubtype.ROCK);

    // Second throw: should finish the enemy (1 -> -1), remove it and record death
    const after2 = performThrowRock(after1);
    expect(after2.rockCount).toBe(1);
    expect(after2.enemies?.length ?? 0).toBe(0);
    expect(after2.stats.enemiesDefeated).toBe(1);
    expect(after2.recentDeaths).toContainEqual([py, px + 2]);
    // Still no rock placement when the throw hits an enemy
    expect(after2.mapData.subtypes[py][px + 1]).not.toContain(TileSubtype.ROCK);
    expect(after2.mapData.subtypes[py][px + 2]).not.toContain(TileSubtype.ROCK);
    expect(after2.mapData.subtypes[py][px + 3]).not.toContain(TileSubtype.ROCK);
    expect(after2.mapData.subtypes[py][px + 4]).not.toContain(TileSubtype.ROCK);
  });
});

describe('Rock Throwing - stops at wall and disappears', () => {
  it('encounters a wall within 4 tiles: no rock placed; inventory decremented', () => {
    const base = generateMapWithSubtypes();
    // Start with all walls
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1;
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // player floor
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    // Carve floor for first two tiles, then a wall at 3rd tile (block within range)
    base.tiles[py][px + 1] = 0; base.subtypes[py][px + 1] = [];
    base.tiles[py][px + 2] = 0; base.subtypes[py][px + 2] = [];
    // px + 3 remains a wall (base.tiles already 1)

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
      rockCount: 2,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = performThrowRock(gameState);

    // Inventory decremented even when blocked by wall
    expect(after.rockCount).toBe(1);
    // Player remains in place
    const playerPos = (() => {
      for (let y = 0; y < after.mapData.subtypes.length; y++) {
        for (let x = 0; x < after.mapData.subtypes[y].length; x++) {
          if (after.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x] as const;
        }
      }
      throw new Error('player not found');
    })();
    expect(playerPos).toEqual([py, px]);

    // No rock placed on floor tiles before the wall
    expect(after.mapData.subtypes[py][px + 1]).not.toContain(TileSubtype.ROCK);
    expect(after.mapData.subtypes[py][px + 2]).not.toContain(TileSubtype.ROCK);
    // And certainly not beyond the wall
    const beyond = after.mapData.subtypes[py][px + 4] || [];
    expect(beyond).not.toContain(TileSubtype.ROCK);
  });
});
});
