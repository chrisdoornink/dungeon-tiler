/**
 * Endless boss floors: every 6th floor IS a boss arena.
 *
 * The two things that make this different from the daily boss room and therefore the two
 * things worth pinning down: there is NO entrance to find (the arena is the floor, with no
 * BOSS_ENTRANCE tile and no way back), and the arena's exit is the stairs DOWN rather than
 * an alternate ending — a floor-6 exit must not cash out the run.
 */
import {
  ENDLESS_BOSS_CADENCE,
  ENDLESS_MAX_FLOORS,
  advanceToNextEndlessFloor,
  endlessAllocationForFloor,
  endlessBossKindForFloor,
  isEndlessBossFloor,
  initializeGameStateForEndless,
  rollEndlessItemPlan,
} from "../../lib/map/endless";
import { BOSS_KINDS, rollEndlessBossOrder } from "../../lib/bosses/boss_roster";
import { Enemy } from "../../lib/enemy";
import { Direction, TileSubtype } from "../../lib/map/constants";
import { movePlayer, performUseFood } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { findPlayerPosition } from "../../lib/map/player";

/** Advance a fresh endless run to `floor` the way the game does, one floor at a time. */
function runToFloor(floor: number, seed?: number): GameState {
  let state = initializeGameStateForEndless();
  if (seed != null) state = { ...state, endlessSeed: seed };
  while ((state.currentFloor ?? 1) < floor) {
    state = advanceToNextEndlessFloor(state);
  }
  return state;
}

function countSubtype(state: GameState, sub: TileSubtype): number {
  let n = 0;
  for (const row of state.mapData.subtypes) {
    for (const cell of row) if (cell.includes(sub)) n++;
  }
  return n;
}

describe("endless boss cadence", () => {
  it("puts a boss on every 6th floor and nowhere else", () => {
    expect(ENDLESS_BOSS_CADENCE).toBe(6);
    for (const f of [6, 12, 18, 24, 60]) expect(isEndlessBossFloor(f)).toBe(true);
    for (const f of [1, 2, 3, 4, 5, 7, 11, 13, 17, 59]) {
      expect(isEndlessBossFloor(f)).toBe(false);
    }
  });

  it("never treats floor 0 or the first floor as a boss floor", () => {
    expect(isEndlessBossFloor(0)).toBe(false);
    expect(isEndlessBossFloor(1)).toBe(false);
    expect(endlessBossKindForFloor(1, 1234)).toBeNull();
  });
});

// The Fisher is retired from rotation (softlock: it can run out of both a firing lane and
// snakes to throw, and just retreats forever — see FISHER_RETIRED_START_DATE), so the active
// endless order is BOSS_KINDS minus one. Derived rather than hardcoded so this stays correct
// if the roster changes again.
const ACTIVE_ENDLESS_BOSS_KINDS = BOSS_KINDS.filter((k) => k !== "fisher");

