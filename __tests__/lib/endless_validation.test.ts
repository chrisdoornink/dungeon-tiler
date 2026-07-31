import {
  MIN_SECONDS_PER_FLOOR,
  MIN_STEPS_PER_FLOOR,
  maxKillsThroughFloor,
  maxHeartsEnteringFloor,
  validateCheckpoint,
  validateSubmission,
  sanitizeName,
  type CheckpointStats,
  type RunRecord,
} from "../../lib/endless_validation";

const T0 = 1_000_000_000_000;

function freshRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    playerId: "p1",
    floor: 1,
    startedAt: T0,
    lastCheckpointAt: T0,
    steps: 0,
    enemiesDefeated: 0,
    damageDealt: 0,
    damageTaken: 0,
    flags: [],
    ...overrides,
  };
}

function stats(overrides: Partial<CheckpointStats> = {}): CheckpointStats {
  return {
    steps: 40,
    enemiesDefeated: 2,
    damageDealt: 8,
    damageTaken: 3,
    hasSword: false,
    hasShield: false,
    heroMaxHealth: 5,
    ...overrides,
  };
}

describe("checkpoint validation", () => {
  const later = T0 + 60_000; // a minute per floor: plenty

  it("passes a plausible floor 2 checkpoint", () => {
    expect(validateCheckpoint(freshRun(), 2, stats(), later)).toEqual([]);
  });

  it("flags non-advancing floors", () => {
    const flags = validateCheckpoint(freshRun({ floor: 3 }), 3, stats(), later);
    expect(flags.some((f) => f.startsWith("sequence"))).toBe(true);
  });

  it("tolerates a floor gap when time and steps cover it", () => {
    const run = freshRun();
    const twoFloorsLater = T0 + 2 * MIN_SECONDS_PER_FLOOR * 1000 + 1000;
    const flags = validateCheckpoint(
      run,
      3, // gap of 2 (a checkpoint request was dropped)
      stats({ steps: 2 * MIN_STEPS_PER_FLOOR + 5 }),
      twoFloorsLater
    );
    expect(flags).toEqual([]);
  });

  it("flags a gap crossed faster than real play allows", () => {
    const flags = validateCheckpoint(
      freshRun(),
      5, // claims 4 floors...
      stats({ steps: 100 }),
      T0 + 6_000 // ...in 6 seconds
    );
    expect(flags.some((f) => f.startsWith("timing"))).toBe(true);
  });

  it("flags inhuman floor times", () => {
    const flags = validateCheckpoint(freshRun(), 2, stats(), T0 + 1_000);
    expect(flags.some((f) => f.startsWith("timing"))).toBe(true);
  });

  it("flags regressing stats", () => {
    const run = freshRun({ steps: 50, enemiesDefeated: 5 });
    const flags = validateCheckpoint(run, 2, stats({ steps: 60, enemiesDefeated: 3 }), later);
    expect(flags).toContain("stats:regressed");
  });

  it("flags too few steps for the floor", () => {
    const run = freshRun({ steps: 40 });
    const flags = validateCheckpoint(run, 2, stats({ steps: 42 }), later);
    expect(flags.some((f) => f.startsWith("steps"))).toBe(true);
  });

  it("flags kill counts beyond what could have spawned", () => {
    const flags = validateCheckpoint(
      freshRun(),
      2,
      stats({ enemiesDefeated: maxKillsThroughFloor(1) + 1 }),
      later
    );
    expect(flags.some((f) => f.startsWith("kills"))).toBe(true);
  });

  it("allows a sword as early as entering floor 2 (starter items land floors 2-10)", () => {
    const flags = validateCheckpoint(freshRun(), 2, stats({ hasSword: true }), later);
    expect(flags).toEqual([]);
  });

  it("allows both sword and shield carried into a later floor", () => {
    const run = freshRun({ floor: 2, steps: 40 });
    const flags = validateCheckpoint(
      run,
      3,
      stats({ steps: 80, hasSword: true, hasShield: true }),
      later
    );
    expect(flags).toEqual([]);
  });

  it("flags impossible heart totals", () => {
    const flags = validateCheckpoint(
      freshRun(),
      2,
      stats({ heroMaxHealth: maxHeartsEnteringFloor(2) + 1 }),
      later
    );
    expect(flags.some((f) => f.startsWith("hearts"))).toBe(true);
  });
});

