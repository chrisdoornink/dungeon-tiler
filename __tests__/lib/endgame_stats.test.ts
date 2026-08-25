import {
  toGameCompleteRow,
  parseHogQLRows,
  summarizeDay,
  groupRowsByDay,
  type GameCompleteRow,
} from "../../lib/stats/endgame_stats";

function makeRow(overrides: Partial<GameCompleteRow> = {}): GameCompleteRow {
  return {
    day: "2026-07-24",
    timestamp: "2026-07-24T12:00:00.000Z",
    startedAt: null,
    distinctId: "user_1",
    outcome: "win",
    levelReached: 3,
    heroHealth: 4,
    steps: 100,
    enemiesDefeated: 10,
    damageDealt: 20,
    damageTaken: 5,
    chestsOpened: 2,
    totalChests: 4,
    hasSword: true,
    hasShield: false,
    treesDestroyed: 0,
    wallsDestroyed: 0,
    reachedOutsideWorld: false,
    reachedPinkRealm: false,
    collectedChestItems: [],
    deathCause: null,
    deathCauseEnemyKind: null,
    reachedBossRoom: false,
    bossDefeated: false,
    bossEntranceKind: null,
    bossKind: null,
    dailyBossKind: null,
    ...overrides,
  };
}

describe("toGameCompleteRow coercion", () => {
  it("coerces mixed-typed PostHog values", () => {
    const row = toGameCompleteRow({
      day: "2026-07-24",
      timestamp: "2026-07-24T00:00:00Z",
      distinct_id: "user_abc",
      outcome: "WIN",
      level_reached: "2", // string floor
      hero_health: "3",
      steps: 250,
      enemies_defeated: "12",
      damage_dealt: null,
      damage_taken: undefined,
      chests_opened: 1,
      total_chests: 4,
      has_sword: "true", // string boolean
      has_shield: false,
      trees_destroyed: "1", // string number
      walls_destroyed: 2,
      reached_outside_world: 1, // numeric truthy
      reached_pink_realm: "false",
      death_cause: null,
      death_cause_enemy_kind: null,
    });

    expect(row.outcome).toBe("win");
    expect(row.levelReached).toBe(2);
    expect(row.heroHealth).toBe(3);
    expect(row.enemiesDefeated).toBe(12);
    expect(row.damageDealt).toBeNull();
    expect(row.damageTaken).toBeNull();
    expect(row.hasSword).toBe(true);
    expect(row.hasShield).toBe(false);
    expect(row.treesDestroyed).toBe(1);
    expect(row.wallsDestroyed).toBe(2);
    expect(row.reachedOutsideWorld).toBe(true);
    expect(row.reachedPinkRealm).toBe(false);
  });

  it("treats a non-win outcome as 'dead' and missing counts as safe defaults", () => {
    const row = toGameCompleteRow({ day: "2026-07-24", outcome: "dead" });
    expect(row.outcome).toBe("dead");
    expect(row.treesDestroyed).toBe(0);
    expect(row.wallsDestroyed).toBe(0);
    expect(row.reachedPinkRealm).toBe(false);
    expect(row.levelReached).toBeNull();
    expect(row.collectedChestItems).toEqual([]);
    // Boss fields default safe when the run never generated them (e.g. died on F1).
    expect(row.reachedBossRoom).toBe(false);
    expect(row.bossDefeated).toBe(false);
    expect(row.bossEntranceKind).toBeNull();
    expect(row.bossKind).toBeNull();
  });

  it("coerces boss-room fields: reached/defeated flags and the entrance/boss kind strings", () => {
    const row = toGameCompleteRow({
      day: "2026-07-24",
      outcome: "win",
      reached_boss_room: 1, // numeric truthy, like reached_outside_world above
      boss_defeated: "true",
      boss_entrance_kind: "douse",
      boss_kind: "shaper",
    });
    expect(row.reachedBossRoom).toBe(true);
    expect(row.bossDefeated).toBe(true);
    expect(row.bossEntranceKind).toBe("douse");
    expect(row.bossKind).toBe("shaper");
  });

  it("parses collected_chest_items as an array or a JSON string, else []", () => {
    expect(
      toGameCompleteRow({ day: "d", collected_chest_items: ["sword", "extra_heart"] })
        .collectedChestItems
    ).toEqual(["sword", "extra_heart"]);
    expect(
      toGameCompleteRow({ day: "d", collected_chest_items: '["shield","bomb"]' })
        .collectedChestItems
    ).toEqual(["shield", "bomb"]);
    expect(
      toGameCompleteRow({ day: "d", collected_chest_items: null }).collectedChestItems
    ).toEqual([]);
  });
});

