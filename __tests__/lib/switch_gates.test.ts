import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
  movePlayer,
  performThrowRockCore,
  type GameState,
} from "../../lib/map/game-state";
import { Direction, TileSubtype } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { findPlayerPosition } from "../../lib/map/player";
import {
  applySwitchGate,
  injectSwitchGate,
  planSwitchGate,
  SWITCH_GATE_FLOOR_CHANCE,
  type SwitchGatePlan,
} from "../../lib/map/switch-gates";
import { mulberry32, withPatchedMathRandom } from "../../lib/rng";

/**
 * The switch gate is dropped into maps nobody authored, so the tests that matter are the
 * ones no hand-check can stand in for: across a spread of real generated floors, does the
 * gate ever sever the run, and is the rock answer always physically available?
 */

const SEEDS = [1, 7, 42, 99, 128, 512, 777, 1234, 4096, 31337, 60001, 90210];

type Built = { state: GameState; hero: [number, number] };

function buildFloor(seed: number, floor: number): Built {
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1)
  );
  let state = f1;
  for (let f = 2; f <= floor; f++) state = advanceToNextFloor(state, seed);
  const hero = findPlayerPosition(state.mapData);
  if (!hero) throw new Error(`seed ${seed} floor ${floor} has no player`);
  return { state, hero };
}

/** Steps from `start` to every tile the hero can safely walk, given the map as it stands. */
function safeReach(mapData: MapData, start: [number, number]): Set<string> {
  const seen = new Set<string>([`${start[0]},${start[1]}`]);
  let frontier: Array<[number, number]> = [start];
  const blocking = [
    TileSubtype.SPIKES,
    TileSubtype.LAVA,
    TileSubtype.DEEP_WATER,
    TileSubtype.FAULTY_FLOOR,
    TileSubtype.WALL_TORCH,
    TileSubtype.CHECKPOINT,
  ];
  while (frontier.length) {
    const next: Array<[number, number]> = [];
    for (const [y, x] of frontier) {
      for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const ny = y + dy;
        const nx = x + dx;
        const key = `${ny},${nx}`;
        if (seen.has(key)) continue;
        if (mapData.tiles[ny]?.[nx] !== 0) continue;
        const subs = mapData.subtypes[ny][nx];
        if (subs.some((s) => blocking.includes(s as TileSubtype))) continue;
        seen.add(key);
        next.push([ny, nx]);
      }
    }
    frontier = next;
  }
  return seen;
}

function essentials(mapData: MapData): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < mapData.subtypes.length; y++) {
    for (let x = 0; x < mapData.subtypes[y].length; x++) {
      const subs = mapData.subtypes[y][x];
      if (
        subs.includes(TileSubtype.EXIT) ||
        subs.includes(TileSubtype.EXITKEY) ||
        subs.includes(TileSubtype.KEY) ||
        subs.includes(TileSubtype.CHEST)
      ) {
        out.push([y, x]);
      }
    }
  }
  return out;
}

