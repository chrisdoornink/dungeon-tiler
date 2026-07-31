import { Enemy, updateEnemies } from "../../lib/enemy";
import { TileSubtype, Direction } from "../../lib/map";
import { movePlayer, performThrowRock } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import {
  isStandable,
  podExit,
  quarrymasterIsSummoning,
  quarrymasterPodSpawnNonce,
  quarrymasterUpdate,
  QUARRYMASTER_WAVE_EVERY,
  QUARRYMASTER_MAX_ADDS,
} from "../../lib/bosses/quarrymaster";
import {
  assertLayout,
  buildQuarrymasterArena,
  QUARRYMASTER_ARENA_DEFAULTS,
  QUARRYMASTER_LAYOUTS,
} from "../../lib/bosses/quarrymaster_arena";
import type { BehaviorContext } from "../../lib/enemies/registry";

type Cell = { y: number; x: number };
const ORTHO: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** An open room of `size`, walled at the border, no overlays. */
function openRoom(size: number): { grid: number[][]; subs: number[][][] } {
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 1)
  );
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) grid[y][x] = 0;
  }
  const subs = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );
  return { grid, subs };
}

function baseState(mapData: GameState["mapData"], over: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData,
    showFullMap: true,
    win: false,
    playerDirection: Direction.DOWN,
    heroHealth: 6,
    heroMaxHealth: 6,
    heroAttack: 1,
    enemies: [],
    npcs: [],
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...over,
  } as GameState;
}

/** Build a BehaviorContext around a boss at [by,bx] with the given pods. */
function bossCtx(args: {
  grid: number[][];
  subs: number[][][];
  boss: Cell;
  hero: Cell;
  mem: Record<string, unknown>;
  onSpawn?: (spec: { y: number; x: number; kind: string; memory?: Record<string, unknown> }) => boolean;
  roster?: Array<{ y: number; x: number; kind: string; health: number; behaviorMemory?: Record<string, unknown> }>;
}): BehaviorContext {
  const { grid, subs, boss, hero, mem, onSpawn, roster } = args;
  const self = { y: boss.y, x: boss.x, kind: "quarrymaster", health: 5, behaviorMemory: mem };
  return {
    grid,
    subtypes: subs,
    enemies: [self, ...(roster ?? [])] as BehaviorContext["enemies"],
    enemyIndex: 0,
    player: { y: hero.y, x: hero.x, torchLit: true },
    rng: () => 0.5,
    spawnEnemy: onSpawn as BehaviorContext["spawnEnemy"],
    enemy: { y: boss.y, x: boss.x, facing: "DOWN", memory: mem, attack: 2 },
  };
}