describe("parseHogQLRows", () => {
  it("maps rows-as-arrays to objects by column position", () => {
    const columns = ["day", "outcome", "level_reached", "reached_pink_realm"];
    const results: unknown[][] = [
      ["2026-07-24", "win", "3", true],
      ["2026-07-24", "dead", "1", false],
    ];
    const rows = parseHogQLRows(columns, results);
    expect(rows).toHaveLength(2);
    expect(rows[0].outcome).toBe("win");
    expect(rows[0].levelReached).toBe(3);
    expect(rows[0].reachedPinkRealm).toBe(true);
    expect(rows[1].outcome).toBe("dead");
  });
});

describe("summarizeDay", () => {
  it("computes wins, win rate, objective tallies, and avg floor", () => {
    const games = [
      makeRow({ outcome: "win", levelReached: 3, reachedPinkRealm: true, reachedOutsideWorld: true, treesDestroyed: 2 }),
      makeRow({ outcome: "dead", levelReached: 1 }),
      makeRow({ outcome: "dead", levelReached: 2, reachedOutsideWorld: true }),
      makeRow({ outcome: "win", levelReached: 3, treesDestroyed: 0 }),
    ];
    const s = summarizeDay(games);
    expect(s.total).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.reachedPinkRealm).toBe(1);
    expect(s.reachedOutsideWorld).toBe(2);
    expect(s.blewUpTree).toBe(1);
    expect(s.avgLevelReached).toBe(2.3); // (3+1+2+3)/4 = 2.25 -> 2.3
  });

  it("tallies reached/defeated boss counts across the day's games", () => {
    const games = [
      // Died on floor 1 -- never reached floor 3.
      makeRow({ outcome: "dead", levelReached: 1 }),
      // Reached floor 3 and found the boss room, but didn't kill it.
      makeRow({ outcome: "dead", levelReached: 3, reachedBossRoom: true }),
      // Reached floor 3, found it, and won by killing the boss.
      makeRow({ outcome: "win", levelReached: 3, reachedBossRoom: true, bossDefeated: true }),
    ];
    const s = summarizeDay(games);
    expect(s.reachedBossRoom).toBe(2);
    expect(s.bossDefeated).toBe(1);
  });

  it("handles an empty day", () => {
    const s = summarizeDay([]);
    expect(s.total).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.avgLevelReached).toBeNull();
  });
});

describe("groupRowsByDay", () => {
  it("groups by date_seed, newest day first, newest game first within a day", () => {
    const rows = [
      makeRow({ day: "2026-07-22", timestamp: "2026-07-22T08:00:00Z" }),
      makeRow({ day: "2026-07-24", timestamp: "2026-07-24T08:00:00Z" }),
      makeRow({ day: "2026-07-24", timestamp: "2026-07-24T10:00:00Z" }),
      makeRow({ day: "2026-07-23", timestamp: "2026-07-23T08:00:00Z" }),
    ];
    const grouped = groupRowsByDay(rows);
    expect(grouped.map((g) => g.date)).toEqual(["2026-07-24", "2026-07-23", "2026-07-22"]);
    // within the busiest day, the later timestamp comes first
    expect(grouped[0].games[0].timestamp).toBe("2026-07-24T10:00:00Z");
    expect(grouped[0].summary.total).toBe(2);
  });

  it("drops rows with an empty day", () => {
    const grouped = groupRowsByDay([makeRow({ day: "" }), makeRow({ day: "2026-07-24" })]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].date).toBe("2026-07-24");
  });
});
