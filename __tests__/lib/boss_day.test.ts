import { bossDayInfoForDate } from "../../lib/stats/boss_day";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
} from "../../lib/map/game-state";

describe("bossDayInfoForDate", () => {
  test("is deterministic: the same date always returns the same entrance", () => {
    for (const day of ["2026-07-28", "2026-08-14", "2026-12-25", "2027-01-01"]) {
      const a = bossDayInfoForDate(day);
      const b = bossDayInfoForDate(day);
      expect(a).toEqual(b);
    }
  });

  test("different dates can roll different entrances (not a constant)", () => {
    const seen = new Set<string | null>();
    for (let d = 1; d <= 60; d++) {
      const day = `2026-09-${String(((d - 1) % 28) + 1).padStart(2, "0")}`;
      seen.add(bossDayInfoForDate(day).entranceKind);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("every entrance kind is reachable across a wide sample, and never null", () => {
    // BOSS_DAY_CHANCE is currently 1 (every day has one), so entranceKind should
    // never be null for any date. If that constant ever changes, this test's
    // failure is the signal to update the assumption here.
    const tally: Record<string, number> = {};
    for (let d = 1; d <= 90; d++) {
      const day = `2026-10-${String(((d - 1) % 28) + 1).padStart(2, "0")}`;
      const info = bossDayInfoForDate(day);
      expect(info.entranceKind).not.toBeNull();
      tally[info.entranceKind!] = (tally[info.entranceKind!] ?? 0) + 1;
    }
    for (const k of ["bomb", "douse", "moat-lava", "moat-water"]) {
      expect(tally[k] ?? 0).toBeGreaterThan(0);
    }
  });

  test("arenaSeed is water for douse/moat-water, lava for bomb/moat-lava", () => {
    for (let d = 1; d <= 40; d++) {
      const day = `2026-11-${String(((d - 1) % 28) + 1).padStart(2, "0")}`;
      const info = bossDayInfoForDate(day);
      if (info.entranceKind === "douse" || info.entranceKind === "moat-water") {
        expect(info.arenaSeed).toBe("water");
      } else if (info.entranceKind === "bomb" || info.entranceKind === "moat-lava") {
        expect(info.arenaSeed).toBe("lava");
      }
    }
  });

  test("matches the real generation chain a player's browser runs", () => {
    // Cross-check against the same replay used elsewhere (advanceToNextFloor twice),
    // proving bossDayInfoForDate isn't drifting from the actual daily flow.
    for (const day of ["2026-07-28", "2026-07-29", "2026-07-30"]) {
      const seed = hashStringToSeed(day);
      const f1 = withPatchedMathRandom(mulberry32(seed), () => initializeGameStateForMultiTier(1));
      const f2 = advanceToNextFloor(f1, seed);
      const f3 = advanceToNextFloor(f2, seed);
      const info = bossDayInfoForDate(day);
      expect(info.entranceKind).toBe(f3.bossEntranceKind ?? null);
      expect(info.arenaSeed).toBe(f3.bossArenaSeed ?? null);
    }
  });
});
