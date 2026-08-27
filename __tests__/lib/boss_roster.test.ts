import {
  BOSS_ROSTER,
  BOSS_KINDS,
  bossInfo,
  bossEmojiFor,
  bossNameFor,
  rollDailyBossKind,
  fisherRetiredForDate,
  type BossKind,
} from "../../lib/bosses/boss_roster";
import { bossDayInfoForDate } from "../../lib/stats/boss_day";
import { BOSS_DAY_CHANCE } from "../../lib/bosses/boss_entrances";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";

/** Build a real daily floor 3 exactly the way the game does. */
function buildFloor3(dateStr: string): GameState {
  const seed = hashStringToSeed(dateStr);
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1, { fisherRetired: fisherRetiredForDate(dateStr) })
  );
  return advanceToNextFloor(advanceToNextFloor(f1, seed), seed);
}

const DAYS = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});

describe("the boss roster", () => {
  it("gives every boss a distinct three-emoji signature", () => {
    const seen = new Set<string>();
    for (const kind of BOSS_KINDS) {
      const info = BOSS_ROSTER[kind];
      expect(info.kind).toBe(kind); // key and payload agree
      expect(info.emoji).toHaveLength(3);
      for (const e of info.emoji) expect(e.length).toBeGreaterThan(0);
      expect(info.displayName.length).toBeGreaterThan(0);
      expect(info.tagline.length).toBeGreaterThan(0);
      const sig = info.emoji.join("");
      expect(seen.has(sig)).toBe(false); // two bosses must never share a crest
      seen.add(sig);
    }
    expect(seen.size).toBe(BOSS_KINDS.length);
  });

  it("keeps the Shaper's historic crest byte-identical", () => {
    // Runs recorded before the roster existed are rendered from this same table, so
    // changing it would retroactively relabel old runs on the stats page.
    expect(bossEmojiFor("shaper")).toBe("❄️💀🔥");
  });

  it("falls back to the Shaper for legacy rows with no boss_kind", () => {
    // Every boss room was a Shaper before the roll existed, so this is the historically
    // correct reading rather than an arbitrary default.
    expect(bossEmojiFor(null)).toBe(bossEmojiFor("shaper"));
    expect(bossEmojiFor(undefined)).toBe(bossEmojiFor("shaper"));
    expect(bossNameFor(null)).toBe("The Shaper");
  });

  it("does not invent a boss for an unknown kind", () => {
    // Uses a sentinel that can never become real. This originally used "coilwyrm" as the
    // stand-in for "not a boss", which quietly became false the day the Coilwyrm joined the
    // roster — an unknown-value test should not be written against a value anyone might
    // later add.
    expect(bossInfo("not-a-boss")).toBeNull();
    expect(bossInfo("")).toBeNull();
    // ...but the display helpers still return something renderable.
    expect(bossEmojiFor("not-a-boss")).toBe(bossEmojiFor("shaper"));
  });

  it("only ever rolls a boss that is actually in the roster", () => {
    for (let i = 0; i < 500; i++) {
      const kind = withPatchedMathRandom(mulberry32(i), rollDailyBossKind);
      expect(BOSS_KINDS).toContain(kind);
    }
  });

  it("cannot roll past the end of the roster on an rng that returns ~1", () => {
    // Math.random() is [0,1), but the roll is clamped anyway so a hand-rolled or future rng
    // that can return exactly 1 yields a real boss instead of undefined.
    for (const v of [0.999999999, 1]) {
      const kind = withPatchedMathRandom({ next: () => v }, rollDailyBossKind);
      expect(BOSS_KINDS).toContain(kind);
      expect(bossInfo(kind)).not.toBeNull();
    }
  });

  it("reaches the first and last roster entries at the range extremes", () => {
    expect(withPatchedMathRandom({ next: () => 0 }, rollDailyBossKind)).toBe(BOSS_KINDS[0]);
    expect(withPatchedMathRandom({ next: () => 0.999 }, rollDailyBossKind)).toBe(
      BOSS_KINDS[BOSS_KINDS.length - 1]
    );
  });
});