describe("endless boss order", () => {
  it("uses every active boss exactly once before repeating any", () => {
    for (const seed of [1, 7, 99, 4242, 0x7ffffffe]) {
      const order = rollEndlessBossOrder(seed);
      expect(order.length).toBe(ACTIVE_ENDLESS_BOSS_KINDS.length);
      expect(new Set(order).size).toBe(ACTIVE_ENDLESS_BOSS_KINDS.length);
      expect([...order].sort()).toEqual([...ACTIVE_ENDLESS_BOSS_KINDS].sort());
      expect(order).not.toContain("fisher");
    }
  });

  it("recycles that same order rather than reshuffling", () => {
    const seed = 20260731;
    const n = ACTIVE_ENDLESS_BOSS_KINDS.length;
    const firstCycle = Array.from({ length: n }, (_, i) => (i + 1) * ENDLESS_BOSS_CADENCE);
    const secondCycle = firstCycle.map((f) => f + n * ENDLESS_BOSS_CADENCE);
    const first = firstCycle.map((f) => endlessBossKindForFloor(f, seed));
    const second = secondCycle.map((f) => endlessBossKindForFloor(f, seed));
    expect(first).toEqual(rollEndlessBossOrder(seed));
    expect(second).toEqual(first);
  });

  it("is deterministic from the run seed, so a resumed run keeps its order", () => {
    expect(rollEndlessBossOrder(555)).toEqual(rollEndlessBossOrder(555));
    expect(endlessBossKindForFloor(12, 555)).toBe(endlessBossKindForFloor(12, 555));
  });

  it("varies across runs (different seeds do not all get one fixed order)", () => {
    const orders = new Set(
      Array.from({ length: 60 }, (_, i) => rollEndlessBossOrder(i * 7919).join(","))
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("endless boss floor generation", () => {
  it("hands floor 6 over to the arena: a boss stands there and inBossRoom is set", () => {
    const state = runToFloor(ENDLESS_BOSS_CADENCE);
    expect(state.currentFloor).toBe(6);
    expect(state.inBossRoom).toBe(true);
    expect(state.reachedBossRoom).toBe(true);
    expect(state.bossDefeated).toBe(false);
    expect(state.bossKind).toBe(endlessBossKindForFloor(6, state.endlessSeed ?? 0));

    expect((state.enemies ?? []).some((e) => e.kind === state.bossKind)).toBe(true);
    expect(findPlayerPosition(state.mapData)).not.toBeNull();
  });

  it("has NO entrance tile and no way back — the arena IS the floor", () => {
    const state = runToFloor(ENDLESS_BOSS_CADENCE);
    expect(countSubtype(state, TileSubtype.BOSS_ENTRANCE)).toBe(0);
    expect(countSubtype(state, TileSubtype.DARK_PORTAL)).toBe(0);
    expect(state.bossReturn).toBeUndefined();
  });

  it("gives the hero a lit torch to fight by", () => {
    let state = runToFloor(ENDLESS_BOSS_CADENCE - 1);
    state = { ...state, heroTorchLit: false };
    state = advanceToNextEndlessFloor(state);
    expect(state.inBossRoom).toBe(true);
    expect(state.heroTorchLit).toBe(true);
  });

  it("carries the run's vitals and inventory into the fight", () => {
    let state = runToFloor(ENDLESS_BOSS_CADENCE - 1);
    state = {
      ...state,
      hasSword: true,
      hasShield: true,
      heroHealth: 4,
      heroMaxHealth: 7,
      rockCount: 5,
      stats: { ...state.stats, steps: 321 },
    };
    const boss = advanceToNextEndlessFloor(state);
    expect(boss.hasSword).toBe(true);
    expect(boss.hasShield).toBe(true);
    expect(boss.heroMaxHealth).toBe(7);
    expect(boss.heroHealth).toBe(4);
    expect(boss.rockCount).toBe(5);
    expect(boss.stats.steps).toBe(321);
    expect(boss.mode).toBe("endless");
    expect(boss.maxFloors).toBe(ENDLESS_MAX_FLOORS);
  });

  it("clears the boss state again on the floor after the arena", () => {
    const boss = runToFloor(ENDLESS_BOSS_CADENCE);
    const after = advanceToNextEndlessFloor({ ...boss, bossDefeated: true });
    expect(after.currentFloor).toBe(7);
    expect(after.inBossRoom).toBe(false);
    expect(after.bossKind).toBeUndefined();
    expect(after.bossDefeated).toBe(false);
    expect(after.gateGroups).toBeUndefined();
    // The run-level latch survives: this run DID meet a boss.
    expect(after.reachedBossRoom).toBe(true);
    expect(countSubtype(after, TileSubtype.EXIT)).toBeGreaterThan(0);
  });

  it("plans no chests on a boss floor, so nothing is stranded in the arena", () => {
    const plan = rollEndlessItemPlan(() => 0.5);
    for (const f of Object.keys(plan.floorItems).map(Number)) {
      expect(isEndlessBossFloor(f)).toBe(false);
    }
    // Floor 30 is both a post-10 heart floor and a boss floor: the boss's own heart is
    // the reward there, and no chest is generated to be lost.
    expect(endlessAllocationForFloor(30, plan, { rng: () => 0 })).toEqual({
      chests: 0,
      keys: 0,
      chestContents: [],
    });
    expect(endlessAllocationForFloor(6, plan).chests).toBe(0);
  });
});

/**
 * The heart every boss now owes, tested in a bare boss room rather than a real arena: the
 * payout is resolved centrally from a pre-turn snapshot (so melee, rocks and bombs all
 * settle the same way), and pinning it to one arena's geometry or one boss's behavior tree
 * would test those instead of the payout.
 */
describe("boss payout: key AND a heart", () => {
  /** A hero one step from a 1-HP boss inside a boss room. One swing kills it. */
  function duel(over: Partial<GameState> = {}): GameState {
    const size = 5;
    const tiles = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 1)
    );
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) tiles[y][x] = 0;
    const subtypes: number[][][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => [] as number[])
    );
    subtypes[2][1].push(TileSubtype.PLAYER);
    const boss = new Enemy({ y: 2, x: 2 });
    boss.kind = "quarrymaster";
    boss.health = 1;
    return {
      hasKey: false,
      hasExitKey: false,
      hasSword: true,
      mapData: { tiles, subtypes },
      showFullMap: true,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [boss],
      npcs: [],
      heroHealth: 2,
      heroMaxHealth: 5,
      heroAttack: 1,
      inBossRoom: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      ...over,
    } as GameState;
  }

  it("adds a heart to the max and refills health, in endless", () => {
    const after = movePlayer(duel({ mode: "endless" }), Direction.RIGHT);
    expect(after.bossDefeated).toBe(true);
    expect(after.heroMaxHealth).toBe(6);
    expect(after.heroHealth).toBe(6);
    expect(after.stats.bossesDefeated).toBe(1);
  });

  it("does the same in the daily's secret boss room", () => {
    const after = movePlayer(duel({ mode: "daily" }), Direction.RIGHT);
    expect(after.bossDefeated).toBe(true);
    expect(after.heroMaxHealth).toBe(6);
    expect(after.heroHealth).toBe(6);
    expect(after.stats.bossesDefeated).toBe(1);
  });

  it("still drops the exit key alongside the heart", () => {
    const after = movePlayer(duel({ mode: "endless" }), Direction.RIGHT);
    const keyTile = after.mapData.subtypes
      .flatMap((row, y) => row.map((cell, x) => ({ y, x, cell })))
      .find(({ cell }) => cell.includes(TileSubtype.EXITKEY));
    expect(keyTile).toBeDefined();
  });

  it("pays out once per boss, not once per turn spent in the room", () => {
    let after = movePlayer(duel({ mode: "endless" }), Direction.RIGHT);
    const maxAfterKill = after.heroMaxHealth;
    for (let i = 0; i < 3; i++) after = movePlayer(after, Direction.RIGHT);
    expect(after.heroMaxHealth).toBe(maxAfterKill);
    expect(after.stats.bossesDefeated).toBe(1);
  });

  it("stacks across an endless run: bossDefeated resets per floor, the count does not", () => {
    // Floor 6's kill, then floor 12's — the arena's own latch clears between them, which is
    // what lets the second boss pay out at all.
    const first = movePlayer(duel({ mode: "endless", currentFloor: 6 }), Direction.RIGHT);
    expect(first.stats.bossesDefeated).toBe(1);

    const second = movePlayer(
      duel({
        mode: "endless",
        currentFloor: 12,
        bossDefeated: false,
        heroMaxHealth: first.heroMaxHealth,
        heroHealth: 1,
        stats: first.stats,
      }),
      Direction.RIGHT
    );
    expect(second.heroMaxHealth).toBe((first.heroMaxHealth ?? 5) + 1);
    expect(second.heroHealth).toBe(second.heroMaxHealth);
    expect(second.stats.bossesDefeated).toBe(2);
  });

  it("pays out on an item turn too, when a bomb's fuse lands the killing blow", () => {
    // Using an item spends a turn, and a turn is all an armed bomb needs. These paths ran
    // the enemy tick and the fuse without settling the boss, so a fuse kill paid nothing.
    const state = duel({ mode: "endless", foodCount: 1 });
    state.mapData.subtypes[2][2].push(TileSubtype.BOMB_LIVE);
    const after = performUseFood(state);
    expect((after.enemies ?? []).some((e) => e.kind === "quarrymaster")).toBe(false);
    expect(after.bossDefeated).toBe(true);
    expect(after.stats.bossesDefeated).toBe(1);
  });
});

/**
 * The floor under the per-boss payouts. Those are precise about which tile the drop lands on
 * and which turn it lands, and precision is what leaked: a Coilwyrm killed a turn before its
 * last body segment died skipped the payout entirely, leaving a player sealed in the arena
 * with the boss dead, no key, and nothing left to hit. Enforced from the other end here, where
 * it does not matter which kill path fired.
 */
describe("a cleared boss arena is never a dead end", () => {
  /** An arena the hero is sealed inside: an EXIT that wants a key, and nothing left alive. */
  function clearedArena(over: Partial<GameState> = {}): GameState {
    const size = 5;
    const tiles = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 1)
    );
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) tiles[y][x] = 0;
    const subtypes: number[][][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => [] as number[])
    );
    subtypes[2][1].push(TileSubtype.PLAYER);
    // Off the hero's path: these tests step RIGHT into (2,2), and stepping ONTO the exit is
    // its own case below.
    subtypes[1][3].push(TileSubtype.EXIT);
    return {
      hasKey: false,
      hasExitKey: false,
      hasSword: true,
      mapData: { tiles, subtypes },
      showFullMap: true,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      npcs: [],
      heroHealth: 2,
      heroMaxHealth: 5,
      heroAttack: 1,
      inBossRoom: true,
      bossKind: "coilwyrm",
      mode: "endless",
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      ...over,
    } as GameState;
  }

  it("hands over the key when the boss is gone and none was ever dropped", () => {
    const after = movePlayer(clearedArena(), Direction.RIGHT);
    expect(after.hasExitKey).toBe(true);
    // The rest of the missed payout comes with it.
    expect(after.bossDefeated).toBe(true);
    expect(after.heroMaxHealth).toBe(6);
  });

  it("leaves a dropped key alone rather than handing out a second one", () => {
    const state = clearedArena();
    state.mapData.subtypes[1][1].push(TileSubtype.EXITKEY);
    const after = movePlayer(state, Direction.RIGHT);
    expect(after.hasExitKey).toBe(false); // still on the floor, to be walked onto
    expect(after.heroMaxHealth).toBe(5); // and no phantom heart
  });

  it("keeps quiet while any part of the boss is still standing", () => {
    // The Coilwyrm case specifically: a headless body is still the boss.
    const segment = new Enemy({ y: 2, x: 3 });
    segment.kind = "coilwyrm-coil";
    const after = movePlayer(clearedArena({ enemies: [segment] }), Direction.RIGHT);
    expect(after.hasExitKey).toBe(false);
    expect(after.bossDefeated).toBeFalsy();
  });

  it("covers a payout that ran but whose key went nowhere", () => {
    // The other half of the leak: the branch fires, banks the kill, and drops the key on a
    // tile that is not there (a death recorded off-map). bossDefeated is latched, so the
    // per-boss branch will never run again — without the net the arena is just as dead.
    const after = movePlayer(clearedArena({ bossDefeated: true }), Direction.RIGHT);
    expect(after.hasExitKey).toBe(true);
    expect(after.heroMaxHealth).toBe(5); // already paid: no second heart
  });

  it("does not fire outside a boss arena, where a locked exit is the actual puzzle", () => {
    const after = movePlayer(clearedArena({ inBossRoom: false }), Direction.RIGHT);
    expect(after.hasExitKey).toBe(false);
  });

  it("stays out of the way once the key has been spent on the exit", () => {
    // Stepping onto the arena EXIT consumes the key; the net must not mint a replacement
    // on the way out, in the daily (win) or in endless (floor transition).
    const state = clearedArena({ mode: "daily", hasExitKey: true, bossDefeated: true });
    state.mapData.subtypes[2][2].push(TileSubtype.EXIT); // one step RIGHT, onto the exit
    const won = movePlayer(state, Direction.RIGHT);
    expect(won.win).toBe(true);
    expect(won.hasExitKey).toBe(false);
  });
});