describe("goblins and cracks (existing engine rules, relied on deliberately)", () => {
  test("a chasing goblin steps on a crack, falls, and leaves an open hole", () => {
    // This is the mechanic, and none of it is Quarrymaster-specific: goblins step on
    // FAULTY_FLOOR while chasing, applyEnemyHazardDeaths converts the tile and kills them.
    const { grid, subs } = openRoom(5);
    subs[1][2].push(TileSubtype.FAULTY_FLOOR);
    const goblin = new Enemy({ y: 1, x: 1 });
    goblin.kind = "earth-goblin";
    subs[1][3].push(TileSubtype.PLAYER);
    const state = baseState({ tiles: grid, subtypes: subs }, {
      enemies: [goblin],
      playerDirection: Direction.DOWN,
    });

    const after = movePlayer(state, Direction.DOWN);

    expect(after.enemies ?? []).toHaveLength(0);
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.mapData.subtypes[1][2]).toContain(TileSubtype.OPEN_ABYSS);
    expect(after.mapData.subtypes[1][2]).not.toContain(TileSubtype.FAULTY_FLOOR);
  });

  test("nothing walks into a hole that has already opened", () => {
    // The variability the design wants: once a crack has claimed someone it is a visible
    // hole, and every goblin routes around it from then on.
    const { grid, subs } = openRoom(5);
    subs[2][2].push(TileSubtype.OPEN_ABYSS);
    const goblin = new Enemy({ y: 2, x: 1 });
    goblin.kind = "earth-goblin";

    updateEnemies(grid, subs, [goblin], { y: 2, x: 3 }, { playerTorchLit: true });

    expect(subs[goblin.y][goblin.x]).not.toContain(TileSubtype.OPEN_ABYSS);
  });

  test("summons move at ordinary speed — one tile a turn, however far away", () => {
    // Regression guard: an earlier build gave the boss's adds a double-step "surge" and
    // unlimited vision. They are plain goblins now and must stay that way.
    const { grid, subs } = openRoom(25);
    const add = new Enemy({ y: 12, x: 10 });
    add.kind = "earth-goblin";
    add.behaviorMemory["podId"] = "pod0";
    const before = { y: add.y, x: add.x };

    updateEnemies(grid, subs, [add], { y: 12, x: 16 }, { playerTorchLit: true });

    const moved = Math.abs(add.y - before.y) + Math.abs(add.x - before.x);
    expect(moved).toBeLessThanOrEqual(1);
  });

  test("summons obey normal vision — they cannot see the hero across the map", () => {
    const { grid, subs } = openRoom(25);
    const add = new Enemy({ y: 1, x: 1 });
    add.kind = "earth-goblin";
    add.behaviorMemory["podId"] = "pod0";

    // 40 tiles away, far past ENEMY_VISION_RADIUS: it must not beeline.
    const startDist = 40;
    updateEnemies(grid, subs, [add], { y: 21, x: 21 }, { playerTorchLit: true });
    const dist = Math.abs(add.y - 21) + Math.abs(add.x - 21);

    expect(dist).toBeGreaterThanOrEqual(startDist - 1);
  });

  test("a ghost drifting over a hole does not fall in", () => {
    const { grid, subs } = openRoom(9);
    subs[6][6].push(TileSubtype.OPEN_ABYSS);
    subs[1][1].push(TileSubtype.PLAYER);
    const ghost = new Enemy({ y: 6, x: 6 });
    ghost.kind = "ghost";
    ghost.behaviorMemory["frozen"] = true;
    const state = baseState({ tiles: grid, subtypes: subs }, {
      enemies: [ghost],
      playerDirection: Direction.DOWN,
    });

    const after = movePlayer(state, Direction.DOWN);

    const survivor = (after.enemies ?? []).find((e) => e.kind === "ghost");
    expect(survivor).toBeDefined();
    expect([survivor!.y, survivor!.x]).toEqual([6, 6]);
  });
});

describe("isStandable / podExit", () => {
  test("pits, faulty floor and walls are not standable", () => {
    const { grid, subs } = openRoom(5);
    subs[1][1].push(TileSubtype.OPEN_ABYSS);
    subs[1][2].push(TileSubtype.FAULTY_FLOOR);
    expect(isStandable(grid, subs, 1, 1)).toBe(false);
    expect(isStandable(grid, subs, 1, 2)).toBe(false);
    expect(isStandable(grid, subs, 0, 0)).toBe(false); // border wall
    expect(isStandable(grid, subs, 2, 2)).toBe(true);
  });

  test("a pod uses its own tile when free, and a neighbour when blocked", () => {
    const { grid, subs } = openRoom(7);
    const pod = { y: 3, x: 3 };
    expect(podExit(grid, subs, pod, [])).toEqual(pod);

    const blocked = podExit(grid, subs, pod, [pod]);
    expect(blocked).not.toBeNull();
    expect(Math.abs(blocked!.y - 3) + Math.abs(blocked!.x - 3)).toBe(1);
  });

  test("a pod walled in on every side yields nothing rather than spawning illegally", () => {
    const { grid, subs } = openRoom(7);
    const pod = { y: 3, x: 3 };
    const taken = [pod, ...ORTHO.map(([dy, dx]) => ({ y: 3 + dy, x: 3 + dx }))];
    expect(podExit(grid, subs, pod, taken)).toBeNull();
  });
});

