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
import { movePlayer } from "../../lib/map/game-state";
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

describe("endless boss order", () => {
  it("uses every boss exactly once before repeating any", () => {
    for (const seed of [1, 7, 99, 4242, 0x7ffffffe]) {
      const order = rollEndlessBossOrder(seed);
      expect(order.length).toBe(BOSS_KINDS.length);
      expect(new Set(order).size).toBe(BOSS_KINDS.length);
      expect([...order].sort()).toEqual([...BOSS_KINDS].sort());
    }
  });

  it("recycles that same order rather than reshuffling", () => {
    const seed = 20260731;
    const first = [6, 12, 18, 24].map((f) => endlessBossKindForFloor(f, seed));
    const second = [30, 36, 42, 48].map((f) => endlessBossKindForFloor(f, seed));
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
