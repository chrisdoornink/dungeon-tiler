import { TileSubtype, Direction } from "../../lib/map";
import {
  movePlayer,
  initializeGameStateForMultiTier,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import {
  WISP_DEFAULT_LIFESPAN,
  WISP_MAX_COMPANIONS,
  WISP_PITY_MAX_DIST,
  WISP_PITY_MIN_DIST,
  WISP_RESTORE_HEARTS,
  WISP_STANDARD_CONFIG,
  WISP_TRAIL_LENGTH,
  advanceWispTurn,
  stampWispPots,
  wispDeathSave,
  type WildWisp,
} from "../../lib/map/wisp";
import { findPlayerPosition } from "../../lib/map/player";

/**
 * The wisp life-regen prototype. See lib/map/wisp.ts.
 *
 * The invariants each with a plausible wrong answer:
 *  - the whole system is dormant (state untouched) without wispConfig or wisps
 *  - stepping ONTO a wisp catches it — it never gets a flee step first
 *  - torch state inverts the drift: lit = shy, dark = drawn to the hero
 *  - wild wisps burn one move per hero step and gutter out at zero
 *  - the death save consumes exactly one companion, restores hearts, clears the
 *    death cause, and tugs the hero OFF lethal ground onto a safe recent tile
 */

function openRoom(size: number): {
  tiles: number[][];
  subtypes: number[][][];
} {
  const tiles = Array.from({ length: size }, () =>
    new Array(size).fill(0)
  );
  const subtypes: number[][][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );
  return { tiles, subtypes };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  const { tiles, subtypes } = openRoom(12);
  subtypes[5][1] = [TileSubtype.PLAYER];
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: { tiles, subtypes },
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    enemies: [],
    npcs: [],
    rockCount: 0,
    runeCount: 0,
    bombCount: 0,
    currentFloor: 1,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

function wisp(y: number, x: number, movesLeft = WISP_DEFAULT_LIFESPAN): WildWisp {
  return { id: 1, y, x, movesLeft };
}

describe("dormancy", () => {
  it("adds no wisp fields to a run that never touches the feature", () => {
    const after = movePlayer(baseState(), Direction.RIGHT);
    expect(after.wisps).toBeUndefined();
    expect(after.wispCompanions).toBeUndefined();
    expect(after.heroTrail).toBeUndefined();
    expect(after.wispPos).toBeUndefined();
  });
});

describe("catching", () => {
  it("catches a wisp by stepping onto its tile — no flee step first", () => {
    const state = baseState({
      wispConfig: {},
      wisps: [wisp(5, 2)], // directly east of the hero at (5,1)
    });
    const after = movePlayer(state, Direction.RIGHT);
    expect(after.wispCompanions).toBe(1);
    expect(after.wisps).toBeUndefined();
  });

  it("a dark-drawn wisp that drifts onto the hero is also caught", () => {
    const state = baseState({
      heroTorchLit: false,
      wispConfig: {},
      // Two east of where the hero LANDS (5,2): after the step it closes to (5,3)?
      // No — attraction moves it a full diagonal-capable step toward the hero, so
      // from (5,3) it lands exactly on (5,2).
      wisps: [wisp(5, 3)],
    });
    const after = movePlayer(state, Direction.RIGHT);
    expect(findPlayerPosition(after.mapData)).toEqual([5, 2]);
    expect(after.wispCompanions).toBe(1);
    expect(after.wisps).toBeUndefined();
  });

  it("caps companions at WISP_MAX_COMPANIONS", () => {
    const state = baseState({
      wispConfig: {},
      wispCompanions: WISP_MAX_COMPANIONS,
      wisps: [wisp(5, 2)],
    });
    const after = movePlayer(state, Direction.RIGHT);
    expect(after.wispCompanions).toBe(WISP_MAX_COMPANIONS);
    expect(after.wisps).toHaveLength(1); // still wild, though it may have drifted
  });
});

describe("drift", () => {
  it("a lit torch spooks an adjacent wisp into opening distance", () => {
    const state = baseState({
      wispConfig: {},
      wisps: [wisp(5, 3)], // will be adjacent to the hero's landing tile (5,2)
    });
    const after = movePlayer(state, Direction.RIGHT);
    const w = after.wisps?.[0];
    expect(w).toBeDefined();
    const d = Math.max(Math.abs(w!.y - 5), Math.abs(w!.x - 2));
    expect(d).toBeGreaterThan(1);
  });

  it("in the dark, a far wisp closes distance every step", () => {
    const state = baseState({
      heroTorchLit: false,
      wispConfig: {},
      wisps: [wisp(5, 8)],
    });
    const after = movePlayer(state, Direction.RIGHT); // hero lands (5,2)
    expect(after.wisps?.[0]).toMatchObject({ y: 5, x: 7 });
  });

  it("burns one move per hero step and gutters out at zero", () => {
    let cur = baseState({
      heroTorchLit: false, // deterministic drift (attraction)
      wispConfig: {},
      wisps: [wisp(1, 10, 2)],
    });
    cur = movePlayer(cur, Direction.RIGHT);
    expect(cur.wisps?.[0]?.movesLeft).toBe(1);
    cur = movePlayer(cur, Direction.RIGHT);
    expect(cur.wisps).toBeUndefined();
  });

  it("does not burn a move on a wall bump", () => {
    const state = baseState({
      heroTorchLit: false,
      wispConfig: {},
      wisps: [wisp(1, 10, 2)],
    });
    const bumped = movePlayer(state, Direction.LEFT); // (5,1) -> map edge... (5,0) is floor
    // (5,0) is actually walkable in an open room, so bump into the edge instead:
    const cornered = movePlayer(bumped, Direction.LEFT);
    expect(cornered.stats.steps).toBe(1);
    expect(cornered.wisps?.[0]?.movesLeft).toBe(1);
  });
});

describe("spawning", () => {
  it("a walked-into pot releases a wisp beside the pot, never under the hero", () => {
    const state = baseState({ wispConfig: { potChance: 1 } });
    state.mapData.subtypes[5][2] = [TileSubtype.POT];
    const after = movePlayer(state, Direction.RIGHT); // smash by walking in
    expect(after.wisps).toHaveLength(1);
    const w = after.wisps![0];
    const hero = findPlayerPosition(after.mapData)!;
    expect([w.y, w.x]).not.toEqual([hero[0], hero[1]]);
    expect(Math.max(Math.abs(w.y - 5), Math.abs(w.x - 2))).toBeLessThanOrEqual(1);
  });

  it("potChance=0 releases nothing", () => {
    const state = baseState({ wispConfig: { potChance: 0 } });
    state.mapData.subtypes[5][2] = [TileSubtype.POT];
    const after = movePlayer(state, Direction.RIGHT);
    expect(after.wisps).toBeUndefined();
  });

  it("a defeated enemy leaves a wisp near its death tile", () => {
    // Driven through advanceWispTurn directly: a movePlayer bump-kill depends on
    // the goblin's AI holding its tile through the enemy turn, which is
    // rng-driven. recentDeaths is the engine's own per-tick kill record, so
    // feeding it is exactly what the movePlayer wrapper does.
    const before = baseState({ wispConfig: { enemyDropChance: 1 } });
    const after = baseState({
      wispConfig: { enemyDropChance: 1 },
      recentDeaths: [[5, 8]],
    });
    const result = advanceWispTurn(before, after, () => 0.3);
    expect(result.wisps).toHaveLength(1);
    const w = result.wisps![0];
    expect(Math.max(Math.abs(w.y - 5), Math.abs(w.x - 8))).toBeLessThanOrEqual(1);
  });

  it("a stamped wisp pot is guaranteed even at potChance 0, and consumes its marker", () => {
    const state = baseState({ wispConfig: { potChance: 0 } });
    state.mapData.subtypes[5][2] = [TileSubtype.POT, TileSubtype.WISP];
    const after = movePlayer(state, Direction.RIGHT); // smash by walking in
    expect(after.wisps).toHaveLength(1);
    expect(after.mapData.subtypes[5][2]).not.toContain(TileSubtype.WISP);
  });

  it("falling to exactly 1 heart draws a pity wisp out at the edge of view", () => {
    const before = baseState({ heroHealth: 2, wispConfig: { pity: true } });
    const after = baseState({ heroHealth: 1, wispConfig: { pity: true } });
    const result = advanceWispTurn(before, after, () => 0.85);
    expect(result.wisps).toHaveLength(1);
    const w = result.wisps![0];
    const d = Math.max(Math.abs(w.y - 5), Math.abs(w.x - 1));
    expect(d).toBeGreaterThanOrEqual(WISP_PITY_MIN_DIST);
    expect(d).toBeLessThanOrEqual(WISP_PITY_MAX_DIST);
    expect(result.wispPityFloors).toEqual([1]);
  });

  it("pity fires once per floor, and again on the next floor", () => {
    // Floor 1's latch is set: the same dip spawns nothing.
    const before = baseState({ heroHealth: 2, wispConfig: { pity: true } });
    const again = baseState({
      heroHealth: 1,
      wispConfig: { pity: true },
      wispPityFloors: [1],
    });
    expect(advanceWispTurn(before, again, () => 0.85).wisps).toBeUndefined();

    // The same dip on floor 2 fires and extends the latch.
    const before2 = baseState({
      heroHealth: 2,
      wispConfig: { pity: true },
      currentFloor: 2,
    });
    const after2 = baseState({
      heroHealth: 1,
      wispConfig: { pity: true },
      currentFloor: 2,
      wispPityFloors: [1],
    });
    const result2 = advanceWispTurn(before2, after2, () => 0.85);
    expect(result2.wisps).toHaveLength(1);
    expect(result2.wispPityFloors).toEqual([1, 2]);
  });
});

describe("stampWispPots", () => {
  it("stamps only plain pots, and never double-stamps", () => {
    const state = baseState();
    state.mapData.subtypes[2][2] = [TileSubtype.POT];
    state.mapData.subtypes[2][3] = [TileSubtype.POT, TileSubtype.SNAKE];
    state.mapData.subtypes[2][4] = [TileSubtype.POT, TileSubtype.RUNE];
    expect(stampWispPots(state.mapData, 0.03, () => 0)).toBe(1);
    expect(state.mapData.subtypes[2][2]).toContain(TileSubtype.WISP);
    expect(state.mapData.subtypes[2][3]).not.toContain(TileSubtype.WISP);
    expect(state.mapData.subtypes[2][4]).not.toContain(TileSubtype.WISP);
    expect(stampWispPots(state.mapData, 0.03, () => 0)).toBe(0);
  });

  it("stamps nothing when the roll misses", () => {
    const state = baseState();
    state.mapData.subtypes[2][2] = [TileSubtype.POT];
    expect(stampWispPots(state.mapData, 0.03, () => 0.5)).toBe(0);
    expect(state.mapData.subtypes[2][2]).not.toContain(TileSubtype.WISP);
  });
});

describe("real-mode wiring", () => {
  it("daily runs carry the standard wisp config (cap 1, 2% drops, pity on)", () => {
    const s = initializeGameStateForMultiTier(1, {});
    expect(s.wispConfig).toEqual(WISP_STANDARD_CONFIG);
    expect(WISP_STANDARD_CONFIG.maxCompanions).toBe(1);
    expect(WISP_STANDARD_CONFIG.potChance).toBeUndefined(); // pots are baked, not rolled
  });

  it("the real-mode cap holds carrying at one", () => {
    const state = baseState({
      wispConfig: { maxCompanions: 1 },
      wispCompanions: 1,
      wisps: [wisp(5, 2)],
    });
    const after = movePlayer(state, Direction.RIGHT);
    expect(after.wispCompanions).toBe(1);
    expect(after.wisps).toHaveLength(1); // still wild
  });
});

describe("the trail and the perch", () => {
  it("records vacated tiles newest-last, capped at WISP_TRAIL_LENGTH", () => {
    let cur = baseState({ wispConfig: {}, wispCompanions: 1 });
    for (let i = 0; i < 5; i++) cur = movePlayer(cur, Direction.RIGHT);
    expect(cur.heroTrail).toEqual([
      [5, 3],
      [5, 4],
      [5, 5],
    ]);
    expect(cur.heroTrail).toHaveLength(WISP_TRAIL_LENGTH);
  });

  it("perches the companion on a trail tile", () => {
    let cur = baseState({ wispConfig: {}, wispCompanions: 1 });
    for (let i = 0; i < 4; i++) cur = movePlayer(cur, Direction.RIGHT);
    expect(cur.wispPos).toBeDefined();
    expect(cur.heroTrail).toContainEqual(cur.wispPos);
  });
});

describe("the death save", () => {
  it("returns null for a live hero or an empty-handed dead one", () => {
    expect(wispDeathSave(baseState({ wispCompanions: 1 }))).toBeNull();
    expect(wispDeathSave(baseState({ heroHealth: 0 }))).toBeNull();
  });

  it("spends one companion, restores hearts, clears the cause", () => {
    const state = baseState({
      heroHealth: 0,
      heroMaxHealth: 8,
      wispCompanions: 2,
      deathCause: { type: "enemy", enemyKind: "goblin" },
    });
    const saved = wispDeathSave(state)!;
    expect(saved.heroHealth).toBe(WISP_RESTORE_HEARTS);
    expect(saved.wispCompanions).toBe(1);
    expect(saved.deathCause).toBeUndefined();
  });

  it("clamps the restore to a small max health", () => {
    const saved = wispDeathSave(
      baseState({ heroHealth: 0, heroMaxHealth: 2, wispCompanions: 1 })
    )!;
    expect(saved.heroHealth).toBe(2);
  });

  it("tugs the hero off lava onto the wisp's perch", () => {
    const state = baseState({
      heroHealth: 0,
      wispCompanions: 1,
      deathCause: { type: "lava" },
      wispPos: [5, 3],
      heroTrail: [[5, 3]],
    });
    // Hero stands at (5,1); make it lava (death by stepping in).
    state.mapData.subtypes[5][1] = [TileSubtype.LAVA, TileSubtype.PLAYER];
    const saved = wispDeathSave(state)!;
    expect(findPlayerPosition(saved.mapData)).toEqual([5, 3]);
    expect(
      saved.mapData.subtypes[5][1].includes(TileSubtype.PLAYER)
    ).toBe(false);
    expect(saved.heroHealth).toBe(WISP_RESTORE_HEARTS);
  });

  it("revives in place when no safe perch exists", () => {
    const state = baseState({
      heroHealth: 0,
      wispCompanions: 1,
      // Trail tile is itself lava — unusable as a landing.
      wispPos: [5, 3],
      heroTrail: [[5, 3]],
    });
    state.mapData.subtypes[5][3] = [TileSubtype.LAVA];
    const saved = wispDeathSave(state)!;
    expect(findPlayerPosition(saved.mapData)).toEqual([5, 1]);
    expect(saved.heroHealth).toBe(WISP_RESTORE_HEARTS);
  });
});