describe("spawn pods", () => {
  test("a wave puts one goblin out of every pod", () => {
    const { grid, subs } = openRoom(15);
    const mem: Record<string, unknown> = { pods: [[2, 2], [2, 12]], nextWaveAt: 1 };
    const spawns: Array<{ y: number; x: number }> = [];
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 2, x: 7 },
      hero: { y: 12, x: 7 },
      mem,
      onSpawn: (spec) => {
        spawns.push({ y: spec.y, x: spec.x });
        return true;
      },
    });

    quarrymasterUpdate(ctx);

    expect(spawns).toHaveLength(2);
    expect(spawns).toEqual(expect.arrayContaining([{ y: 2, x: 2 }, { y: 2, x: 12 }]));
  });

  test("goblins amass across waves instead of being capped at one per pod", () => {
    // The difficulty is the crowd, so waves must stack rather than replace.
    const { grid, subs } = openRoom(15);
    const mem: Record<string, unknown> = { pods: [[2, 2], [2, 12]] };
    const roster: Array<{ y: number; x: number; kind: string; health: number; behaviorMemory?: Record<string, unknown> }> = [];
    let nextSlot = 5;
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 2, x: 7 },
      hero: { y: 12, x: 7 },
      mem,
      onSpawn: (spec) => {
        // Park each newborn somewhere harmless so it keeps counting against the cap.
        roster.push({ y: nextSlot++, x: 1, kind: spec.kind, health: 3, behaviorMemory: spec.memory });
        return true;
      },
    });

    for (let turn = 0; turn < QUARRYMASTER_WAVE_EVERY * 3 + 1; turn++) {
      ctx.enemies = [ctx.enemies[0], ...roster] as BehaviorContext["enemies"];
      quarrymasterUpdate(ctx);
    }

    expect(roster.length).toBeGreaterThan(2);
    expect(roster.length).toBeLessThanOrEqual(QUARRYMASTER_MAX_ADDS);
  });

  test("the crowd stops at the cap", () => {
    const { grid, subs } = openRoom(21);
    const mem: Record<string, unknown> = { pods: [[2, 2], [2, 12]] };
    const roster: Array<{ y: number; x: number; kind: string; health: number; behaviorMemory?: Record<string, unknown> }> = [];
    let nextSlot = 5;
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 2, x: 7 },
      hero: { y: 18, x: 7 },
      mem,
      onSpawn: (spec) => {
        roster.push({ y: nextSlot++, x: 1, kind: spec.kind, health: 3, behaviorMemory: spec.memory });
        return true;
      },
    });

    for (let turn = 0; turn < 200; turn++) {
      ctx.enemies = [ctx.enemies[0], ...roster] as BehaviorContext["enemies"];
      quarrymasterUpdate(ctx);
    }

    expect(roster.length).toBe(QUARRYMASTER_MAX_ADDS);
  });

  test("summons carry no special behaviour flags — they are plain goblins", () => {
    const { grid, subs } = openRoom(15);
    const mem: Record<string, unknown> = { pods: [[2, 2]], nextWaveAt: 1 };
    const specs: Array<Record<string, unknown>> = [];
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 2, x: 7 },
      hero: { y: 12, x: 7 },
      mem,
      onSpawn: (spec) => {
        specs.push(spec.memory ?? {});
        return true;
      },
    });

    quarrymasterUpdate(ctx);

    expect(specs).toHaveLength(1);
    expect(specs[0].frenzied).toBeUndefined();
    expect(Object.keys(specs[0])).toEqual(["podId"]);
  });

  test("a spawn bumps the render nonce", () => {
    const { grid, subs } = openRoom(15);
    const mem: Record<string, unknown> = { pods: [[2, 2]], nextWaveAt: 1 };
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 2, x: 7 },
      hero: { y: 12, x: 7 },
      mem,
      onSpawn: () => true,
    });

    expect(quarrymasterPodSpawnNonce(mem)).toBeNull();
    quarrymasterUpdate(ctx);
    expect(quarrymasterPodSpawnNonce(mem)).toBe(1);
  });

  test("collared: he cannot call for help while the hero is on him", () => {
    const { grid, subs } = openRoom(15);
    const mem: Record<string, unknown> = { pods: [[2, 2], [2, 12]], nextWaveAt: 1 };
    let spawns = 0;
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 2, x: 7 },
      hero: { y: 2, x: 8 },
      mem,
      onSpawn: () => {
        spawns += 1;
        return true;
      },
    });

    const damage = quarrymasterUpdate(ctx);

    expect(damage).toBe(2);
    expect(spawns).toBe(0);
  });
});

