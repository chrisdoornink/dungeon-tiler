import { TileSubtype } from '../../lib/map';
import { generateCompleteMap } from '../../lib/map';
import { generateMapWithSubtypes, movePlayer, Direction, type GameState } from '../../lib/map';

describe('TileSubtype additions for Pots and Rocks', () => {
  it('defines POT, ROCK, FOOD, and MED as numeric enum members', () => {
    expect(typeof TileSubtype.POT).toBe('number');
    expect(typeof TileSubtype.ROCK).toBe('number');
    expect(typeof TileSubtype.FOOD).toBe('number');
    expect(typeof TileSubtype.MED).toBe('number');

    // Ensure they are distinct
    const values = [TileSubtype.POT, TileSubtype.ROCK, TileSubtype.FOOD, TileSubtype.MED];
    expect(new Set(values).size).toBe(values.length);
  });

  it('stepping onto FOOD adds to inventory', () => {
    const base = generateMapWithSubtypes();
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1; // wall
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // floor for player
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    base.tiles[py][px + 1] = 0;
    base.subtypes[py][px + 1] = [TileSubtype.FOOD];

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
      heroHealth: 4,
      heroMaxHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
      foodCount: 0,
    };

    const after = movePlayer(gameState, Direction.RIGHT);
    expect(after.foodCount).toBe(1);
    expect(after.mapData.subtypes[py][px + 1]).toContain(TileSubtype.PLAYER);
  });

  it('stepping onto MED adds to inventory', () => {
    const base = generateMapWithSubtypes();
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1; // wall
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // floor for player
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    base.tiles[py][px + 1] = 0;
    base.subtypes[py][px + 1] = [TileSubtype.MED];

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
      heroHealth: 3,
      heroMaxHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
      potionCount: 0,
    };

    const after = movePlayer(gameState, Direction.RIGHT);
    expect(after.potionCount).toBe(1);
    expect(after.mapData.subtypes[py][px + 1]).toContain(TileSubtype.PLAYER);
  });

  it('after revealing FOOD, stepping onto it moves player and clears the item', () => {
    const base = generateMapWithSubtypes();
    // Clear a small area
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1; // wall
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // floor for player
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    base.tiles[py][px + 1] = 0; // floor to the right
    base.subtypes[py][px + 1] = [TileSubtype.POT];

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
      heroMaxHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const origRandom = Math.random;
    Math.random = () => 0.49; // reveal FOOD
    try {
      const afterReveal = movePlayer(gameState, Direction.RIGHT);
      expect(afterReveal.mapData.subtypes[py][px + 1]).toContain(TileSubtype.FOOD);
      // Now step into the revealed FOOD tile
      const afterStep = movePlayer(afterReveal, Direction.RIGHT);
      // Player should be on the FOOD tile now
      expect(afterStep.mapData.subtypes[py][px + 1]).toContain(TileSubtype.PLAYER);
      // FOOD should be cleared when stepping onto it
      expect(afterStep.mapData.subtypes[py][px + 1]).not.toContain(TileSubtype.FOOD);
    } finally {
      Math.random = origRandom;
    }
  });

  it('bumping into a POT reveals FOOD without moving (Math.random < 0.5)', () => {
    const base = generateMapWithSubtypes();
    // Clear a small area
    for (let y = 0; y < base.tiles.length; y++) {
      for (let x = 0; x < base.tiles[y].length; x++) {
        base.tiles[y][x] = 1; // wall
        base.subtypes[y][x] = [];
      }
    }
    const py = 5, px = 5;
    base.tiles[py][px] = 0; // floor for player
    base.subtypes[py][px] = [TileSubtype.PLAYER];
    base.tiles[py][px + 1] = 0; // floor to the right
    base.subtypes[py][px + 1] = [TileSubtype.POT];

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
      heroMaxHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const origRandom = Math.random;
    Math.random = () => 0.49;
    try {
      const next = movePlayer(gameState, Direction.RIGHT);
      // Player should not have moved
      const [ny, nx] = ((): [number, number] => {
        for (let y = 0; y < next.mapData.subtypes.length; y++) {
          for (let x = 0; x < next.mapData.subtypes[y].length; x++) {
            if (next.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x];
          }
        }
        throw new Error('player not found');
      })();
      expect(ny).toBe(py);
      expect(nx).toBe(px);
      // POT should be replaced by FOOD
      expect(next.mapData.subtypes[py][px + 1]).toContain(TileSubtype.FOOD);
      expect(next.mapData.subtypes[py][px + 1]).not.toContain(TileSubtype.POT);
    } finally {
      Math.random = origRandom;
    }
  });

  it('generateCompleteMap() places between 3 and 7 ROCKs on floor tiles', () => {
    const map = generateCompleteMap();
    let rockCount = 0;
    for (let y = 0; y < map.subtypes.length; y++) {
      for (let x = 0; x < map.subtypes[y].length; x++) {
        if (map.subtypes[y][x].includes(TileSubtype.ROCK)) rockCount++;
      }
    }
    expect(rockCount).toBeGreaterThanOrEqual(3);
    expect(rockCount).toBeLessThanOrEqual(7);
  });

  it('generateCompleteMap() places between 3 and 7 POTs on floor tiles', () => {
    const map = generateCompleteMap();
    let potCount = 0;
    for (let y = 0; y < map.subtypes.length; y++) {
      for (let x = 0; x < map.subtypes[y].length; x++) {
        if (map.subtypes[y][x].includes(TileSubtype.POT)) potCount++;
      }
    }
    expect(potCount).toBeGreaterThanOrEqual(3);
    expect(potCount).toBeLessThanOrEqual(7);
  });
});
