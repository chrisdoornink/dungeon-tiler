import { allocateChestsAndKeys } from '../../lib/map/map-features';
import { TileSubtype } from '../../lib/map/constants';

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

  test('snake medallion chest is placed only on floor 2', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      for (const [floor, data] of alloc.entries()) {
        for (const content of data.chestContents) {
          if (content === TileSubtype.SNAKE_MEDALLION) {
            expect(floor).toBe(2);
          }
        }
      }
    }
  });

  test('exactly 4 chests total: 2 on floor 1 (sword + shield) and 2 on floor 2 (medallion + heart)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const alloc = allocateChestsAndKeys();
      let totalChests = 0;
      let hasSword = false;
      let hasShield = false;
      let hasMedallion = false;
      let hasHeart = false;
      for (const [, data] of alloc.entries()) {
        totalChests += data.chests;
        for (const content of data.chestContents) {
          if (content === TileSubtype.SWORD) hasSword = true;
          if (content === TileSubtype.SHIELD) hasShield = true;
          if (content === TileSubtype.SNAKE_MEDALLION) hasMedallion = true;
          if (content === TileSubtype.EXTRA_HEART) hasHeart = true;
        }
      }
      expect(totalChests).toBe(4);
      expect(hasSword).toBe(true);
      expect(hasShield).toBe(true);
      expect(hasMedallion).toBe(true);
      expect(hasHeart).toBe(true);
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