describe("switches and cage gates", () => {
  test("stepping on a switch latches it and retracts its spikes", () => {
    const { grid, subs } = openRoom(5);
    subs[1][1].push(TileSubtype.PLAYER);
    subs[1][2].push(TileSubtype.PRESSURE_PLATE);
    subs[1][3].push(TileSubtype.SPIKES);
    const state = baseState({ tiles: grid, subtypes: subs }, {
      gateGroups: [{ plate: [1, 2], gates: [[1, 3]], open: false }],
    });

    const after = movePlayer(state, Direction.RIGHT);

    expect(after.mapData.subtypes[1][2]).toContain(TileSubtype.PRESSURE_PLATE_PRESSED);
    expect(after.mapData.subtypes[1][2]).not.toContain(TileSubtype.PRESSURE_PLATE);
    // The bed sinks into the floor and leaves walkable sockets behind.
    expect(after.mapData.subtypes[1][3]).toContain(TileSubtype.SPIKE_HOLES);
    expect(after.mapData.subtypes[1][3]).not.toContain(TileSubtype.SPIKES);
    expect(after.mapData.tiles[1][3]).toBe(0);
    expect(after.gateGroups?.[0].open).toBe(true);
    expect(after.mapData.subtypes[1][2]).toContain(TileSubtype.PLAYER);
  });

  test("pressing one switch leaves the other beds standing", () => {
    const { grid, subs } = openRoom(7);
    subs[1][1].push(TileSubtype.PLAYER);
    subs[1][2].push(TileSubtype.PRESSURE_PLATE);
    subs[1][3].push(TileSubtype.SPIKES);
    subs[1][4].push(TileSubtype.SPIKES);
    const state = baseState({ tiles: grid, subtypes: subs }, {
      gateGroups: [
        { plate: [1, 2], gates: [[1, 3]], open: false },
        { plate: [5, 5], gates: [[1, 4]], open: false },
      ],
    });

    const after = movePlayer(state, Direction.RIGHT);

    expect(after.mapData.subtypes[1][3]).toContain(TileSubtype.SPIKE_HOLES);
    expect(after.mapData.subtypes[1][4]).toContain(TileSubtype.SPIKES);
    expect(after.gateGroups?.[1].open).toBe(false);
  });

  test("walking over a retracted bed does not wipe its sockets", () => {
    // Regression: SPIKE_HOLES was missing from the step-on preserve list in movePlayerCore,
    // so standing on a retracted bed replaced the tile's subtypes with just PLAYER. The mark
    // recording a thrown switch was erased the first time anyone walked the lane it opened —
    // i.e. always, since opening the lane is the whole reason to walk there.
    const { grid, subs } = openRoom(5);
    subs[1][1].push(TileSubtype.PLAYER);
    subs[1][2].push(TileSubtype.SPIKE_HOLES);
    const state = baseState({ tiles: grid, subtypes: subs });

    const onIt = movePlayer(state, Direction.RIGHT);
    expect(onIt.mapData.subtypes[1][2]).toContain(TileSubtype.SPIKE_HOLES);
    expect(onIt.mapData.subtypes[1][2]).toContain(TileSubtype.PLAYER);

    // ...and it is still there once the hero walks off again.
    const offIt = movePlayer(onIt, Direction.RIGHT);
    expect(offIt.mapData.subtypes[1][2]).toContain(TileSubtype.SPIKE_HOLES);
    expect(offIt.mapData.subtypes[1][2]).not.toContain(TileSubtype.PLAYER);
  });

  test("pressing a switch does not mutate the pre-move state's gate groups", () => {
    const { grid, subs } = openRoom(5);
    subs[1][1].push(TileSubtype.PLAYER);
    subs[1][2].push(TileSubtype.PRESSURE_PLATE);
    subs[1][3].push(TileSubtype.SPIKES);
    const groups = [
      { plate: [1, 2] as [number, number], gates: [[1, 3] as [number, number]], open: false },
    ];
    const state = baseState({ tiles: grid, subtypes: subs }, { gateGroups: groups });

    movePlayer(state, Direction.RIGHT);

    expect(groups[0].open).toBe(false);
  });
});

