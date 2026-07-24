import { level2ChestStatusForDate } from "../../lib/stats/daily_chest";
import { initializeGameStateForMultiTier } from "../../lib/map/game-state";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { TileSubtype } from "../../lib/map/constants";

const L2_POOL = new Set([
  TileSubtype.SNAKE_MEDALLION,
  TileSubtype.EXTRA_HEART,
  TileSubtype.BOMB,
]);

describe("level2ChestStatusForDate", () => {
  const dates = ["2026-07-24", "2026-07-23", "2026-01-01", "2025-12-31", "2026-06-15"];

  it("is deterministic for a given date", () => {
    for (const d of dates) {
      expect(level2ChestStatusForDate(d)).toEqual(level2ChestStatusForDate(d));
    }
  });

  it("always draws exactly two distinct items from the L2 pool", () => {
    for (const d of dates) {
      const { items } = level2ChestStatusForDate(d);
      expect(items).toHaveLength(2);
      const subtypes = items.map((i) => i.subtype);
      expect(new Set(subtypes).size).toBe(2); // distinct
      subtypes.forEach((s) => expect(L2_POOL.has(s)).toBe(true));
    }
  });

  it("bombAvailable reflects whether a bomb is among the items", () => {
    for (const d of dates) {
      const status = level2ChestStatusForDate(d);
      const hasBomb = status.items.some((i) => i.key === "bomb");
      expect(status.bombAvailable).toBe(hasBomb);
    }
  });

  it("matches what the real daily generator places in the Level 2 chests", () => {
    // The single source of truth: reproduce the exact seeded path the game uses
    // to build a daily run and compare its floor-2 chest contents to our helper.
    for (const d of dates) {
      const rng = mulberry32(hashStringToSeed(d));
      const state = withPatchedMathRandom(rng, () => initializeGameStateForMultiTier(1));
      const gameL2 = state.floorChestAllocation?.[2]?.chestContents ?? [];
      const helperL2 = level2ChestStatusForDate(d).items.map((i) => i.subtype);
      expect(helperL2).toEqual(gameL2);
    }
  });
});