describe("endless boss arena exit", () => {
  it("advances the floor instead of ending the run", () => {
    const state = runToFloor(ENDLESS_BOSS_CADENCE);
    const exited = takeArenaExit(state);
    expect(exited.win).toBe(false);
    expect(exited.needsFloorTransition).toBe(true);
    expect(exited.hasExitKey).toBe(false);
  });

  it("still ends the run when the arena is the daily's secret room", () => {
    const state = runToFloor(ENDLESS_BOSS_CADENCE);
    // Same arena, same tile — only the mode differs. In the daily the boss room is hidden
    // off floor 3 and walking out of it wins outright.
    const daily = { ...state, mode: "daily" as const, maxFloors: 3, currentFloor: 3 };
    const exited = takeArenaExit(daily);
    expect(exited.win).toBe(true);
    expect(exited.needsFloorTransition).toBeFalsy();
  });
});

/** Walk the hero onto the arena's EXIT with the boss's key in hand. */
function takeArenaExit(state: GameState): GameState {
  const pos = findPlayerPosition(state.mapData);
  expect(pos).not.toBeNull();
  const [py, px] = pos!;
  const subtypes = state.mapData.subtypes.map((row) => row.map((cell) => cell.slice()));
  // Clear any exit the arena placed, then put one directly below the hero so the step is
  // a single unambiguous move regardless of which boss's arena this is.
  for (const row of subtypes) {
    for (let x = 0; x < row.length; x++) {
      const i = row[x].indexOf(TileSubtype.EXIT);
      if (i >= 0) row[x].splice(i, 1);
    }
  }
  const tiles = state.mapData.tiles.map((row) => row.slice());
  const ty = py + 1;
  tiles[ty][px] = 0; // FLOOR
  subtypes[ty][px] = [TileSubtype.EXIT];
  return movePlayer(
    {
      ...state,
      mapData: { ...state.mapData, tiles, subtypes },
      hasExitKey: true,
      // Nothing in the way: this test is about what the exit MEANS, not the fight.
      enemies: [],
    },
    2 // Direction.DOWN
  );
}