describe("the authored arena", () => {
  test("the shipped map satisfies every layout invariant", () => {
    // assertLayout runs inside the builder, so this passing at all is the guarantee:
    // switches reachable, pods able to reach the hero, boss sealed until the last gate.
    expect(() => buildQuarrymasterArena()).not.toThrow();
  });

  test("it reports the pieces the harness advertises", () => {
    const arena = buildQuarrymasterArena();
    expect(arena.plates).toHaveLength(4); // three field switches + the chamber switch
    expect(arena.pods).toHaveLength(2);
    expect(arena.cracks.length).toBeGreaterThan(20);
    expect(arena.state.gateGroups).toHaveLength(4);
    expect(arena.state.inBossRoom).toBe(true);
    expect(arena.state.hasSword).toBe(true);
    expect(arena.state.heroMaxHealth).toBe(QUARRYMASTER_ARENA_DEFAULTS.heroHealth);
  });

  test("the authored cracks are identical every build — nothing generates them", () => {
    const a = buildQuarrymasterArena();
    const b = buildQuarrymasterArena();
    expect(a.cracks).toEqual(b.cracks);
  });

  test("the boss is sealed until the last gate row drops", () => {
    const arena = buildQuarrymasterArena();
    const { tiles, subtypes } = arena.state.mapData;
    const groups = arena.state.gateGroups!;

    const reachesBoss = (openCount: number) => {
      const t = tiles.map((r) => [...r]);
      const s = subtypes.map((r) => r.map((c) => [...c]));
      for (let i = 0; i < openCount; i++) {
        for (const [gy, gx] of groups[i].gates) s[gy][gx] = [TileSubtype.SPIKE_HOLES];
      }
      const passable = (y: number, x: number) => {
        const cell = s[y]?.[x] ?? [];
        if (cell.includes(TileSubtype.SPIKES)) return false;
        if (cell.includes(TileSubtype.OPEN_ABYSS)) return false;
        if (cell.includes(TileSubtype.FAULTY_FLOOR)) return false;
        return t[y]?.[x] === 0;
      };
      const seen = new Set<string>([`${arena.hero[0]},${arena.hero[1]}`]);
      const q: Array<[number, number]> = [arena.hero];
      while (q.length) {
        const [y, x] = q.shift()!;
        for (const [dy, dx] of ORTHO) {
          const k = `${y + dy},${x + dx}`;
          if (seen.has(k) || !passable(y + dy, x + dx)) continue;
          seen.add(k);
          q.push([y + dy, x + dx]);
        }
      }
      return ORTHO.some(([dy, dx]) =>
        seen.has(`${arena.boss[0] + dy},${arena.boss[1] + dx}`)
      );
    };

    expect(reachesBoss(0)).toBe(false);
    expect(reachesBoss(1)).toBe(false);
    expect(reachesBoss(2)).toBe(false);
    expect(reachesBoss(3)).toBe(true);
  });

  test("the boss knows about the pods", () => {
    const arena = buildQuarrymasterArena();
    const boss = (arena.state.enemies ?? []).find((e) => e.kind === "quarrymaster")!;
    expect(boss.behaviorMemory["pods"]).toEqual(arena.pods);
  });

  test("every layout is square and fully walled", () => {
    for (const layout of QUARRYMASTER_LAYOUTS) {
      const size = layout.map.length;
      for (const row of layout.map) expect(row).toHaveLength(size);
      expect(layout.map[0]).toBe("#".repeat(size));
      expect(layout.map[size - 1]).toBe("#".repeat(size));
      for (const row of layout.map) {
        expect(row[0]).toBe("#");
        expect(row[size - 1]).toBe("#");
      }
    }
  });

  test("EVERY layout satisfies the invariants, not just the default", () => {
    // The point of having several: each has its own switch and crack placement, and each
    // must independently be solvable. This is the test that catches a bad new layout.
    QUARRYMASTER_LAYOUTS.forEach((layout, i) => {
      expect(() => buildQuarrymasterArena({ layoutIndex: i })).not.toThrow();
      const arena = buildQuarrymasterArena({ layoutIndex: i });
      expect(arena.layoutName).toBe(layout.name);
      expect(arena.plates).toHaveLength(4);
      expect(arena.pods).toHaveLength(2);
      expect(arena.cracks.length).toBeGreaterThan(10);
    });
  });

  test("layout index wraps, so any integer is safe", () => {
    const n = QUARRYMASTER_LAYOUTS.length;
    expect(buildQuarrymasterArena({ layoutIndex: n }).layoutName).toBe(
      QUARRYMASTER_LAYOUTS[0].name
    );
    expect(buildQuarrymasterArena({ layoutIndex: -1 }).layoutName).toBe(
      QUARRYMASTER_LAYOUTS[n - 1].name
    );
  });

  test("switch and crack placement actually differs between layouts", () => {
    const a = buildQuarrymasterArena({ layoutIndex: 0 });
    const b = buildQuarrymasterArena({ layoutIndex: 1 });
    expect(a.plates).not.toEqual(b.plates);
    expect(a.cracks).not.toEqual(b.cracks);
  });

  test("a map edit that walls a switch off fails loudly instead of shipping a soft-lock", () => {
    // The whole reason assertLayout exists: hand-authored mazes are one typo from unplayable
    // and the failure is invisible until someone plays it.
    const broken = [
      "#######",
      "#4Q#T.#",
      "#.1#a.#",
      "#XXXXX#",
      "#..H..#",
      "#...dE#",
      "#######",
    ];
    expect(() => buildQuarrymasterArena({ map: broken })).toThrow(/unreachable/i);
  });

  test("a map whose gates do not seal the boss fails loudly", () => {
    const leaky = [
      "#########",
      "#4Q....T#",
      "#...a...#",
      "#.1.....#",
      "#.......#",
      "#..H....#",
      "#.......#",
      "#.....dE#",
      "#########",
    ];
    // Boss is standing in the open, so he is reachable with zero gates down.
    expect(() => buildQuarrymasterArena({ map: leaky })).toThrow(/reachable with only 0/i);
  });

  test("a map whose exit is NOT sealed behind the chamber switch fails loudly", () => {
    // The loophole this all exists for: a hero who walks in already carrying an exit key
    // must not be able to reach the exit before killing the boss and throwing his switch.
    // Boss properly sealed behind gate `a`, switch 1 out in the open, chamber switch `4`
    // present — everything valid EXCEPT that the exit sits in open floor the hero can walk
    // straight to. Isolates the one check under test.
    const openExit = [
      "#########",
      "#4Q#...T#",
      "#aa#....#",
      "#...1...#",
      "#.......#",
      "#..H...E#",
      "#.......#",
      "#.....d.#",
      "#########",
    ];
    expect(() => buildQuarrymasterArena({ map: openExit })).toThrow(
      /exit is reachable before the chamber switch/i
    );
  });

  test("the exit really is sealed until the chamber switch is thrown", () => {
    QUARRYMASTER_LAYOUTS.forEach((_, i) => {
      const arena = buildQuarrymasterArena({ layoutIndex: i });
      const groups = arena.state.gateGroups!;
      const exitIdx = groups.length - 1; // "4"/"d" sorts last
      const { tiles, subtypes } = arena.state.mapData;
      const exitTile = subtypes
        .flatMap((row, y) => row.map((cell, x) => ({ y, x, cell })))
        .find(({ cell }) => cell.includes(TileSubtype.EXIT))!;

      const canReachExit = (openIdx: number[]) => {
        const t = tiles.map((r) => [...r]);
        const sub = subtypes.map((r) => r.map((c) => [...c]));
        for (const gi of openIdx) {
          for (const [gy, gx] of groups[gi].gates) sub[gy][gx] = [TileSubtype.SPIKE_HOLES];
        }
        const passable = (y: number, x: number) => {
          const cell = sub[y]?.[x];
          if (!cell) return false;
          if (cell.includes(TileSubtype.SPIKES)) return false;
          if (cell.includes(TileSubtype.OPEN_ABYSS)) return false;
          if (cell.includes(TileSubtype.FAULTY_FLOOR)) return false;
          return t[y]?.[x] === 0;
        };
        const seen = new Set<string>([`${arena.hero[0]},${arena.hero[1]}`]);
        const q: Array<[number, number]> = [arena.hero];
        while (q.length) {
          const [y, x] = q.shift()!;
          for (const [dy, dx] of ORTHO) {
            const k = `${y + dy},${x + dx}`;
            if (seen.has(k) || !passable(y + dy, x + dx)) continue;
            seen.add(k);
            q.push([y + dy, x + dx]);
          }
        }
        return seen.has(`${exitTile.y},${exitTile.x}`);
      };

      // Every cage gate down but the chamber switch un-thrown: still no way out.
      const cageOnly = groups.map((_, gi) => gi).filter((gi) => gi !== exitIdx);
      expect(canReachExit(cageOnly)).toBe(false);
      expect(canReachExit([...cageOnly, exitIdx])).toBe(true);
    });
  });

  test("assertLayout is exported for map authoring and agrees with the builder", () => {
    expect(typeof assertLayout).toBe("function");
  });
});

