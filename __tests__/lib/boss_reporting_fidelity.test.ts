// Guards the two surfaces that report a boss to the player — the shareable kill tally and the
// stats page's per-day crest — against the specific ways each one silently lied.
import {
  summarizeMonsters,
  monsterShareLines,
} from "../../lib/enemies/monster_summary";
import { reconcileBossDay, type BossDayInfo } from "../../lib/stats/boss_day";
import { BOSS_KINDS, BOSS_ROSTER } from "../../lib/bosses/boss_roster";

describe("kill tally: a Coilwyrm is one Coilwyrm", () => {
  // Severing the coil reaps each cut-off length through trackEnemyKill (game-state.ts), so a
  // real fight leaves a pile of `coilwyrm-coil` kills next to the single `coilwyrm` head.
  const run = {
    "earth-goblin": 12,
    coilwyrm: 1,
    "coilwyrm-coil": 8,
  } as const;

  test("the crest counts the head only, never the segments", () => {
    const summary = summarizeMonsters(run);
    const boss = summary.groups.find((g) => g.key === "coilwyrm");
    expect(boss).toBeDefined();
    expect(boss!.count).toBe(1);
    expect(boss!.emoji).toBe(BOSS_ROSTER.coilwyrm.emoji.join(""));
  });

  test("segments are still reported, in their own bucket", () => {
    const summary = summarizeMonsters(run);
    const coil = summary.groups.find((g) => g.key === "coil");
    expect(coil).toBeDefined();
    expect(coil!.count).toBe(8);
    expect(coil!.emoji).not.toBe(BOSS_ROSTER.coilwyrm.emoji.join(""));
  });

  test("the total still equals the run's kill count, so the breakdown adds up", () => {
    // The reaping path increments enemiesDefeated per severed length, so hiding the segments
    // rather than re-bucketing them would leave the shared total short.
    const summary = summarizeMonsters(run);
    expect(summary.total).toBe(12 + 1 + 8);
  });

  test("the share line reads as one boss", () => {
    const line = monsterShareLines(summarizeMonsters(run))[0];
    expect(line).toContain(`${BOSS_ROSTER.coilwyrm.emoji.join("")}×1`);
    expect(line).not.toContain(`${BOSS_ROSTER.coilwyrm.emoji.join("")}×9`);
  });

  test("the boss crest still reads last, as the headline kill", () => {
    const summary = summarizeMonsters(run);
    expect(summary.groups[summary.groups.length - 1].key).toBe("coilwyrm");
  });

  test("every boss reports exactly one kill from a one-kill run", () => {
    for (const kind of BOSS_KINDS) {
      const summary = summarizeMonsters({ [kind]: 1 });
      const group = summary.groups.find(
        (g) => g.emoji === BOSS_ROSTER[kind].emoji.join("")
      );
      expect(group).toBeDefined();
      expect(group!.count).toBe(1);
    }
  });
});

describe("stats page: growing the roster must not rewrite the past", () => {
  const replayed: BossDayInfo = {
    entranceKind: "douse",
    arenaSeed: "water",
    bossKind: "fisher",
    bossEmoji: BOSS_ROSTER.fisher.emoji.join(""),
    bossName: "The Fisher",
  };

  test("what players actually rolled overrules the replay", () => {
    // The exact 2026-07-30 case: the day was the Shaper, but replaying it under a roster that
    // has since grown from 2 to 4 re-indexes the same draw and yields the Fisher.
    const out = reconcileBossDay(replayed, ["shaper", "shaper"]);
    expect(out.bossKind).toBe("shaper");
    expect(out.bossEmoji).toBe(BOSS_ROSTER.shaper.emoji.join(""));
    expect(out.bossName).toBe("The Shaper");
  });

  test("the entrance is left alone — only the boss identity is in question", () => {
    const out = reconcileBossDay(replayed, ["shaper"]);
    expect(out.entranceKind).toBe("douse");
    expect(out.arenaSeed).toBe("water");
  });

  test("falls back to the replay when nobody recorded a boss that day", () => {
    expect(reconcileBossDay(replayed, []).bossKind).toBe("fisher");
    expect(reconcileBossDay(replayed, [null, undefined]).bossKind).toBe("fisher");
  });

  test("a single malformed row cannot relabel a day", () => {
    const out = reconcileBossDay(replayed, [
      "quarrymaster",
      "shaper",
      "shaper",
      "shaper",
    ]);
    expect(out.bossKind).toBe("shaper");
  });

  test("values no longer in the roster are ignored rather than trusted", () => {
    const out = reconcileBossDay(replayed, ["warden", "shade"]);
    expect(out.bossKind).toBe("fisher");
  });

  test("agrees with the replay when the roster has not moved", () => {
    const out = reconcileBossDay(replayed, ["fisher"]);
    expect(out.bossKind).toBe("fisher");
    expect(out.bossEmoji).toBe(replayed.bossEmoji);
  });
});
