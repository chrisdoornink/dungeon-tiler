import { Enemy } from "../../lib/enemy";
import { TileSubtype, Direction } from "../../lib/map";
import { movePlayer, createCheckpointSnapshot } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import {
  REWIND_DEATH_DEPTH,
  REWIND_MAX_DEPTH,
  recordRewindStep,
  rewindContext,
  rewindDepthAvailable,
  rewindStateBy,
} from "../../lib/map/rewind";
import { findPlayerPosition } from "../../lib/map/player";

/**
 * The Amber Moth's rewind. See .claude/features/amber-moth-rewind/index.md.
 *
 * The load-bearing invariants, all of which had a plausible wrong answer:
 *  - the buffer only records while a charge is held, and only on real steps
 *  - a rewind never refunds its own charge (else it is infinitely reusable)
 *  - cumulative stats do NOT rewind (lib/endless_validation.ts flags regressions)
 *  - history never crosses a floor/realm boundary
 *  - checkpoint snapshots never nest a rewind history inside themselves
 */

/** A wide open corridor so the hero can walk many steps in a straight line. */
function corridor(width: number): { tiles: number[][]; subtypes: number[][][] } {
  const tiles = [
    new Array(width).fill(0),
    new Array(width).fill(0),
    new Array(width).fill(0),
  ];
  const subtypes: number[][][] = [
    Array.from({ length: width }, () => [] as number[]),
    Array.from({ length: width }, () => [] as number[]),
    Array.from({ length: width }, () => [] as number[]),
  ];
  subtypes[1][0] = [TileSubtype.PLAYER];
  return { tiles, subtypes };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  const { tiles, subtypes } = corridor(14);
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
    enemies: [],
    npcs: [],
    rockCount: 0,
    runeCount: 0,
    bombCount: 0,
    currentFloor: 2,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

/** Walk `count` steps right, returning the final state. */
function walkRight(state: GameState, count: number): GameState {
  let cur = state;
  for (let i = 0; i < count; i++) cur = movePlayer(cur, Direction.RIGHT);
  return cur;
}

describe("rewind history recording", () => {
  it("records nothing until the hero is carrying a charge", () => {
    const after = walkRight(baseState({ rewindCharges: 0 }), 4);
    expect(after.stats.steps).toBe(4);
    expect(after.rewindHistory ?? []).toHaveLength(0);
    expect(rewindDepthAvailable(after)).toBe(0);
  });

  it("records one snapshot per step once a charge is held", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), 4);
    expect(after.rewindHistory).toHaveLength(4);
    expect(rewindDepthAvailable(after)).toBe(4);
  });

  it("caps the buffer at REWIND_MAX_DEPTH, dropping the oldest", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), REWIND_MAX_DEPTH + 3);
    expect(after.rewindHistory).toHaveLength(REWIND_MAX_DEPTH);
    expect(rewindDepthAvailable(after)).toBe(REWIND_MAX_DEPTH);
    // The oldest surviving snapshot is 10 steps back, not step 0.
    expect(after.rewindHistory?.[0]?.steps).toBe(3);
  });

  it("does not record a wall bump — only real steps", () => {
    // Hero starts at (1,0); walking LEFT is into the map edge.
    const bumped = movePlayer(baseState({ rewindCharges: 1 }), Direction.LEFT);
    expect(bumped.stats.steps).toBe(0);
    expect(bumped.rewindHistory ?? []).toHaveLength(0);
  });

  it("clears history when the context changes (floor / realm boundary)", () => {
    const onFloor2 = walkRight(baseState({ rewindCharges: 1 }), 3);
    expect(rewindDepthAvailable(onFloor2)).toBe(3);

    // Simulate arriving on the next floor with the same buffer still attached.
    const onFloor3: GameState = { ...onFloor2, currentFloor: 3 };
    expect(rewindContext(onFloor3)).not.toBe(rewindContext(onFloor2));
    // Stale snapshots are unreachable...
    expect(rewindDepthAvailable(onFloor3)).toBe(0);
    // ...and the next recorded step drops them rather than mixing contexts.
    const stepped = walkRight(onFloor3, 1);
    expect(stepped.rewindHistory).toHaveLength(1);
    expect(rewindDepthAvailable(stepped)).toBe(1);
  });

  it("treats the pink realm as its own context", () => {
    const dungeon = baseState({ rewindCharges: 1 });
    const realm: GameState = { ...dungeon, inPinkRealm: true };
    expect(rewindContext(realm)).not.toBe(rewindContext(dungeon));
  });

  it("keeps nothing from a step that itself crossed a boundary", () => {
    // Rewinding across a one-way progress gate would let a player re-farm the floor they
    // just left, so the pre-warp world is dropped rather than banked.
    const before = walkRight(baseState({ rewindCharges: 1 }), 4);
    const warped: GameState = {
      ...before,
      currentFloor: 3,
      stats: { ...before.stats, steps: before.stats.steps + 1 },
    };
    expect(recordRewindStep(before, warped)).toEqual([]);
  });

  it("returns the existing history object unchanged when it does not record", () => {
    // movePlayer relies on referential equality to skip cloning the state.
    const state = baseState({ rewindCharges: 0 });
    expect(recordRewindStep(state, state)).toBe(state.rewindHistory);
  });
});