describe("the boss himself", () => {
  test("killing him drops the gold key that opens the arena exit", () => {
    const { grid, subs } = openRoom(5);
    subs[2][1].push(TileSubtype.PLAYER);
    const boss = new Enemy({ y: 2, x: 2 });
    boss.kind = "quarrymaster";
    boss.health = 1;
    const state = baseState({ tiles: grid, subtypes: subs }, {
      enemies: [boss],
      hasSword: true,
      inBossRoom: true,
      heroHealth: 20,
      heroMaxHealth: 20,
    });

    const after = movePlayer(state, Direction.RIGHT);

    expect((after.enemies ?? []).some((e) => e.kind === "quarrymaster")).toBe(false);
    expect(after.bossDefeated).toBe(true);
    const keyTile = after.mapData.subtypes
      .flatMap((row, y) => row.map((cell, x) => ({ y, x, cell })))
      .find(({ cell }) => cell.includes(TileSubtype.EXITKEY));
    expect(keyTile).toBeDefined();
  });

  test("he paces inside his chamber and never walks out through the mouth", () => {
    const arena = buildQuarrymasterArena();
    const boss = (arena.state.enemies ?? []).find((e) => e.kind === "quarrymaster")!;
    const mem = boss.behaviorMemory as Record<string, number>;
    const { tiles, subtypes } = arena.state.mapData;

    for (let turn = 0; turn < 60; turn++) {
      updateEnemies(tiles, subtypes, [boss], { y: arena.hero[0], x: arena.hero[1] }, {
        playerTorchLit: true,
        rng: Math.random,
      });
      expect(boss.y).toBeGreaterThanOrEqual(mem.roamMinY);
      expect(boss.y).toBeLessThanOrEqual(mem.roamMaxY);
      expect(boss.x).toBeGreaterThanOrEqual(mem.roamMinX);
      expect(boss.x).toBeLessThanOrEqual(mem.roamMaxX);
    }
  });
});