describe("switch gate placement on generated daily floors", () => {
  const cases: Array<{ seed: number; floor: number; built: Built; plan: SwitchGatePlan | null }> =
    [];
  for (const seed of SEEDS) {
    for (const floor of [1, 2, 3]) {
      const built = buildFloor(seed, floor);
      // Plan against a pristine copy so the map is only mutated where a test wants it.
      const plan = planSwitchGate(built.state.mapData, built.hero);
      cases.push({ seed, floor, built, plan });
    }
  }

  it("finds a placement on the large majority of floors", () => {
    const hits = cases.filter((c) => c.plan).length;
    // Not a guarantee, and deliberately not asserted as one — a floor with no legal
    // corridor simply gets no gate. This only pins that the rules are not so tight that
    // the feature would never fire.
    expect(hits / cases.length).toBeGreaterThan(0.5);
  });

  it("never severs an essential tile from the hero", () => {
    for (const { seed, floor, built, plan } of cases) {
      if (!plan) continue;
      const state = buildFloor(seed, floor).state;
      applySwitchGate(state, state.mapData, plan);
      const reach = safeReach(state.mapData, built.hero);
      for (const [ey, ex] of essentials(state.mapData)) {
        expect(reach.has(`${ey},${ex}`)).toBe(true);
      }
    }
  });

  it("keeps the plate reachable on foot with the bed shut", () => {
    for (const { seed, floor, plan, built } of cases) {
      if (!plan) continue;
      const state = buildFloor(seed, floor).state;
      applySwitchGate(state, state.mapData, plan);
      const reach = safeReach(state.mapData, built.hero);
      expect(reach.has(`${plan.plate[0]},${plan.plate[1]}`)).toBe(true);
    }
  });

  it("puts the plate inside rock-throw range of the near side", () => {
    for (const { plan } of cases) {
      if (!plan) continue;
      expect(plan.throwDistance).toBeGreaterThanOrEqual(2);
      expect(plan.throwDistance).toBeLessThanOrEqual(4);
    }
  });

  it("keeps the bed one deep and no wider than a doorway", () => {
    for (const { plan } of cases) {
      if (!plan) continue;
      expect(plan.bed.length).toBeGreaterThanOrEqual(1);
      expect(plan.bed.length).toBeLessThanOrEqual(3);
      // Contiguous along a single row or column.
      const rows = new Set(plan.bed.map(([y]) => y));
      const cols = new Set(plan.bed.map(([, x]) => x));
      expect(rows.size === 1 || cols.size === 1).toBe(true);
    }
  });

  it("only takes corridors worth opening", () => {
    for (const { plan } of cases) {
      if (!plan) continue;
      expect(plan.detour).toBeGreaterThanOrEqual(4);
    }
  });

  it("writes spikes and a plate onto blank tiles only", () => {
    for (const { seed, floor, plan } of cases) {
      if (!plan) continue;
      const pristine = buildFloor(seed, floor).state.mapData;
      for (const [by, bx] of plan.bed) {
        expect(pristine.subtypes[by][bx]).toEqual([]);
      }
      expect(pristine.subtypes[plan.plate[0]][plan.plate[1]]).toEqual([]);
    }
  });

  it("retracts the bed when a rock lands on the plate", () => {
    const hit = cases.find((c) => c.plan);
    expect(hit).toBeDefined();
    if (!hit || !hit.plan) return;
    const { seed, floor, plan } = hit;
    const state = buildFloor(seed, floor).state;
    injectSwitchGate(state, buildFloor(seed, floor).hero);

    // Stand the hero on the near side facing down the corridor, then throw.
    const [b0y, b0x] = plan.bed[0];
    const [py, px] = plan.plate;
    const axis: [number, number] = [
      Math.sign(py - b0y),
      Math.sign(px - b0x),
    ];
    const nearY = b0y - axis[0];
    const nearX = b0x - axis[1];
    const dir =
      axis[0] === 1
        ? Direction.DOWN
        : axis[0] === -1
        ? Direction.UP
        : axis[1] === 1
        ? Direction.RIGHT
        : Direction.LEFT;

    const staged: GameState = {
      ...state,
      enemies: [],
      rockCount: 1,
      playerDirection: dir,
    };
    // Move the hero onto the near tile by hand — this is a placement test, not a walk test.
    for (let y = 0; y < staged.mapData.subtypes.length; y++) {
      for (let x = 0; x < staged.mapData.subtypes[y].length; x++) {
        staged.mapData.subtypes[y][x] = staged.mapData.subtypes[y][x].filter(
          (s) => s !== TileSubtype.PLAYER
        );
      }
    }
    staged.mapData.subtypes[nearY][nearX] = [TileSubtype.PLAYER];

    const after = performThrowRockCore(staged);

    expect(after.rockCount).toBe(0);
    for (const [by, bx] of plan.bed) {
      expect(after.mapData.subtypes[by][bx]).toContain(TileSubtype.SPIKE_HOLES);
      expect(after.mapData.subtypes[by][bx]).not.toContain(TileSubtype.SPIKES);
    }
    expect(after.mapData.subtypes[py][px]).toContain(
      TileSubtype.PRESSURE_PLATE_PRESSED
    );
    expect(after.gateGroups?.[0].open).toBe(true);
  });

  it("refuses the move and costs a heart when the hero walks into the shut bed", () => {
    const hit = cases.find((c) => c.plan);
    if (!hit || !hit.plan) return;
    const { seed, floor, plan } = hit;
    const state = buildFloor(seed, floor).state;
    injectSwitchGate(state, buildFloor(seed, floor).hero);

    const [b0y, b0x] = plan.bed[0];
    const [py, px] = plan.plate;
    const axis: [number, number] = [Math.sign(py - b0y), Math.sign(px - b0x)];
    const nearY = b0y - axis[0];
    const nearX = b0x - axis[1];
    const dir =
      axis[0] === 1
        ? Direction.DOWN
        : axis[0] === -1
        ? Direction.UP
        : axis[1] === 1
        ? Direction.RIGHT
        : Direction.LEFT;

    const staged: GameState = { ...state, enemies: [], heroHealth: 5 };
    for (let y = 0; y < staged.mapData.subtypes.length; y++) {
      for (let x = 0; x < staged.mapData.subtypes[y].length; x++) {
        staged.mapData.subtypes[y][x] = staged.mapData.subtypes[y][x].filter(
          (s) => s !== TileSubtype.PLAYER
        );
      }
    }
    staged.mapData.subtypes[nearY][nearX] = [TileSubtype.PLAYER];

    const after = movePlayer(staged, dir);

    expect(after.heroHealth).toBe(4);
    expect(after.mapData.subtypes[nearY][nearX]).toContain(TileSubtype.PLAYER);
    expect(after.mapData.subtypes[b0y][b0x]).not.toContain(TileSubtype.PLAYER);
  });
});