/**
 * A boss stands on every 6th endless floor, and each one hands over a heart on top of the
 * arena's own population. Both bounds have to keep up or an honest deep run is silently
 * kept off the board — the exact failure this module says is worse than a cheater.
 */
describe("boss floors stay inside the plausibility bounds", () => {
  const later = T0 + 600_000;

  it("allows the heart every boss floor hands over", () => {
    // Entering floor 7: base 5 + the starter-plan heart + floor 6's boss.
    expect(maxHeartsEnteringFloor(7)).toBeGreaterThanOrEqual(7);
    // Entering floor 25: four boss floors behind (6, 12, 18, 24) plus 15's and 20's chests.
    expect(maxHeartsEnteringFloor(25)).toBeGreaterThanOrEqual(12);
  });

  it("passes a real deep run carrying its boss hearts", () => {
    const run = freshRun({ floor: 24, steps: 900, enemiesDefeated: 120 });
    const flags = validateCheckpoint(
      run,
      25,
      // 5 base + 1 plan heart + 2 post-10 chests + 4 boss hearts
      stats({ steps: 1000, enemiesDefeated: 140, heroMaxHealth: 12, hasSword: true }),
      later
    );
    expect(flags).toEqual([]);
  });

  it("still flags a heart total no boss cadence could explain", () => {
    const run = freshRun({ floor: 6, steps: 200, enemiesDefeated: 20 });
    const flags = validateCheckpoint(
      run,
      7,
      stats({ steps: 260, enemiesDefeated: 25, heroMaxHealth: 30 }),
      later
    );
    expect(flags.some((f) => f.startsWith("hearts"))).toBe(true);
  });

  it("allows a long boss fight's kill count", () => {
    // A Coilwyrm regrows a head every time one is severed and a Quarrymaster's pods keep
    // disgorging, so floor 6 alone can produce far more kills than any ordinary floor.
    expect(maxKillsThroughFloor(6) - maxKillsThroughFloor(5)).toBeGreaterThanOrEqual(40);
    const run = freshRun({ floor: 6, steps: 200, enemiesDefeated: 20 });
    const flags = validateCheckpoint(
      run,
      7,
      stats({ steps: 300, enemiesDefeated: 60, heroMaxHealth: 7 }),
      later
    );
    expect(flags).toEqual([]);
  });
});

describe("submission validation", () => {
  it("passes a clean submission", () => {
    const run = freshRun({ floor: 4, steps: 100, enemiesDefeated: 6 });
    expect(validateSubmission(run, stats({ steps: 120, enemiesDefeated: 8 }))).toEqual([]);
  });

  it("flags double submission", () => {
    const run = freshRun({ submittedAt: T0 });
    const flags = validateSubmission(run, stats());
    expect(flags).toContain("submit:duplicate");
  });

  it("flags final stats below the last verified checkpoint", () => {
    const run = freshRun({ floor: 3, steps: 200, enemiesDefeated: 10 });
    const flags = validateSubmission(run, stats({ steps: 150, enemiesDefeated: 10 }));
    expect(flags).toContain("submit:stats-regressed");
  });

  it("flags kill totals beyond the verified depth", () => {
    const run = freshRun({ floor: 2, steps: 40, enemiesDefeated: 2 });
    const flags = validateSubmission(
      run,
      stats({ steps: 80, enemiesDefeated: maxKillsThroughFloor(2) + 1 })
    );
    expect(flags.some((f) => f.startsWith("submit:kills"))).toBe(true);
  });
});

describe("name sanitization", () => {
  it("strips markup and control characters, caps length", () => {
    expect(sanitizeName("<script>alert(1)</script>")).toBe("scriptalert(1)/script".slice(0, 16));
    expect(sanitizeName("  Torch   Boy  ")).toBe("Torch Boy");
    expect(sanitizeName("a".repeat(40)).length).toBe(16);
    expect(sanitizeName(42)).toBe("");
  });
});