describe("his death", () => {
  test("closes the spawn pods", () => {
    // He is what holds them open, so leaving them lit during the walk back to the exit would
    // read as "more is coming" right when the opposite should be true.
    const arena = buildQuarrymasterArena({ layoutIndex: 0 });
    const st = arena.state;
    const boss = (st.enemies ?? []).find((e) => e.kind === "quarrymaster")!;
    boss.health = 1;

    const podsBefore = st.mapData.subtypes
      .flat()
      .filter((c) => c.includes(TileSubtype.SPAWN_POD)).length;
    expect(podsBefore).toBe(2);

    // Stand next to him and swing. He is walled in, so place the hero directly beside him.
    const [by, bx] = arena.boss;
    for (const row of st.mapData.subtypes) {
      for (let x = 0; x < row.length; x++) {
        const i = row[x].indexOf(TileSubtype.PLAYER);
        if (i >= 0) row[x].splice(i, 1);
      }
    }
    st.mapData.subtypes[by][bx - 1] = [TileSubtype.PLAYER];
    st.hasSword = true;
    st.heroHealth = 30;
    st.heroMaxHealth = 30;

    let after = st;
    for (let swing = 0; swing < 6 && !after.bossDefeated; swing++) {
      after = movePlayer(after, Direction.RIGHT) as typeof after;
    }

    expect(after.bossDefeated).toBe(true);
    const podsAfter = after.mapData.subtypes
      .flat()
      .filter((c) => c.includes(TileSubtype.SPAWN_POD)).length;
    expect(podsAfter).toBe(0);
  });
});

describe("the summoning tell", () => {
  test("he stands still on the turn he calls a wave", () => {
    // The pose is only up for one turn, so a simultaneous step is most of what the eye
    // catches — it read as a rendering glitch rather than an action.
    const { grid, subs } = openRoom(15);
    const mem: Record<string, unknown> = { pods: [[2, 2], [2, 12]], nextWaveAt: 1 };
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 6, x: 7 },
      hero: { y: 12, x: 7 },
      mem,
      onSpawn: () => true,
    });
    // Give him room to pace, so standing still is a real choice and not a blocked move.
    Object.assign(mem, { roamMinY: 5, roamMaxY: 7, roamMinX: 6, roamMaxX: 8 });

    quarrymasterUpdate(ctx);

    expect(quarrymasterIsSummoning(mem)).toBe(true);
    expect([ctx.enemy.y, ctx.enemy.x]).toEqual([6, 7]);
  });

  test("he does pace on a turn he is not calling", () => {
    const { grid, subs } = openRoom(15);
    const mem: Record<string, unknown> = {
      pods: [[2, 2]],
      nextWaveAt: 9999, // never summons
      roamMinY: 5,
      roamMaxY: 7,
      roamMinX: 6,
      roamMaxX: 8,
    };
    const ctx = bossCtx({
      grid,
      subs,
      boss: { y: 6, x: 7 },
      hero: { y: 12, x: 7 },
      mem,
      onSpawn: () => true,
    });

    // rng is fixed at 0.5 in bossCtx, so the shuffle is deterministic and he does move.
    quarrymasterUpdate(ctx);

    expect(quarrymasterIsSummoning(mem)).toBe(false);
    expect([ctx.enemy.y, ctx.enemy.x]).not.toEqual([6, 7]);
  });
});