/**
 * The integration into daily generation. Two things matter far more than the rest:
 *  - turning the feature on must not change ANY other generated thing on ANY date, because
 *    lib/stats replays past dates to reconstruct chests and bosses; and
 *  - a day gets at most one gate, via the floor-1 -> floor-2 -> floor-3 cascade.
 */
describe("daily integration", () => {
  const DAY_SEEDS = [11, 222, 3333, 44444, 555555, 6060, 70707, 808080, 9111, 10222];

  function buildDay(seed: number, switchGates: boolean): GameState[] {
    const f1 = withPatchedMathRandom(mulberry32(seed), () =>
      initializeGameStateForMultiTier(1, { switchGates })
    );
    const f2 = advanceToNextFloor(f1, seed);
    const f3 = advanceToNextFloor(f2, seed);
    return [f1, f2, f3];
  }

  /** Everything about a floor EXCEPT the switch gate's own tiles. */
  function fingerprint(state: GameState, plan: SwitchGatePlan | null): string {
    const gateTiles = new Set(
      [...(plan?.bed ?? []), ...(plan ? [plan.plate] : [])].map(([y, x]) => `${y},${x}`)
    );
    const subs = state.mapData.subtypes
      .map((row, y) =>
        row.map((cell, x) => (gateTiles.has(`${y},${x}`) ? "GATE" : cell.join("."))).join("|")
      )
      .join("/");
    const enemies = (state.enemies ?? [])
      .map((e) => `${e.kind}@${e.y},${e.x}`)
      .sort()
      .join(",");
    return [
      state.mapData.tiles.map((r) => r.join("")).join("/"),
      subs,
      enemies,
      state.bossEntranceKind ?? "-",
      state.dailyBossKind ?? "-",
      JSON.stringify(state.sealPayloads ?? null),
      JSON.stringify(state.floorChestAllocation ?? null),
    ].join("#");
  }

  function planOf(state: GameState): SwitchGatePlan | null {
    const g = state.gateGroups?.[0];
    if (!g) return null;
    return {
      bed: g.gates,
      plate: g.plate,
      access: "behind-bed",
      detour: 0,
      throwDistance: 0,
    };
  }

  it("is off by default, so every non-daily caller is untouched", () => {
    for (const seed of DAY_SEEDS) {
      for (const state of buildDay(seed, false)) {
        expect(state.gateGroups).toBeUndefined();
        expect(state.switchGatesEnabled).toBeUndefined();
      }
      const f1 = withPatchedMathRandom(mulberry32(seed), () =>
        initializeGameStateForMultiTier(1)
      );
      expect(f1.gateGroups).toBeUndefined();
    }
  });

  it("changes NOTHING else on the floor when enabled", () => {
    // The load-bearing test for historical /stats. The placement is appended after the last
    // existing draw in each floor's RNG stream, so with the gate's own tiles masked out the
    // two runs must be byte-identical — same map, same enemies, same boss, same seals, same
    // chest allocation. If this fails, the placement moved earlier in the stream and every
    // past day on /stats is now being replayed wrong.
    for (const seed of DAY_SEEDS) {
      const off = buildDay(seed, false);
      const on = buildDay(seed, true);
      for (let i = 0; i < 3; i++) {
        const plan = planOf(on[i]);
        expect(fingerprint(on[i], plan)).toBe(fingerprint(off[i], plan));
      }
    }
  });

  it("places at most one gate across all three floors", () => {
    for (const seed of DAY_SEEDS) {
      const day = buildDay(seed, true);
      const gated = day.filter((s) => (s.gateGroups?.length ?? 0) > 0);
      expect(gated.length).toBeLessThanOrEqual(1);
      // The carry-forward flag agrees with reality on the last floor.
      expect(Boolean(day[2].switchGate)).toBe(gated.length === 1);
    }
  });

  it("never carries a previous floor's gate wiring onto a new map", () => {
    // gateGroups is per-map. A stale plate coordinate would have pressPlate firing on a tile
    // that never had a switch, retracting spikes that do not exist.
    for (const seed of DAY_SEEDS) {
      const day = buildDay(seed, true);
      for (const state of day) {
        for (const g of state.gateGroups ?? []) {
          expect(state.mapData.subtypes[g.plate[0]][g.plate[1]]).toContain(
            TileSubtype.PRESSURE_PLATE
          );
          for (const [gy, gx] of g.gates) {
            expect(state.mapData.subtypes[gy][gx]).toContain(TileSubtype.SPIKES);
          }
        }
      }
    }
  });

  it("puts a gate on most days, and follows the cascade order", () => {
    const floorOf: number[] = [];
    let none = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const day = buildDay(seed, true);
      const idx = day.findIndex((s) => (s.gateGroups?.length ?? 0) > 0);
      if (idx < 0) none++;
      else floorOf.push(idx + 1);
    }
    const total = 120;
    // Roughly one a day, per the design target.
    expect((total - none) / total).toBeGreaterThan(0.85);
    // Floor 1 and floor 2 each get a ~30% shot, so floor 3 — which takes whatever is left —
    // must end up with the most. This is what proves the cascade runs in the intended order
    // rather than every floor rolling independently.
    const count = (f: number) => floorOf.filter((n) => n === f).length;
    expect(count(3)).toBeGreaterThan(count(1));
    expect(count(3)).toBeGreaterThan(count(2));
    // Floor 1's share should sit near the configured chance, not at zero or at everything.
    expect(count(1) / total).toBeGreaterThan(SWITCH_GATE_FLOOR_CHANCE / 2);
    expect(count(1) / total).toBeLessThan(SWITCH_GATE_FLOOR_CHANCE * 1.6);
  });

  it("never builds a bed or plate on top of an enemy", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const state of buildDay(seed, true)) {
        const taken = new Set((state.enemies ?? []).map((e) => `${e.y},${e.x}`));
        for (const g of state.gateGroups ?? []) {
          expect(taken.has(`${g.plate[0]},${g.plate[1]}`)).toBe(false);
          for (const [gy, gx] of g.gates) {
            expect(taken.has(`${gy},${gx}`)).toBe(false);
          }
        }
      }
    }
  });
});