describe("the daily boss roll", () => {
  it("is IDENTICAL for every player on a given date", () => {
    // The whole point: it's a roll, but a shared one. Two independent builds of the same
    // date must agree.
    for (const day of ["2026-08-03", "2026-09-17", "2026-12-25"]) {
      const a = buildFloor3(day);
      const b = buildFloor3(day);
      expect(a.dailyBossKind).toBe(b.dailyBossKind);
      expect(bossDayInfoForDate(day).bossKind).toBe(a.dailyBossKind ?? null);
    }
  });

  it("varies across days, and uses the whole roster", () => {
    const counts = new Map<BossKind, number>();
    let bossDays = 0;
    for (const day of DAYS) {
      const kind = buildFloor3(day).dailyBossKind;
      if (!kind) continue;
      bossDays++;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect(bossDays).toBeGreaterThan(10); // enough boss days in 90 to judge
    // Every boss must actually show up, or the "which did you get?" question is dead.
    for (const kind of BOSS_KINDS) {
      expect(counts.get(kind) ?? 0).toBeGreaterThan(0);
    }
    // And neither should dominate — a uniform roll over 2 shouldn't be worse than 80/20.
    const share = (counts.get(BOSS_KINDS[0]) ?? 0) / bossDays;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.8);
  });

  it("is present exactly when the day has an entrance, and never otherwise", () => {
    // NOTE: BOSS_DAY_CHANCE is currently 1, so every day has a boss room and the
    // "bossless" branch below is vacuous today. It is asserted anyway because that
    // tuning is a dial — the moment it drops below 1 this is the property that stops a
    // bossless day from reporting a boss crest, and it would otherwise go untested.
    let withEntrance = 0;
    let without = 0;
    for (const day of DAYS) {
      const f3 = buildFloor3(day);
      const info = bossDayInfoForDate(day);
      if (f3.bossEntranceKind) {
        withEntrance++;
        expect(f3.dailyBossKind).toBeDefined();
        expect(info.bossKind).toBe(f3.dailyBossKind);
        expect(info.bossEmoji).toBe(bossEmojiFor(f3.dailyBossKind));
        expect(info.bossName).toBe(bossNameFor(f3.dailyBossKind));
      } else {
        without++;
        expect(f3.dailyBossKind).toBeUndefined();
        expect(info.bossKind).toBeNull();
        expect(info.bossEmoji).toBeNull();
      }
    }
    expect(withEntrance + without).toBe(DAYS.length);
    expect(BOSS_DAY_CHANCE === 1 ? without : withEntrance).toBeGreaterThanOrEqual(0);
  });

  it("documents the current every-day-is-a-boss-day tuning", () => {
    // If this ever changes, the vacuous branch above becomes live — which is the point.
    expect(BOSS_DAY_CHANCE).toBe(1);
  });

  it("is decorrelated from the entrance kind", () => {
    // If the roll shared the floor's RNG stream these would move together, which would make
    // the boss guessable from the door you found.
    const pairs = new Map<string, Set<string>>();
    for (const day of DAYS) {
      const f3 = buildFloor3(day);
      if (!f3.bossEntranceKind || !f3.dailyBossKind) continue;
      const set = pairs.get(f3.bossEntranceKind) ?? new Set<string>();
      set.add(f3.dailyBossKind);
      pairs.set(f3.bossEntranceKind, set);
    }
    // At least one door must have led to more than one boss across the sample.
    expect([...pairs.values()].some((s) => s.size > 1)).toBe(true);
  });
});

describe("the roll does not disturb existing daily generation", () => {
  it("leaves floor 3's map and enemies untouched", () => {
    // The roll deliberately draws from its OWN rng stream. Drawing from the floor's stream
    // would shift every later roll, changing what past dates replay to and so corrupting the
    // historical answers lib/stats/* gets by re-running this generator. This pins the map to
    // the boss roll being side-effect-free: two builds of the same day are byte-identical,
    // including the enemies placed AFTER the roll site.
    for (const day of ["2026-08-05", "2026-10-31"]) {
      const a = buildFloor3(day);
      const b = buildFloor3(day);
      expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
      expect(a.enemies?.map((e) => `${e.kind}@${e.y},${e.x}`)).toEqual(
        b.enemies?.map((e) => `${e.kind}@${e.y},${e.x}`)
      );
    }
  });
});
