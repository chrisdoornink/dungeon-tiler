import { Enemy, EnemyState, rehydrateEnemies } from "../../lib/enemy";
import { addStaticGuardNearKey } from "../../lib/map/enemy-features";
import { serializeEnemies } from "../../lib/map/utils";
import {
  addPlayerToMapAwayFromObjectives,
  findPlayerPosition,
} from "../../lib/map/player";
import { advanceToNextFloor } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { generateCompleteMapForFloor } from "../../lib/map/map-features";
import { TileSubtype, FLOOR } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";

// ---- helpers ---------------------------------------------------------------

const openGrid = (n: number) => Array.from({ length: n }, () => Array(n).fill(FLOOR));

function emptyMap(n: number): MapData {
  return {
    tiles: openGrid(n),
    subtypes: Array.from({ length: n }, () =>
      Array.from({ length: n }, () => [] as number[])
    ),
  } as MapData;
}

function findSub(md: MapData, sub: TileSubtype): [number, number] | null {
  for (let y = 0; y < md.subtypes.length; y++)
    for (let x = 0; x < md.subtypes[y].length; x++)
      if (md.subtypes[y][x].includes(sub)) return [y, x];
  return null;
}

function manhattan(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function makeFloor2State(): GameState {
  return {
    currentFloor: 2,
    maxFloors: 3,
    floorChestAllocation: {
      1: { chests: 2, keys: 2, chestContents: [] },
      2: { chests: 2, keys: 2, chestContents: [] },
      3: { chests: 0, keys: 0, chestContents: [] },
    },
    enemies: [],
    mode: "daily",
  } as unknown as GameState;
}

// ---- static guard AI behavior ---------------------------------------------

describe("static guard AI", () => {
  test("a static guard holds its post: does NOT idle-wander while it has not seen the player", () => {
    const grid = openGrid(12);
    const player = { y: 0, x: 0 }; // far away, beyond vision range (>8)
    const guard = new Enemy({ y: 8, x: 8 });
    guard.kind = "fire-goblin";
    guard.behaviorMemory["isGuard"] = true;

    for (let i = 0; i < 60; i++) {
      guard.update({ grid, player });
      expect(guard.y === 8 && guard.x === 8).toBe(true); // never moves
    }
  });

  test("a normal goblin (no guard flag) on the same setup eventually wanders", () => {
    const grid = openGrid(12);
    const player = { y: 0, x: 0 };
    const goblin = new Enemy({ y: 8, x: 8 });
    goblin.kind = "fire-goblin";

    let moved = false;
    for (let i = 0; i < 80; i++) {
      goblin.update({ grid, player });
      if (goblin.y !== 8 || goblin.x !== 8) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
  });

  test("a static guard wakes and pursues when it sees the player, and is marked woken", () => {
    const grid = openGrid(12);
    // Player in clear line of sight, within range, two tiles away.
    const player = { y: 8, x: 6 };
    const guard = new Enemy({ y: 8, x: 8 });
    guard.kind = "fire-goblin";
    guard.behaviorMemory["isGuard"] = true;

    guard.update({ grid, player });

    expect(guard.state).toBe(EnemyState.HUNTING);
    expect(guard.behaviorMemory["guardWoke"]).toBe(true);
    // moved one step toward the player (closer than the starting x=8)
    expect(guard.x).toBeLessThan(8);
  });

  test("once woken, a guard behaves like a normal goblin (can wander when idle again)", () => {
    const grid = openGrid(12);
    const guard = new Enemy({ y: 8, x: 8 });
    guard.kind = "fire-goblin";
    guard.behaviorMemory["isGuard"] = true;
    guard.behaviorMemory["guardWoke"] = true; // simulate a prior sighting

    const player = { y: 0, x: 0 }; // now far away again
    let moved = false;
    for (let i = 0; i < 80; i++) {
      guard.update({ grid, player });
      if (guard.y !== 8 || guard.x !== 8) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
  });

  test("guard flag survives serialize -> rehydrate, and the rehydrated guard still holds its post", () => {
    const guard = new Enemy({ y: 5, x: 5 });
    guard.kind = "fire-goblin";
    guard.behaviorMemory["isGuard"] = true;

    const plain = serializeEnemies([guard])!;
    const [restored] = rehydrateEnemies(plain);
    expect(restored.behaviorMemory["isGuard"]).toBe(true);

    const grid = openGrid(12);
    const player = { y: 0, x: 0 };
    for (let i = 0; i < 40; i++) {
      restored.update({ grid, player });
      expect(restored.y === 5 && restored.x === 5).toBe(true);
    }
  });
});

// ---- guard placement -------------------------------------------------------

describe("addStaticGuardNearKey", () => {
  test("places exactly one guard adjacent to the exit key on a walkable floor tile", () => {
    const md = emptyMap(11);
    md.subtypes[5][5] = [TileSubtype.EXITKEY];
    md.subtypes[0][0] = [TileSubtype.PLAYER];

    const out = addStaticGuardNearKey(md, []);
    expect(out.length).toBe(1);
    const g = out[0];
    expect(g.behaviorMemory["isGuard"]).toBe(true);
    expect(g.kind).not.toBe("ghost");
    expect(g.kind).not.toBe("snake");
    // orthogonally adjacent to the key
    expect(manhattan([g.y, g.x], [5, 5])).toBe(1);
    expect(md.tiles[g.y][g.x]).toBe(FLOOR);
  });

  test("does not place the guard on the key, exit, player, or an existing enemy", () => {
    const md = emptyMap(11);
    md.subtypes[5][5] = [TileSubtype.EXITKEY];
    md.subtypes[5][6] = [TileSubtype.EXIT];
    md.subtypes[4][5] = [TileSubtype.PLAYER];
    const existing = new Enemy({ y: 6, x: 5 }); // occupies one neighbor
    existing.kind = "fire-goblin";

    const out = addStaticGuardNearKey(md, [existing]);
    expect(out.length).toBe(2);
    const guard = out.find((e) => e.behaviorMemory["isGuard"] === true)!;
    const forbidden = new Set(["5,5", "5,6", "4,5", "6,5"]);
    expect(forbidden.has(`${guard.y},${guard.x}`)).toBe(false);
    // the only remaining orthogonal neighbor is (5,4)
    expect([guard.y, guard.x]).toEqual([5, 4]);
  });

  test("is a no-op when there is no exit key", () => {
    const md = emptyMap(8);
    const out = addStaticGuardNearKey(md, []);
    expect(out.length).toBe(0);
  });
});

// ---- floor-3 integration via advanceToNextFloor ----------------------------

describe("floor 3 guard integration", () => {
  test("advancing to floor 3 stations a guard adjacent to the exit key", () => {
    const state = advanceToNextFloor(makeFloor2State(), 4242);
    expect(state.currentFloor).toBe(3);
    const key = findSub(state.mapData, TileSubtype.EXITKEY)!;
    const guards = (state.enemies || []).filter(
      (e) => (e.behaviorMemory as Record<string, unknown>)["isGuard"] === true
    );
    expect(guards.length).toBe(1);
    expect(manhattan([guards[0].y, guards[0].x], key)).toBeLessThanOrEqual(2);
  });

  test("guard placement is deterministic for the same seed", () => {
    const a = advanceToNextFloor(makeFloor2State(), 99999);
    const b = advanceToNextFloor(makeFloor2State(), 99999);
    const ga = a.enemies!.find((e) => (e.behaviorMemory as Record<string, unknown>)["isGuard"]);
    const gb = b.enemies!.find((e) => (e.behaviorMemory as Record<string, unknown>)["isGuard"]);
    expect(ga).toBeDefined();
    expect([ga!.y, ga!.x]).toEqual([gb!.y, gb!.x]);
  });

  test("does not add a guard when advancing to a non-floor-3 floor", () => {
    const state = makeFloor2State();
    (state as unknown as { currentFloor: number }).currentFloor = 3; // -> nextFloor 4
    (state as unknown as { maxFloors: number }).maxFloors = 10;
    const next = advanceToNextFloor(state, 4242);
    expect(next.currentFloor).toBe(4);
    const guards = (next.enemies || []).filter(
      (e) => (e.behaviorMemory as Record<string, unknown>)["isGuard"] === true
    );
    expect(guards.length).toBe(0);
  });
});

// ---- hero placement away from objectives -----------------------------------

describe("addPlayerToMapAwayFromObjectives", () => {
  test("floor-3 maps spawn the hero far from both the key and the exit", () => {
    let okFarFromBoth = 0;
    const N = 50;
    for (let s = 1; s <= N; s++) {
      const md = generateCompleteMapForFloor(
        { chests: 0, keys: 0, chestContents: [] },
        3
      );
      const player = findPlayerPosition(md)!;
      const key = findSub(md, TileSubtype.EXITKEY)!;
      const exit = findSub(md, TileSubtype.EXIT)!;
      const near = Math.min(manhattan(player, key), manhattan(player, exit));
      // graceful fallback could occasionally dip below 8 on a cramped map, but the
      // hero should essentially never be hugging an objective.
      expect(near).toBeGreaterThanOrEqual(4);
      if (near >= 8) okFarFromBoth++;
    }
    // the overwhelming majority clear the intended >=8 spread
    expect(okFarFromBoth).toBeGreaterThanOrEqual(Math.floor(N * 0.9));
  });

  test("falls back to normal placement when key/exit are absent", () => {
    const md = emptyMap(10);
    const out = addPlayerToMapAwayFromObjectives(md, { minDistance: 8 });
    expect(findPlayerPosition(out)).not.toBeNull();
  });

  test("on a cramped map (no tile reaches minDistance) it still picks a farthest tile, not a random one", () => {
    // 5x5 open map: max possible min(dist) is small, well under minDistance=8.
    const md = emptyMap(5);
    md.subtypes[2][1] = [TileSubtype.EXITKEY];
    md.subtypes[2][3] = [TileSubtype.EXIT];

    const score = (p: [number, number]) =>
      Math.min(manhattan(p, [2, 1]), manhattan(p, [2, 3]));
    // Best achievable min-distance among all floor tiles on this tiny board.
    let best = -1;
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) best = Math.max(best, score([y, x]));

    // Run several times; the spawn must always land in the top band, never a near-objective tile.
    for (let i = 0; i < 25; i++) {
      const out = addPlayerToMapAwayFromObjectives(md, { minDistance: 8 });
      const p = findPlayerPosition(out)!;
      expect(score(p)).toBeGreaterThanOrEqual(Math.floor(best * 0.7));
    }
  });
});
