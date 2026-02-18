import { allocateChestsAndKeys } from '../../lib/map/map-features';
import { TileSubtype } from '../../lib/map/constants';

describe('Multi-tier chest/key allocation', () => {
  // Run multiple iterations to cover randomness
  const ITERATIONS = 50;

  test('sword and shield chests are placed only on floors 1–3', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      for (const [floor, data] of alloc.entries()) {
        for (const content of data.chestContents) {
          if (content === TileSubtype.SWORD || content === TileSubtype.SHIELD) {
            expect(floor).toBeGreaterThanOrEqual(1);
            expect(floor).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });

  test('snake medallion chest is placed only on floors 5–7', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      for (const [floor, data] of alloc.entries()) {
        for (const content of data.chestContents) {
          if (content === TileSubtype.SNAKE_MEDALLION) {
            expect(floor).toBeGreaterThanOrEqual(5);
            expect(floor).toBeLessThanOrEqual(7);
          }
        }
      }
    }
  });

  test('exactly 2 early chests (sword + shield) and 1 medallion chest are allocated', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      let totalChests = 0;
      let hasSword = false;
      let hasShield = false;
      let hasMedallion = false;
      for (const [, data] of alloc.entries()) {
        totalChests += data.chests;
        for (const content of data.chestContents) {
          if (content === TileSubtype.SWORD) hasSword = true;
          if (content === TileSubtype.SHIELD) hasShield = true;
          if (content === TileSubtype.SNAKE_MEDALLION) hasMedallion = true;
        }
      }
      expect(totalChests).toBe(3);
      expect(hasSword).toBe(true);
      expect(hasShield).toBe(true);
      expect(hasMedallion).toBe(true);
    }
  });

  test('exactly 3 keys are allocated total', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      let totalKeys = 0;
      for (const [, data] of alloc.entries()) {
        totalKeys += data.keys;
      }
      expect(totalKeys).toBe(3);
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

  test('allocation covers floors 1–7', () => {
    const alloc = allocateChestsAndKeys();
    for (let f = 1; f <= 7; f++) {
      expect(alloc.has(f)).toBe(true);
    }
  });
});