/**
 * Both variants ship, and the report has to be able to tell them apart — plus tell a rock throw
 * from a walk-around, since that is the only evidence for whether the behind-the-spikes shape is
 * earning its place.
 */
describe("variants and engagement reporting", () => {
  function day(seed: number) {
    const f1 = withPatchedMathRandom(mulberry32(seed), () =>
      initializeGameStateForMultiTier(1, { switchGates: true })
    );
    const f2 = advanceToNextFloor(f1, seed);
    const f3 = advanceToNextFloor(f2, seed);
    return [f1, f2, f3];
  }

  function gatedFloor(states: GameState[]): GameState | undefined {
    return states.find((s) => (s.gateGroups?.length ?? 0) > 0);
  }

  it("ships both access variants across days", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const s = gatedFloor(day(seed));
      if (s?.switchGate) seen.add(s.switchGate.access);
    }
    expect(seen.has("open")).toBe(true);
    expect(seen.has("behind-bed")).toBe(true);
  });

  it("records the floor, variant and plate of the day's gate", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const states = day(seed);
      const s = gatedFloor(states);
      if (!s?.switchGate) continue;
      const g = s.switchGate;
      expect(g.floor).toBe(s.currentFloor);
      expect(["open", "behind-bed"]).toContain(g.access);
      // The recorded plate is the real one, which is what lets pressPlate tell this switch
      // apart from a boss arena's.
      expect(s.mapData.subtypes[g.plate[0]][g.plate[1]]).toContain(
        TileSubtype.PRESSURE_PLATE
      );
      expect(g.thrownBy).toBeUndefined();
      // Carried to the last floor regardless of which floor placed it.
      expect(states[2].switchGate?.plate).toEqual(g.plate);
    }
  });

  it('attributes a walked-on switch to "boot"', () => {
    const seed = SEEDS.find((sd) => {
      const s = gatedFloor(day(sd));
      return !!s?.switchGate;
    });
    expect(seed).toBeDefined();
    const state = gatedFloor(day(seed!))!;
    const [py, px] = state.switchGate!.plate;

    // Stand the hero next to the plate and step onto it.
    const staged: GameState = { ...state, enemies: [], heroHealth: 5 };
    for (let y = 0; y < staged.mapData.subtypes.length; y++) {
      for (let x = 0; x < staged.mapData.subtypes[y].length; x++) {
        staged.mapData.subtypes[y][x] = staged.mapData.subtypes[y][x].filter(
          (s) => s !== TileSubtype.PLAYER
        );
      }
    }
    const approach: Array<[[number, number], Direction]> = [
      [[py - 1, px], Direction.DOWN],
      [[py + 1, px], Direction.UP],
      [[py, px - 1], Direction.RIGHT],
      [[py, px + 1], Direction.LEFT],
    ];
    const spot = approach.find(
      ([[y, x]]) => staged.mapData.tiles[y]?.[x] === 0 && staged.mapData.subtypes[y][x].length === 0
    );
    expect(spot).toBeDefined();
    staged.mapData.subtypes[spot![0][0]][spot![0][1]] = [TileSubtype.PLAYER];

    const after = movePlayer(staged, spot![1]);
    expect(after.switchGate?.thrownBy).toBe("boot");
    expect(after.mapData.subtypes[py][px]).toContain(TileSubtype.PRESSURE_PLATE_PRESSED);
  });

  it('attributes a rock-thrown switch to "rock"', () => {
    // Build a gate we know is behind a bed, so the throw lane exists by construction.
    const found = (() => {
      for (const seed of SEEDS) {
        const built = buildFloor(seed, 2);
        const plan = planSwitchGate(built.state.mapData, built.hero, {
          access: "behind-bed",
        });
        if (plan) return { built, plan };
      }
      return null;
    })();
    expect(found).toBeTruthy();
    const { built, plan } = found!;
    const state = built.state;
    applySwitchGate(state, state.mapData, plan);
    state.switchGate = { floor: 2, access: "behind-bed", plate: plan.plate };

    const [b0y, b0x] = plan.bed[0];
    const [py, px] = plan.plate;
    const axis: [number, number] = [Math.sign(py - b0y), Math.sign(px - b0x)];
    const dir =
      axis[0] === 1
        ? Direction.DOWN
        : axis[0] === -1
        ? Direction.UP
        : axis[1] === 1
        ? Direction.RIGHT
        : Direction.LEFT;

    const staged: GameState = { ...state, enemies: [], rockCount: 1, playerDirection: dir };
    for (let y = 0; y < staged.mapData.subtypes.length; y++) {
      for (let x = 0; x < staged.mapData.subtypes[y].length; x++) {
        staged.mapData.subtypes[y][x] = staged.mapData.subtypes[y][x].filter(
          (s) => s !== TileSubtype.PLAYER
        );
      }
    }
    staged.mapData.subtypes[b0y - axis[0]][b0x - axis[1]] = [TileSubtype.PLAYER];

    const after = performThrowRockCore(staged);
    expect(after.switchGate?.thrownBy).toBe("rock");
    expect(after.mapData.subtypes[py][px]).toContain(TileSubtype.PRESSURE_PLATE_PRESSED);
  });

  it("ignores plates that are not the day's gate", () => {
    // A daily run that reaches the Quarrymaster presses up to four of HIS plates. None of them
    // is this feature, and none may show up as engagement with it.
    const built = buildFloor(SEEDS[0], 2);
    const state = built.state;
    const plan = planSwitchGate(state.mapData, built.hero)!;
    expect(plan).toBeTruthy();
    applySwitchGate(state, state.mapData, plan);
    // Claim a DIFFERENT tile as the day's gate, then press the real plate.
    state.switchGate = { floor: 2, access: "open", plate: [0, 0] };

    const staged: GameState = { ...state, enemies: [], heroHealth: 5 };
    const [py, px] = plan.plate;
    for (let y = 0; y < staged.mapData.subtypes.length; y++) {
      for (let x = 0; x < staged.mapData.subtypes[y].length; x++) {
        staged.mapData.subtypes[y][x] = staged.mapData.subtypes[y][x].filter(
          (s) => s !== TileSubtype.PLAYER
        );
      }
    }
    const approach: Array<[[number, number], Direction]> = [
      [[py - 1, px], Direction.DOWN],
      [[py + 1, px], Direction.UP],
      [[py, px - 1], Direction.RIGHT],
      [[py, px + 1], Direction.LEFT],
    ];
    const spot = approach.find(
      ([[y, x]]) => staged.mapData.tiles[y]?.[x] === 0 && staged.mapData.subtypes[y][x].length === 0
    )!;
    staged.mapData.subtypes[spot[0][0]][spot[0][1]] = [TileSubtype.PLAYER];

    const after = movePlayer(staged, spot[1]);
    // The plate still latched (the mechanic works); it just was not recorded as the day's gate.
    expect(after.mapData.subtypes[py][px]).toContain(TileSubtype.PRESSURE_PLATE_PRESSED);
    expect(after.switchGate?.thrownBy).toBeUndefined();
  });

  it('keeps the no-soft-lock guarantee for the "open" variant too', () => {
    for (const seed of SEEDS) {
      for (const floor of [1, 2, 3]) {
        const built = buildFloor(seed, floor);
        const plan = planSwitchGate(built.state.mapData, built.hero, { access: "open" });
        if (!plan) continue;
        const state = buildFloor(seed, floor).state;
        applySwitchGate(state, state.mapData, plan);
        const reach = safeReach(state.mapData, built.hero);
        for (const [ey, ex] of essentials(state.mapData)) {
          expect(reach.has(`${ey},${ex}`)).toBe(true);
        }
        expect(reach.has(`${plan.plate[0]},${plan.plate[1]}`)).toBe(true);
      }
    }
  });
});
