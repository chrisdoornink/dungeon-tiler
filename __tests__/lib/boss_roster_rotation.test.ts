import { BOSS_ROSTER, BOSS_KINDS, rollDailyBossKind } from "../../lib/bosses/boss_roster";
import { shareEmojiForKind } from "../../lib/enemies/monster_summary";

describe("boss roster and rotation", () => {
  test("all four bosses are in the daily rotation", () => {
    expect(BOSS_KINDS.sort()).toEqual(
      ["coilwyrm", "fisher", "quarrymaster", "shaper"].sort()
    );
  });

  test("the roll can produce every boss", () => {
    const seen = new Set<string>();
    let n = 0;
    const rng = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
    const spy = jest.spyOn(Math, "random").mockImplementation(rng);
    for (let i = 0; i < 400; i++) seen.add(rollDailyBossKind());
    spy.mockRestore();
    expect(seen.size).toBe(BOSS_KINDS.length);
  });

  test("every boss's kill-tally crest matches its roster crest", () => {
    // Two surfaces show the same signature; if they drift, one boss reads as two.
    for (const kind of BOSS_KINDS) {
      expect(shareEmojiForKind(kind)).toBe(BOSS_ROSTER[kind].emoji.join(""));
    }
  });

  test("no two bosses share a crest", () => {
    const crests = BOSS_KINDS.map((k) => BOSS_ROSTER[k].emoji.join(""));
    expect(new Set(crests).size).toBe(crests.length);
  });

  test("every boss has a display name and a tagline", () => {
    for (const kind of BOSS_KINDS) {
      expect(BOSS_ROSTER[kind].displayName).toMatch(/\S/);
      expect(BOSS_ROSTER[kind].tagline).toMatch(/\S/);
    }
  });
});