describe("rewinding", () => {
  it("puts the hero back where they stood N steps ago", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), 6);
    expect(findPlayerPosition(after.mapData)).toEqual([1, 6]);

    const back = rewindStateBy(after, 4);
    expect(back).not.toBeNull();
    expect(findPlayerPosition(back!.mapData)).toEqual([1, 2]);
  });

  it("restores hero health — the whole point of the death save", () => {
    const start = baseState({ rewindCharges: 1 });
    const healthy = walkRight(start, 5);
    // Take a beating after the walk.
    const hurt: GameState = { ...healthy, heroHealth: 1 };

    const back = rewindStateBy(hurt, 3);
    expect(back!.heroHealth).toBe(5);
  });

  it("clears deathCause", () => {
    const walked = walkRight(baseState({ rewindCharges: 1 }), 5);
    const dead: GameState = {
      ...walked,
      heroHealth: 0,
      deathCause: { type: "enemy", enemyKind: "fire-goblin" },
    };

    const back = rewindStateBy(dead, REWIND_DEATH_DEPTH);
    expect(back!.heroHealth).toBeGreaterThan(0);
    expect(back!.deathCause).toBeUndefined();
  });

  it("spends the charge and never refunds it from the snapshot", () => {
    // The snapshots were all taken while the charge was still unspent, so a naive
    // wholesale restore would hand it straight back and make the charm infinite.
    const after = walkRight(baseState({ rewindCharges: 1 }), 6);
    expect(after.rewindHistory?.[0]?.state.rewindCharges).toBe(1);

    const back = rewindStateBy(after, 3);
    expect(back!.rewindCharges).toBe(0);
    // And with no charge left, a second rewind can't be paid for by the caller.
    expect(back!.rewindCharges).toBeLessThan(1);
  });

  it("does not rewind cumulative stats (endless_validation flags regressions)", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), 8);
    const busy: GameState = {
      ...after,
      stats: { ...after.stats, enemiesDefeated: 3, damageDealt: 9, damageTaken: 4 },
    };

    const back = rewindStateBy(busy, 5);
    expect(back!.stats.steps).toBe(busy.stats.steps);
    expect(back!.stats.enemiesDefeated).toBe(3);
    expect(back!.stats.damageDealt).toBe(9);
    expect(back!.stats.damageTaken).toBe(4);
  });

  it("keeps run-level achievement latches and the last checkpoint", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), 5);
    const decorated: GameState = {
      ...after,
      reachedPinkRealm: true,
      reachedOutsideWorld: true,
      bossDefeated: true,
      lastCheckpoint: createCheckpointSnapshot(after),
    };

    const back = rewindStateBy(decorated, 3);
    expect(back!.reachedPinkRealm).toBe(true);
    expect(back!.reachedOutsideWorld).toBe(true);
    expect(back!.bossDefeated).toBe(true);
    expect(back!.lastCheckpoint).toBeDefined();
  });

  it("brings enemies back as live Enemy instances at their old positions", () => {
    const goblin = new Enemy({ y: 0, x: 9 });
    goblin.kind = "fire-goblin";
    const start = baseState({ rewindCharges: 1, enemies: [goblin] });

    const after = walkRight(start, 4);
    // Move the enemy well away from wherever the turn loop left it.
    const live = after.enemies!;
    live[0].y = 2;
    live[0].x = 13;

    const restored = rewindStateBy(after, 3)!.enemies!;
    expect(restored).toHaveLength(1);
    // A rehydrated enemy must be a real instance, not plain JSON — the turn loop reads
    // it through the `kind` accessor, which only exists on the prototype.
    expect(restored[0]).toBeInstanceOf(Enemy);
    expect(Object.getPrototypeOf(restored[0])).toBe(Enemy.prototype);
    expect(restored[0].kind).toBe("fire-goblin");
    expect([restored[0].y, restored[0].x]).not.toEqual([2, 13]);
  });

  it("truncates the future but keeps history behind the landing point", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), 8);
    const back = rewindStateBy(after, 3)!;
    // Landed 3 back from 8 snapshots, so 5 older moments remain reachable.
    expect(back.rewindHistory).toHaveLength(5);
    expect(rewindDepthAvailable(back)).toBe(5);
  });

  it("clamps to what history holds instead of overshooting", () => {
    // Dying on step 3 of a floor: the death rewind wants 5, only 3 exist.
    const after = walkRight(baseState({ rewindCharges: 1 }), 3);
    const back = rewindStateBy(after, REWIND_DEATH_DEPTH);
    expect(back).not.toBeNull();
    // Clamped to the oldest snapshot: back at the starting tile.
    expect(findPlayerPosition(back!.mapData)).toEqual([1, 0]);
    expect(back!.rewindCharges).toBe(0);
  });

  it("returns null when there is nothing to rewind into", () => {
    const fresh = baseState({ rewindCharges: 1 });
    expect(rewindStateBy(fresh, 5)).toBeNull();
    // Zero/negative depth is a caller bug, not a free rewind.
    expect(rewindStateBy(walkRight(fresh, 4), 0)).toBeNull();
  });

  it("can preview without spending the charge", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), 6);
    const preview = rewindStateBy(after, 4, { spendCharge: false })!;
    expect(preview.rewindCharges).toBe(1);
    expect(findPlayerPosition(preview.mapData)).toEqual([1, 2]);
  });

  it("survives a round trip through JSON (the save format)", () => {
    // rewindHistory rides along in localStorage; a save/reload mid-floor must not
    // break the buffer.
    const after = walkRight(baseState({ rewindCharges: 1 }), 5);
    const reloaded = JSON.parse(JSON.stringify(after)) as GameState;
    expect(rewindDepthAvailable(reloaded)).toBe(5);
    const back = rewindStateBy(reloaded, 3)!;
    expect(findPlayerPosition(back.mapData)).toEqual([1, 2]);
  });
});

