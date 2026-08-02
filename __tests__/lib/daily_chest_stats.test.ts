import { level2ChestStatusForDate } from "../../lib/stats/daily_chest";
import { initializeGameStateForMultiTier } from "../../lib/map/game-state";
import {
  allocateChestsAndKeys,
  L2_OPTIONAL_POOL_V1,
  L2_OPTIONAL_POOL_V2,
  L2_POOL_V2_START_DATE,
} from "../../lib/map/map-features";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { TileSubtype } from "../../lib/map/constants";

const POOL_V1 = new Set(L2_OPTIONAL_POOL_V1);
const POOL_V2 = new Set(L2_OPTIONAL_POOL_V2);

/** Dates generated before the Amber Moth joined the pool — these must replay against V1. */
const LEGACY_DATES = ["2026-08-02", "2026-08-01", "2026-07-24", "2026-01-01", "2025-12-31"];
/** Dates generated with the V2 pool (on/after L2_POOL_V2_START_DATE). */
const V2_DATES = ["2026-08-03", "2026-08-04", "2026-09-14", "2027-02-02"];
const ALL_DATES = [...LEGACY_DATES, ...V2_DATES];

function poolFor(dateStr: string): Set<TileSubtype> {
  return dateStr < L2_POOL_V2_START_DATE ? POOL_V1 : POOL_V2;
}

describe("level2ChestStatusForDate", () => {
  it("has its own fixtures on the right side of the cutoff", () => {
    // Guards the rest of this file: if L2_POOL_V2_START_DATE is bumped (e.g. the merge
    // slipped) without moving these dates, every assertion below silently tests the wrong
    // pool version. Fail here instead, with an obvious message.
    for (const d of LEGACY_DATES) {
      expect(d < L2_POOL_V2_START_DATE).toBe(true);
    }
    for (const d of V2_DATES) {
      expect(d >= L2_POOL_V2_START_DATE).toBe(true);
    }
  });

  it("is deterministic for a given date", () => {
    for (const d of ALL_DATES) {
      expect(level2ChestStatusForDate(d)).toEqual(level2ChestStatusForDate(d));
    }
  });

  it("always draws exactly two distinct items from that date's L2 pool", () => {
    for (const d of ALL_DATES) {
      const { items } = level2ChestStatusForDate(d);
      expect(items).toHaveLength(2);
      const subtypes = items.map((i) => i.subtype);
      expect(new Set(subtypes).size).toBe(2); // distinct
      subtypes.forEach((s) => expect(poolFor(d).has(s)).toBe(true));
    }
  });

  it("bombAvailable reflects whether a bomb is among the items", () => {
    for (const d of ALL_DATES) {
      const status = level2ChestStatusForDate(d);
      const hasBomb = status.items.some((i) => i.key === "bomb");
      expect(status.bombAvailable).toBe(hasBomb);
    }
  });

  it("matches what the real daily generator places in the Level 2 chests", () => {
    // The single source of truth: reproduce the exact seeded path the game uses to build
    // a daily run and compare its floor-2 chest contents to our helper. Only meaningful
    // for dates the CURRENT pool generated — the live generator always uses the newest
    // pool, so replaying a pre-V2 date through it does not reproduce that day's loot.
    // That is exactly what the pinning below exists to handle.
    for (const d of V2_DATES) {
      const rng = mulberry32(hashStringToSeed(d));
      const state = withPatchedMathRandom(rng, () => initializeGameStateForMultiTier(1));
      const gameL2 = state.floorChestAllocation?.[2]?.chestContents ?? [];
      const helperL2 = level2ChestStatusForDate(d).items.map((i) => i.subtype);
      expect(helperL2).toEqual(gameL2);
    }
  });

  it("never reports the Amber Moth on a date generated before it existed", () => {
    for (const d of LEGACY_DATES) {
      const keys = level2ChestStatusForDate(d).items.map((i) => i.key);
      expect(keys).not.toContain("amber_moth");
    }
  });

  it("replays pre-V2 dates against the pool that was live then", () => {
    // The pool's Fisher-Yates shuffle makes one RNG call per entry, so a larger pool
    // consumes a different number of draws. Replaying an old date against V2 would report
    // loot that day never held; this pins the historical answer to the V1 pool.
    for (const d of LEGACY_DATES) {
      const rng = mulberry32(hashStringToSeed(d));
      const legacy = withPatchedMathRandom(rng, () =>
        allocateChestsAndKeys({ l2Pool: L2_OPTIONAL_POOL_V1 })
      );
      const expected = legacy.get(2)?.chestContents ?? [];
      const actual = level2ChestStatusForDate(d).items.map((i) => i.subtype);
      expect(actual).toEqual(expected);
    }
  });

  it("can draw the Amber Moth on some V2 date", () => {
    // Sanity: the fourth item is genuinely reachable, not stranded by an off-by-one in
    // the pool slice.
    const drawn = new Set<TileSubtype>();
    for (let i = 0; i < 120; i++) {
      const d = `2026-08-${String((i % 28) + 1).padStart(2, "0")}`;
      level2ChestStatusForDate(d).items.forEach((it) => drawn.add(it.subtype));
      if (drawn.has(TileSubtype.AMBER_MOTH)) break;
    }
    expect(drawn.has(TileSubtype.AMBER_MOTH)).toBe(true);
  });

  it("gives every poolable item a real key and icon, never the unknown fallback", () => {
    for (const d of ALL_DATES) {
      for (const item of level2ChestStatusForDate(d).items) {
        expect(item.key).not.toBe("unknown");
        expect(item.icon).toMatch(/^\/images\//);
      }
    }
  });
});
