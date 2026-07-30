import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { TileSubtype } from "../../lib/map/constants";

// Build a real daily exactly the way the game does: seeded floor 1, then advance.
function buildDay(dateStr: string): { f1: GameState; f3: GameState } {
  const seed = hashStringToSeed(dateStr);
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1)
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  return { f1, f3 };
}

function count(s: GameState, sub: number): number {
  let n = 0;
  for (const row of s.mapData.subtypes) for (const c of row) if (c.includes(sub)) n++;
  return n;
}

/** Does this run hand out a bomb at all? (bombs come from the L2 chest pool) */
function dayHasBomb(f1: GameState): boolean {
  return Object.values(f1.floorChestAllocation ?? {}).some((a) =>
    (a.chestContents ?? []).includes(TileSubtype.BOMB)
  );
}

function entranceOf(f3: GameState): string {
  // A bomb day stamps a bracketed WALL_SEAL and records "boss" as its payload; the
  // BOSS_ENTRANCE itself doesn't exist on the map until the seal is blown open. Counting
  // WALL_SEAL tiles would NOT work — decoy cracks are rolled on every floor regardless of
  // the entrance kind, so a douse or moat day can carry cracks too.
  if (Object.values(f3.sealPayloads ?? {}).includes("boss")) return "bomb";
  if (count(f3, TileSubtype.DARK_PORTAL) > 0) return "douse";
  if (count(f3, TileSubtype.BOSS_ENTRANCE) > 0) return `moat-${f3.bossArenaSeed}`;
  return "none";
}

const DAYS = Array.from({ length: 60 }, (_, i) => `2026-08-${String((i % 28) + 1).padStart(2, "0")}`)
  .map((d, i) => (i < 28 ? d : d.replace("2026-08", "2026-09")));

describe("daily boss-entrance rotation", () => {
  test("is DETERMINISTIC — same date reproduces the whole floor and its enemies", () => {
    for (const day of ["2026-07-28", "2026-08-14", "2026-12-25"]) {
      const a = buildDay(day).f3;
      const b = buildDay(day).f3;
      expect(entranceOf(a)).toBe(entranceOf(b));
      expect(a.bossArenaSeed).toBe(b.bossArenaSeed);
      expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
      const kinds = (s: GameState) =>
        (s.enemies ?? []).map((e) => `${e.kind}@${e.y},${e.x}`).sort().join("|");
      expect(kinds(a)).toBe(kinds(b));
    }
  });

  test("EVERY day offers a reachable entrance — never a bomb door on a bombless day", () => {
    for (const day of DAYS) {
      const { f1, f3 } = buildDay(day);
      const kind = entranceOf(f3);
      // The bug this pins: a bombless day used to roll "bomb" and end up with nothing.
      expect(kind).not.toBe("none");
      if (!dayHasBomb(f1)) expect(kind).not.toBe("bomb");
    }
  });

  test("a douse day always has ghosts (they're how you go dark) and water to wade", () => {
    let douseDays = 0;
    for (const day of DAYS) {
      const { f3 } = buildDay(day);
      if (entranceOf(f3) !== "douse") continue;
      douseDays++;
      expect((f3.enemies ?? []).filter((e) => e.kind === "ghost").length).toBeGreaterThanOrEqual(3);
      expect(count(f3, TileSubtype.DEEP_WATER)).toBeGreaterThan(0);
    }
    expect(douseDays).toBeGreaterThan(0); // the sample actually covered some
  });

  test("all four kinds appear across the sample, bomb only on bomb days", () => {
    const tally: Record<string, number> = {};
    for (const day of DAYS) {
      const { f1, f3 } = buildDay(day);
      const kind = entranceOf(f3);
      tally[kind] = (tally[kind] ?? 0) + 1;
      if (kind === "bomb") expect(dayHasBomb(f1)).toBe(true);
    }
    for (const k of ["bomb", "douse", "moat-lava", "moat-water"]) {
      expect(tally[k] ?? 0).toBeGreaterThan(0);
    }
  });

  test("the floor stays completable: exit + key present and never drowned", () => {
    for (const day of DAYS.slice(0, 25)) {
      const { f3 } = buildDay(day);
      expect(count(f3, TileSubtype.EXIT)).toBeGreaterThan(0);
      expect(count(f3, TileSubtype.EXITKEY)).toBeGreaterThan(0);
      for (const row of f3.mapData.subtypes) {
        for (const c of row) {
          if (c.includes(TileSubtype.EXIT) || c.includes(TileSubtype.EXITKEY)) {
            expect(c.includes(TileSubtype.LAVA)).toBe(false);
            expect(c.includes(TileSubtype.DEEP_WATER)).toBe(false);
          }
        }
      }
    }
  });
});
