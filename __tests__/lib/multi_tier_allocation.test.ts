import { allocateChestsAndKeys } from '../../lib/map/map-features';
import { TileSubtype } from '../../lib/map/constants';
import { mulberry32, withPatchedMathRandom } from '../../lib/rng';

describe('Multi-tier chest/key allocation', () => {
  // Run multiple iterations to cover randomness
  const ITERATIONS = 50;

  test('sword and shield chests are placed only on floor 1', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      for (const [floor, data] of alloc.entries()) {
        for (const content of data.chestContents) {
          if (content === TileSubtype.SWORD || content === TileSubtype.SHIELD) {
            expect(floor).toBe(1);
          }
        }
      }
    }
  });

  // Daily reproducibility contract: the draw uses the externally-seeded Math.random,
  // so the same seed must always yield the same Floor 2 items, and different seeds
  // are allowed to differ. This guards the seeding dependency (see allocateChestsAndKeys).
  test('a fixed seed always produces the same Floor 2 draw', () => {
    const drawForSeed = (seed: number) =>
      withPatchedMathRandom(mulberry32(seed), () => allocateChestsAndKeys().get(2)!.chestContents);

    expect(drawForSeed(12345)).toEqual(drawForSeed(12345));
    expect(drawForSeed(777)).toEqual(drawForSeed(777));

    // Across a spread of seeds, at least two distinct draws appear (the pool actually varies).
    const draws = new Set(
      Array.from({ length: 20 }, (_, i) => drawForSeed(1000 + i).join(','))
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  test('Level 2 optional items (bomb / medallion / heart) only ever appear on floor 2', () => {
    const optional = [TileSubtype.SNAKE_MEDALLION, TileSubtype.EXTRA_HEART, TileSubtype.BOMB];
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      for (const [floor, data] of alloc.entries()) {
        for (const content of data.chestContents) {
          if (optional.includes(content)) {
            expect(floor).toBe(2);
          }
        }
      }
    }
  });

  test('Floor 2 draws exactly 2 distinct items from the optional pool each run', () => {
    const pool = new Set([
      TileSubtype.SNAKE_MEDALLION,
      TileSubtype.EXTRA_HEART,
      TileSubtype.BOMB,
    ]);
    for (let i = 0; i < ITERATIONS; i++) {
      const f2 = allocateChestsAndKeys().get(2)!;
      expect(f2.chestContents.length).toBe(2);
      // distinct
      expect(new Set(f2.chestContents).size).toBe(2);
      // all drawn from the pool
      for (const c of f2.chestContents) expect(pool.has(c)).toBe(true);
    }
  });

  test('over many runs, every optional item appears on floor 2 at least once', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const f2 = allocateChestsAndKeys().get(2)!;
      for (const c of f2.chestContents) seen.add(c);
    }
    expect(seen.has(TileSubtype.SNAKE_MEDALLION)).toBe(true);
    expect(seen.has(TileSubtype.EXTRA_HEART)).toBe(true);
    expect(seen.has(TileSubtype.BOMB)).toBe(true);
  });

  test('exactly 4 chests total: F1 sword+shield, F2 two optional items', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      let totalChests = 0;
      let hasSword = false;
      let hasShield = false;
      for (const [, data] of alloc.entries()) {
        totalChests += data.chests;
        for (const content of data.chestContents) {
          if (content === TileSubtype.SWORD) hasSword = true;
          if (content === TileSubtype.SHIELD) hasShield = true;
        }
      }
      expect(totalChests).toBe(4);
      expect(hasSword).toBe(true);
      expect(hasShield).toBe(true);
    }
  });

  test('exactly 4 keys are allocated total', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      let totalKeys = 0;
      for (const [, data] of alloc.entries()) {
        totalKeys += data.keys;
      }
      expect(totalKeys).toBe(4);
    }
  });

  test('cumulative keys >= cumulative chests at every floor (constraint)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      let cumulativeKeys = 0;
      let cumulativeChests = 0;
      // Check floors in order
      const maxFloor = Math.max(...alloc.keys());
      for (let f = 1; f <= maxFloor; f++) {
        const data = alloc.get(f);
        if (data) {
          cumulativeKeys += data.keys;
          cumulativeChests += data.chests;
        }
        expect(cumulativeKeys).toBeGreaterThanOrEqual(cumulativeChests);
      }
    }
  });

  test('allocation covers floors 1–3', () => {
    const alloc = allocateChestsAndKeys();
    for (let f = 1; f <= 3; f++) {
      expect(alloc.has(f)).toBe(true);
    }
  });
});
