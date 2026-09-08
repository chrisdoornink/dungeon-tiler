import { playerNameFor, returningPlayersFrom } from "../../lib/stats/player_names";

describe("playerNameFor", () => {
  it("is deterministic and shaped 'Adjective Animal'", () => {
    const a = playerNameFor("0198a4f2-1234-4abc-9def-0123456789ab");
    expect(a).toBe(playerNameFor("0198a4f2-1234-4abc-9def-0123456789ab"));
    expect(a).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it("spreads distinct ids across many names", () => {
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) names.add(playerNameFor(`user_${i}`));
    // 48*48 = 2304 possible names; 200 ids should land on well over 150 of them.
    expect(names.size).toBeGreaterThan(150);
  });
});

describe("returningPlayersFrom", () => {
  it("keeps only players seen on 2+ distinct days, counting days not runs", () => {
    const players = returningPlayersFrom([
      { distinctId: "a", day: "2026-09-01" },
      { distinctId: "a", day: "2026-09-01" }, // same day twice — still one day
      { distinctId: "a", day: "2026-09-02" },
      { distinctId: "b", day: "2026-09-01" },
      { distinctId: "b", day: "2026-09-01" },
      { distinctId: "c", day: "2026-09-01" },
      { distinctId: "c", day: "2026-09-03" },
      { distinctId: "c", day: "2026-09-05" },
      { distinctId: "", day: "2026-09-05" },
    ]);
    expect(Object.keys(players).sort()).toEqual(["a", "c"]);
    expect(players.a.days).toBe(2);
    expect(players.c.days).toBe(3);
    expect(players.a.name).toBe(playerNameFor("a"));
  });
});