describe("checkpoint interaction", () => {
  it("never nests a rewind history inside a checkpoint snapshot", () => {
    // Nesting snapshots-within-snapshots grows state exponentially, and the pair
    // localStorage-round-trips together.
    const after = walkRight(baseState({ rewindCharges: 1 }), 6);
    expect(after.rewindHistory).toHaveLength(6);

    const snapshot = createCheckpointSnapshot(after);
    expect(
      (snapshot as unknown as Record<string, unknown>).rewindHistory
    ).toBeUndefined();
  });

  it("keeps recorded snapshots free of nested histories", () => {
    const after = walkRight(baseState({ rewindCharges: 1 }), 4);
    for (const snap of after.rewindHistory ?? []) {
      expect(
        (snap.state as unknown as Record<string, unknown>).rewindHistory
      ).toBeUndefined();
    }
  });
});

describe("picking the charm up", () => {
  it("grants a charge and starts recording from that moment on", () => {
    const { tiles, subtypes } = corridor(8);
    // An opened chest's loot sitting loose on the tile to the hero's right.
    subtypes[1][1] = [TileSubtype.OPEN_CHEST, TileSubtype.AMBER_MOTH];

    const before = baseState({ mapData: { tiles, subtypes } });
    expect(before.rewindCharges ?? 0).toBe(0);

    const picked = movePlayer(before, Direction.RIGHT);
    expect(picked.rewindCharges).toBe(1);
    expect(picked.stats.chestItemsCollected).toContain("amber_moth");
    // The loot tag is consumed.
    expect(
      picked.mapData.subtypes[1][1].includes(TileSubtype.AMBER_MOTH)
    ).toBe(false);

    // Nothing to rewind into yet — the charm cannot wind back past its own pickup.
    expect(rewindDepthAvailable(picked)).toBe(0);
    expect(rewindDepthAvailable(walkRight(picked, 2))).toBe(2);
  });

  it("cannot be farmed by rewinding onto its own pickup", () => {
    // Regression: recording gated on the POST-move charge count meant the pickup step
    // itself got recorded, and that snapshot still has the charm lying on the floor. The
    // hero could rewind onto it, step forward, and collect a second charge — forever.
    const { tiles, subtypes } = corridor(10);
    subtypes[1][1] = [TileSubtype.OPEN_CHEST, TileSubtype.AMBER_MOTH];

    const picked = movePlayer(baseState({ mapData: { tiles, subtypes } }), Direction.RIGHT);
    expect(picked.rewindCharges).toBe(1);

    // Walk on, then wind back as far as history allows.
    const walked = walkRight(picked, 4);
    const back = rewindStateBy(walked, REWIND_MAX_DEPTH)!;

    // The furthest reachable moment is still AFTER the pickup: the charm is gone from
    // the map and the hero is at or past the tile it sat on.
    const loose = back.mapData.subtypes
      .flat()
      .some((tags) => tags.includes(TileSubtype.AMBER_MOTH));
    expect(loose).toBe(false);
    expect(findPlayerPosition(back.mapData)![1]).toBeGreaterThanOrEqual(1);
    expect(back.rewindCharges).toBe(0);
  });

  it("does not grant a charge through a still-locked chest", () => {
    const { tiles, subtypes } = corridor(8);
    subtypes[1][1] = [
      TileSubtype.CHEST,
      TileSubtype.AMBER_MOTH,
      TileSubtype.LOCK,
    ];

    const blocked = movePlayer(
      baseState({ mapData: { tiles, subtypes }, chestKeyCount: 0, maxFloors: 3 }),
      Direction.RIGHT
    );
    expect(blocked.rewindCharges ?? 0).toBe(0);
  });
});