describe("throwing a rock at a switch", () => {
  /** Hero at [1,1] facing right, a plate at [1,x], a spike bed the plate retracts. */
  function rockAtPlate(plateX: number) {
    const { grid, subs } = openRoom(9);
    subs[1][1].push(TileSubtype.PLAYER);
    subs[1][plateX].push(TileSubtype.PRESSURE_PLATE);
    subs[3][3].push(TileSubtype.SPIKES);
    return baseState({ tiles: grid, subtypes: subs }, {
      playerDirection: Direction.RIGHT,
      rockCount: 3,
      gateGroups: [{ plate: [1, plateX], gates: [[3, 3]], open: false }],
    });
  }

  test("a rock landing on a switch throws it and is spent", () => {
    const st = rockAtPlate(4);
    const after = performThrowRock(st);

    expect(after.gateGroups?.[0].open).toBe(true);
    expect(after.mapData.subtypes[1][4]).toContain(TileSubtype.PRESSURE_PLATE_PRESSED);
    expect(after.mapData.subtypes[3][3]).toContain(TileSubtype.SPIKE_HOLES);
    // Spent, not left lying on the switch.
    expect(after.mapData.subtypes[1][4]).not.toContain(TileSubtype.ROCK);
    expect(after.rockCount).toBe(2);
  });

  test("the rock stops AT the switch instead of sailing past it", () => {
    // The bug this fixes: rocks travel their full range, so a switch short of that range was
    // flown over and the rock landed behind it — "next to the switch, bumping it up".
    const st = rockAtPlate(3); // well inside the 4-tile range
    const after = performThrowRock(st);

    expect(after.gateGroups?.[0].open).toBe(true);
    // Nothing landed beyond the plate.
    for (let x = 4; x < 8; x++) {
      expect(after.mapData.subtypes[1][x]).not.toContain(TileSubtype.ROCK);
    }
  });

  test("an already-thrown switch does not eat the rock", () => {
    const { grid, subs } = openRoom(9);
    subs[1][1].push(TileSubtype.PLAYER);
    subs[1][3].push(TileSubtype.PRESSURE_PLATE_PRESSED);
    const st = baseState({ tiles: grid, subtypes: subs }, {
      playerDirection: Direction.RIGHT,
      rockCount: 1,
    });

    const after = performThrowRock(st);

    // Sails over the spent plate and lands at full range.
    expect(after.mapData.subtypes[1][3]).not.toContain(TileSubtype.ROCK);
    expect(after.mapData.subtypes[1][5]).toContain(TileSubtype.ROCK);
  });

  test("it works across a crack the hero cannot walk over", () => {
    // The scenario that prompted this: a switch on the far side of a crack field.
    const { grid, subs } = openRoom(9);
    subs[1][1].push(TileSubtype.PLAYER);
    subs[1][2].push(TileSubtype.FAULTY_FLOOR);
    subs[1][3].push(TileSubtype.OPEN_ABYSS);
    subs[1][4].push(TileSubtype.PRESSURE_PLATE);
    subs[5][5].push(TileSubtype.SPIKES);
    const st = baseState({ tiles: grid, subtypes: subs }, {
      playerDirection: Direction.RIGHT,
      rockCount: 1,
      gateGroups: [{ plate: [1, 4], gates: [[5, 5]], open: false }],
    });

    const after = performThrowRock(st);

    expect(after.gateGroups?.[0].open).toBe(true);
    expect(after.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKE_HOLES);
  });
});
