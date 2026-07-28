import { Enemy } from "../../lib/enemy";
import { movePlayer, Direction, TileSubtype } from "../../lib/map";
import type { GameState } from "../../lib/map/game-state";
import {
  buildShaperArena,
  SHAPER_LAYOUTS,
  SHAPER_ENTRIES,
} from "../../lib/bosses/shaper_arena";
import {
  planShaperAttack,
  executeShaperAttack,
  fireTargets,
  shaperRevealTiles,
  shaperPendingFire,
  type ShaperMutation,
} from "../../lib/bosses/shaper";

function seqRng(): () => number {
  let s = 0.123;
  return () => {
    s = (s * 9301 + 0.49297) % 1;
    return s;
  };
}

function openArena(
  n: number,
  heroPos: [number, number],
  shaperPos: [number, number]
): { state: GameState; shaper: Enemy } {
  const tiles = Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => (y === 0 || x === 0 || y === n - 1 || x === n - 1 ? 1 : 0))
  );
  const subtypes: number[][][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => [])
  );
  subtypes[heroPos[0]][heroPos[1]] = [TileSubtype.PLAYER];
  const shaper = new Enemy({ y: shaperPos[0], x: shaperPos[1] });
  shaper.kind = "shaper";
  const state = {
    hasKey: false, hasExitKey: false, hasSword: true, hasShield: false,
    mapData: { tiles, subtypes }, showFullMap: true, win: false,
    playerDirection: Direction.UP, enemies: [shaper], npcs: [],
    heroHealth: 5, heroMaxHealth: 5, heroAttack: 1, heroTorchLit: true,
    rockCount: 5, combatRng: () => 0.5,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
  } as unknown as GameState;
  return { state, shaper };
}

const grid = (n: number) => Array.from({ length: n }, () => Array(n).fill(0));
const emptySubs = (n: number) =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));
const at = (m: ShaperMutation[], y: number, x: number) => m.find((t) => t.y === y && t.x === x);

describe("Shaper attacks respect walls", () => {
  test("a lava PATH melts exactly ONE wall into charred floor and never passes through", () => {
    // Boss above, hero below, a wall spanning the column between them at row 4.
    const g = grid(11);
    const s = emptySubs(11);
    g[4][5] = 1; // wall directly on the straight path
    const muts = planShaperAttack(
      "path", "lava", { y: 1, x: 5 }, { y: 9, x: 5 }, { y: 9, x: 5 }, g, s, seqRng()
    );
    // The wall tile is melted to SINGED...
    const wall = at(muts, 4, 5);
    expect(wall?.sub).toBe(TileSubtype.SINGED);
    // ...and NOTHING is reshaped beyond it (rows > 4 on the path column).
    expect(muts.every((m) => !(m.x === 5 && m.y > 4))).toBe(true);
    // Applying it opens the wall to floor.
    executeShaperAttack(muts, g, s);
    expect(g[4][5]).toBe(0);
    expect(s[4][5]).toEqual([TileSubtype.SINGED]);
  });

  test("a water PATH stops at a wall (never touches it) and pools to the sides", () => {
    const g = grid(11);
    const s = emptySubs(11);
    g[4][5] = 1;
    const muts = planShaperAttack(
      "path", "water", { y: 1, x: 5 }, { y: 9, x: 5 }, { y: 9, x: 5 }, g, s, seqRng()
    );
    expect(at(muts, 4, 5)).toBeUndefined(); // wall untouched
    expect(muts.every((m) => !(m.x === 5 && m.y > 4))).toBe(true); // nothing beyond
    // Puddles to the left and right of the last floor tile before the wall (row 3).
    expect(at(muts, 3, 4)?.sub).toBe(TileSubtype.SHALLOW_WATER);
    expect(at(muts, 3, 6)?.sub).toBe(TileSubtype.SHALLOW_WATER);
    executeShaperAttack(muts, g, s);
    expect(g[4][5]).toBe(1); // wall still a wall
  });

  test("neither element ever reshapes a tile on the far side of a wall (the bug)", () => {
    for (const el of ["lava", "water"] as const) {
      const g = grid(11);
      const s = emptySubs(11);
      g[4][5] = 1;
      const muts = planShaperAttack(
        "path", el, { y: 1, x: 5 }, { y: 9, x: 5 }, { y: 9, x: 5 }, g, s, seqRng()
      );
      // No mutation strictly beyond the wall along the corridor.
      expect(muts.some((m) => m.y >= 6 && m.x === 5)).toBe(false);
    }
  });

  test("lava won't melt the map border wall", () => {
    // Bordered grid (walls on the edge), boss firing up into the top border.
    const g = grid(11);
    for (let i = 0; i < 11; i++) {
      g[0][i] = 1; g[10][i] = 1; g[i][0] = 1; g[i][10] = 1;
    }
    const s = emptySubs(11);
    const muts = planShaperAttack(
      "path", "lava", { y: 3, x: 5 }, { y: 1, x: 5 }, { y: 1, x: 5 }, g, s, seqRng()
    );
    // The border wall at row 0 is never melted (out of the meltable set).
    expect(muts.every((m) => m.y !== 0)).toBe(true);
    executeShaperAttack(muts, g, s);
    expect(g[0][5]).toBe(1); // still a wall
  });
});

describe("Shaper element interaction (the weapon)", () => {
  test("lava crossing water yields singed; water crossing lava yields singed", () => {
    // Lava path down a column with a shallow tile in the way.
    const g = grid(11);
    const s = emptySubs(11);
    s[4][5] = [TileSubtype.SHALLOW_WATER];
    const lavaMuts = planShaperAttack(
      "path", "lava", { y: 1, x: 5 }, { y: 8, x: 5 }, { y: 8, x: 5 }, g, s, seqRng()
    );
    expect(at(lavaMuts, 4, 5)?.sub).toBe(TileSubtype.SINGED);

    const g2 = grid(11);
    const s2 = emptySubs(11);
    s2[4][5] = [TileSubtype.LAVA];
    const waterMuts = planShaperAttack(
      "path", "water", { y: 1, x: 5 }, { y: 8, x: 5 }, { y: 8, x: 5 }, g2, s2, seqRng()
    );
    expect(at(waterMuts, 4, 5)?.sub).toBe(TileSubtype.SINGED);
  });

  test("water deepens shallow; execute applies the given subtypes", () => {
    const g = grid(9);
    const s = emptySubs(9);
    executeShaperAttack([{ y: 3, x: 3, sub: TileSubtype.DEEP_WATER }], g, s);
    expect(s[3][3]).toEqual([TileSubtype.DEEP_WATER]);
  });
});

describe("Shaper strategy: water slows, fire kills", () => {
  test("UNALERTED (out of range) holds fire for several turns, then spews", () => {
    const { state } = openArena(21, [19, 10], [1, 10]);
    state.combatRng = seqRng();
    let s = state;
    for (let t = 0; t < 4; t++) {
      s = movePlayer(s, t % 2 === 0 ? Direction.LEFT : Direction.RIGHT);
      expect(shaperRevealTiles(s.enemies![0].behaviorMemory as Record<string, unknown>)).toBeNull();
    }
    let spewed = false;
    for (let t = 0; t < 3 && !spewed; t++) {
      s = movePlayer(s, t % 2 === 0 ? Direction.LEFT : Direction.RIGHT);
      if (shaperRevealTiles(s.enemies![0].behaviorMemory as Record<string, unknown>)) spewed = true;
    }
    expect(spewed).toBe(true);
  });

  test("ALERTED opens with WATER (not fire)", () => {
    const { state } = openArena(13, [6, 6], [2, 6]);
    state.combatRng = seqRng();
    forceStrat(state, "drowning");
    const s = movePlayer(state, Direction.DOWN);
    const atk = shaperRevealTiles(s.enemies![0].behaviorMemory as Record<string, unknown>);
    expect(atk?.element).toBe("water");
  });

  test("two water squirts in a row create torch-snuffing DEEP water", () => {
    const { state } = openArena(13, [6, 6], [2, 6]);
    state.combatRng = seqRng();
    forceStrat(state, "drowning");
    let s = movePlayer(state, Direction.DOWN); // water #1: floor -> shallow
    expect(countSubtype(s, TileSubtype.DEEP_WATER)).toBe(0);
    s = movePlayer(s, Direction.DOWN); // water #2: shallow -> deep
    expect(countSubtype(s, TileSubtype.DEEP_WATER)).toBeGreaterThan(0);
  });

  test("fire is telegraphed: it launches (glow, no lava), then rains down as lava", () => {
    const { state } = openArena(13, [6, 6], [2, 6]);
    state.combatRng = seqRng();
    forceStrat(state, "drowning");
    let s = movePlayer(state, Direction.DOWN); // water 1
    s = movePlayer(s, Direction.DOWN); // water 2
    const lavaBefore = countSubtype(s, TileSubtype.LAVA);
    s = movePlayer(s, Direction.DOWN); // FIRE LAUNCH
    const pending = shaperPendingFire(s.enemies![0].behaviorMemory as Record<string, unknown>);
    expect(pending).toBeTruthy();
    expect(pending!.length).toBeGreaterThan(0);
    expect(countSubtype(s, TileSubtype.LAVA)).toBe(lavaBefore); // no lava yet — just a warning
    s = movePlayer(s, Direction.DOWN); // FIRE RAINS DOWN
    expect(shaperPendingFire(s.enemies![0].behaviorMemory as Record<string, unknown>)).toBeNull();
    expect(countSubtype(s, TileSubtype.LAVA)).toBeGreaterThan(lavaBefore);
  });

  test("standing where the fire lands kills you (otherwise you die)", () => {
    // Hero pinned against the west wall; bumping LEFT keeps it still, so the fire
    // is aimed at its tile and then rains down onto it while it stays put.
    const { state } = openArena(13, [6, 1], [2, 1]);
    state.combatRng = seqRng();
    forceStrat(state, "drowning");
    let s = state;
    for (let t = 0; t < 4; t++) s = movePlayer(s, Direction.LEFT); // water, water, launch, LAND
    expect(s.heroHealth).toBe(0);
    expect(s.deathCause?.type).toBe("lava");
  });

  test("stepping off the telegraphed tiles when the fire lands survives", () => {
    const { state } = openArena(13, [6, 1], [2, 1]);
    state.combatRng = seqRng();
    forceStrat(state, "drowning");
    let s = state;
    for (let t = 0; t < 3; t++) s = movePlayer(s, Direction.LEFT); // water, water, launch (holding)
    const pending = shaperPendingFire(s.enemies![0].behaviorMemory as Record<string, unknown>) ?? [];
    const pend = new Set(pending.map(([y, x]) => `${y},${x}`));
    const [hy, hx] = findHero(s);
    const safe = ([[1, 0], [-1, 0], [0, 1]] as Array<[number, number]>).find(
      ([dy, dx]) => s.mapData.tiles[hy + dy]?.[hx + dx] === 0 && !pend.has(`${hy + dy},${hx + dx}`)
    );
    expect(safe).toBeTruthy(); // there is an escape off the telegraph
    const dir = safe![0] === 1 ? Direction.DOWN : safe![0] === -1 ? Direction.UP : Direction.RIGHT;
    s = movePlayer(s, dir); // fire lands, hero steps clear
    expect(s.heroHealth).toBeGreaterThan(0);
    expect(s.deathCause?.type).not.toBe("lava");
  });

  test("fire mostly AVOIDS water tiles (it's a wasted kill)", () => {
    // Flood a patch, then tally how many launched fire tiles land on water.
    let waterHits = 0;
    let total = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { state } = openArena(13, [6, 6], [2, 6]);
      state.combatRng = mulberryish(seed);
      forceStrat(state, "drowning");
      // Pre-flood a 5x5 shallow patch around the hero (never the hero's own tile,
      // which must keep its PLAYER marker).
      for (let y = 4; y <= 8; y++)
        for (let x = 4; x <= 8; x++)
          if (!(y === 6 && x === 6)) state.mapData.subtypes[y][x] = [TileSubtype.SHALLOW_WATER];
      let s: GameState = state;
      s = movePlayer(s, Direction.LEFT); // water1 (hero holds? no wall — it moves; fine)
      s = movePlayer(s, Direction.LEFT); // water2
      s = movePlayer(s, Direction.LEFT); // fire launch
      const pending = shaperPendingFire(s.enemies![0].behaviorMemory as Record<string, unknown>) ?? [];
      for (const [y, x] of pending) {
        total++;
        const subs = s.mapData.subtypes[y][x] ?? [];
        if (subs.includes(TileSubtype.SHALLOW_WATER) || subs.includes(TileSubtype.DEEP_WATER)) waterHits++;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(waterHits / total).toBeLessThan(0.4); // avoids water most of the time
  });

  test("reaching the Shaper and striking it kills it", () => {
    const { state } = openArena(7, [3, 3], [3, 4]);
    const hit1 = movePlayer(state, Direction.RIGHT);
    expect(hit1.enemies![0].health).toBe(2);
    const hit2 = movePlayer(hit1, Direction.RIGHT);
    expect((hit2.enemies ?? []).length).toBe(0);
  });
});

describe("Shaper WALL strategy", () => {
  test("raises a wall between itself and the hero when alerted", () => {
    const { state } = openArena(13, [6, 6], [2, 6]);
    forceStrat(state, "wall");
    state.combatRng = () => 0.5; // >= lava-mix -> it builds rather than lobs fire
    const wallsBefore = countWalls(state);
    const s = movePlayer(state, Direction.DOWN);
    expect(countWalls(s)).toBe(wallsBefore + 1);
  });

  test("never builds a wall on the hero or the boss", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = openArena(13, [9, 6], [6, 6]).state;
      forceStrat(s, "wall");
      s.combatRng = mulberryish(seed);
      for (let t = 0; t < 12; t++) {
        s = movePlayer(s, stepTowardBoss(s));
        if ((s.enemies ?? []).length === 0 || s.heroHealth <= 0) break;
        const boss = s.enemies![0];
        expect(s.mapData.tiles[boss.y][boss.x]).toBe(0); // boss never entombed
        const [hy, hx] = findHero(s);
        expect(s.mapData.tiles[hy][hx]).toBe(0); // hero never walled over
      }
    }
  });

  test("NEVER seals the hero out — the boss stays reachable every turn (many fights)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      let s = openArena(15, [11, 7], [7, 7]).state;
      forceStrat(s, "wall");
      s.combatRng = mulberryish(seed * 13 + 1);
      for (let t = 0; t < 30; t++) {
        if ((s.enemies ?? []).length === 0) break; // boss slain -> it was reachable
        // The boss is never entombed (structural), and ignoring coolable lava
        // the hero can always still reach a standable attack tile (path).
        expect(bossHasStandableNeighbor(s)).toBe(true);
        expect(canStillReachBoss(s)).toBe(true);
        s = movePlayer(s, stepTowardBoss(s));
        if (s.heroHealth <= 0) break;
      }
    }
  });

  test("does NOT entomb itself: won't build the 4th wall around a 3-walled boss", () => {
    // Reproduction of the softlock the review caught: boss at (7,7) with N/S/W
    // already walls. The last open neighbor (E=(7,8)) must never be walled, or
    // the boss becomes permanently unreachable and the fight is unwinnable.
    for (let seed = 0; seed < 8; seed++) {
      let s = openArena(15, [7, 10], [7, 7]).state;
      forceStrat(s, "wall");
      s.mapData.tiles[6][7] = 1; // N
      s.mapData.tiles[8][7] = 1; // S
      s.mapData.tiles[7][6] = 1; // W
      s.combatRng = seed === 0 ? () => 0.5 : mulberryish(seed);
      for (let t = 0; t < 10; t++) {
        s = movePlayer(s, stepTowardBoss(s));
        if ((s.enemies ?? []).length === 0 || s.heroHealth <= 0) break;
        expect(bossHasStandableNeighbor(s)).toBe(true);
        expect(s.mapData.tiles[7][8]).toBe(0); // E never walled -> never entombed
      }
    }
  });

  test("when it can't wall you off it lobs a lava splatter instead", () => {
    // Wall the boss into a spot where new walls would seal the hero out, forcing
    // the fire fallback. Small arena, boss cornered.
    let s = openArena(9, [5, 4], [3, 4]).state;
    forceStrat(s, "wall");
    s.combatRng = mulberryish(3);
    let sawFire = false;
    for (let t = 0; t < 16 && !sawFire; t++) {
      s = movePlayer(s, stepTowardBoss(s));
      if ((s.enemies ?? []).length === 0 || s.heroHealth <= 0) break;
      if (shaperPendingFire(s.enemies![0].behaviorMemory as Record<string, unknown>) || countSubtype(s, TileSubtype.LAVA) > 0) {
        sawFire = true;
      }
    }
    expect(sawFire).toBe(true);
  });

  test("fire ALWAYS leaves an escape tile — no unavoidable death in a 1-wide corridor", () => {
    // A dry 1-wide horizontal corridor (row 5 open, everything else wall). If
    // the fire blob fills the aim tile AND both collinear neighbors, a hero
    // standing on the aim tile has no survivable move. fireTargets must always
    // spare one walkable neighbor.
    const n = 13;
    const g = Array.from({ length: n }, (_, y) =>
      Array.from({ length: n }, (_, x) => (y === 5 && x >= 1 && x <= 11 ? 0 : 1))
    );
    const s = emptySubs(n);
    const boss = { y: 5, x: 3 };
    const aim = { y: 5, x: 7 };
    for (let seed = 1; seed <= 200; seed++) {
      const targets = fireTargets(boss, aim, g, s, mulberryish(seed));
      const set = new Set(targets.map(([y, x]) => `${y},${x}`));
      const walkableNeighbors = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>)
        .map(([dy, dx]) => [aim.y + dy, aim.x + dx] as [number, number])
        .filter(([y, x]) => g[y][x] === 0);
      const hasEscape = walkableNeighbors.some(([y, x]) => !set.has(`${y},${x}`));
      expect(hasEscape).toBe(true);
    }
  });

  test("the encounter rolls BOTH strategies across many fights", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = openArena(11, [6, 5], [3, 5]).state;
      s.combatRng = mulberryish(seed);
      const after = movePlayer(s, Direction.DOWN);
      const strat = (after.enemies![0].behaviorMemory as Record<string, unknown>).strategy;
      if (typeof strat === "string") seen.add(strat);
    }
    expect(seen.has("drowning")).toBe(true);
    expect(seen.has("wall")).toBe(true);
  });
});

function forceStrat(s: GameState, strat: "drowning" | "wall"): void {
  (s.enemies![0].behaviorMemory as Record<string, unknown>).strategy = strat;
}
function countWalls(s: GameState): number {
  let c = 0;
  for (const row of s.mapData.tiles) for (const t of row) if (t === 1) c++;
  return c;
}
// Can the hero still reach a STANDABLE tile orthogonally adjacent to the boss,
// treating WALLS and abyss as blockers but lava as passable (the hero can cool
// it with a rock)? A walled boss-neighbor is NOT a valid attack tile, and the
// hero must actually be able to stand on the goal tile — matches the production
// heroCanReachBoss semantics so the test can actually detect entombment.
function canStillReachBoss(s: GameState): boolean {
  const tiles = s.mapData.tiles;
  const boss = s.enemies![0];
  const blocked = (y: number, x: number) => {
    if (y < 0 || x < 0 || y >= tiles.length || x >= tiles[0].length) return true;
    if (tiles[y][x] === 1) return true; // wall (permanent); lava is coolable so NOT blocked
    return (s.mapData.subtypes[y]?.[x] ?? []).includes(TileSubtype.OPEN_ABYSS);
  };
  const goals = new Set<string>();
  for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
    const gy = boss.y + dy;
    const gx = boss.x + dx;
    if (!blocked(gy, gx)) goals.add(`${gy},${gx}`); // only standable attack tiles
  }
  if (goals.size === 0) return false; // boss sealed in
  const [hy, hx] = findHero(s);
  if (goals.has(`${hy},${hx}`)) return true;
  const seen = new Set([`${hy},${hx}`]);
  const q: Array<[number, number]> = [[hy, hx]];
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const ny = y + dy;
      const nx = x + dx;
      const k = `${ny},${nx}`;
      if (seen.has(k) || blocked(ny, nx)) continue;
      if (goals.has(k)) return true; // reached a standable attack tile
      seen.add(k);
      q.push([ny, nx]);
    }
  }
  return false;
}
// Structural backstop, independent of the BFS oracle: the boss must always have
// at least one orthogonal neighbor that is not a wall and not an abyss, i.e. a
// tile the hero could stand on to melee it. Fails loudly if the boss is entombed.
function bossHasStandableNeighbor(s: GameState): boolean {
  const b = s.enemies![0];
  return ([[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>).some(([dy, dx]) => {
    const ny = b.y + dy;
    const nx = b.x + dx;
    if (s.mapData.tiles[ny]?.[nx] === 1) return false;
    return !(s.mapData.subtypes[ny]?.[nx] ?? []).includes(TileSubtype.OPEN_ABYSS);
  });
}
// Move the hero one BFS step toward the boss, avoiding walls and lava; bump a
// wall (no-op) if boxed for the moment.
function stepTowardBoss(s: GameState): Direction {
  const tiles = s.mapData.tiles;
  const subs = s.mapData.subtypes;
  const boss = s.enemies![0];
  const [hy, hx] = findHero(s);
  const passable = (y: number, x: number) => {
    if (y < 0 || x < 0 || y >= tiles.length || x >= tiles[0].length) return false;
    if (tiles[y][x] !== 0 && tiles[y][x] !== 5) return false;
    const c = subs[y]?.[x] ?? [];
    if (c.includes(TileSubtype.LAVA) && !c.includes(TileSubtype.OBSIDIAN)) return false;
    if (c.includes(TileSubtype.OPEN_ABYSS)) return false;
    return true;
  };
  const goals = new Set(
    [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dy, dx]) => `${boss.y + dy},${boss.x + dx}`)
  );
  // BFS recording the first step taken from the hero.
  const q: Array<{ y: number; x: number; first: Direction | null }> = [{ y: hy, x: hx, first: null }];
  const seen = new Set([`${hy},${hx}`]);
  const dirs: Array<[number, number, Direction]> = [
    [-1, 0, Direction.UP], [1, 0, Direction.DOWN], [0, -1, Direction.LEFT], [0, 1, Direction.RIGHT],
  ];
  while (q.length) {
    const cur = q.shift()!;
    for (const [dy, dx, dir] of dirs) {
      const ny = cur.y + dy;
      const nx = cur.x + dx;
      const first = cur.first ?? dir;
      if (goals.has(`${ny},${nx}`)) return first; // step toward an adjacent-to-boss tile
      if (seen.has(`${ny},${nx}`) || !passable(ny, nx)) continue;
      seen.add(`${ny},${nx}`);
      q.push({ y: ny, x: nx, first });
    }
  }
  return Direction.UP; // boxed for now (bump)
}

function mulberryish(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function countSubtype(s: GameState, sub: number): number {
  let c = 0;
  for (const row of s.mapData.subtypes) for (const cell of row) if (cell.includes(sub)) c++;
  return c;
}
function findHero(s: GameState): [number, number] {
  const subs = s.mapData.subtypes;
  for (let y = 0; y < subs.length; y++)
    for (let x = 0; x < subs[y].length; x++)
      if (subs[y][x].includes(TileSubtype.PLAYER)) return [y, x];
  throw new Error("hero not found");
}

describe("the Shaper can never wall ITSELF in (real keep)", () => {
  test("across many full fights in the actual arena it always leaves a way to it", () => {
    let sawWalls = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s = buildShaperArena(
        SHAPER_LAYOUTS[seed % 2],
        SHAPER_ENTRIES[seed % 4],
        mulberryish(seed)
      );
      forceStrat(s, "wall"); // force the wall brain for every one of these fights
      s.combatRng = mulberryish(seed * 7 + 3);
      const wallsAtStart = countWalls(s);
      for (let t = 0; t < 60; t++) {
        if ((s.enemies ?? []).length === 0) break; // slain -> it was reachable
        // The boss always has a tile you could stand on to hit it...
        expect(bossHasStandableNeighbor(s)).toBe(true);
        // ...and that tile is still reachable from wherever the hero is.
        expect(canStillReachBoss(s)).toBe(true);
        s = movePlayer(s, stepTowardBoss(s));
        if (s.heroHealth <= 0) break;
      }
      if (countWalls(s) > wallsAtStart) sawWalls++;
    }
    // Confirm the fights actually exercised wall-building (not a vacuous pass).
    expect(sawWalls).toBeGreaterThan(0);
  });

  test("it never entombs itself even when already boxed on three sides", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = buildShaperArena(SHAPER_LAYOUTS[0], "south", mulberryish(seed));
      const boss = s.enemies!.find((e) => e.kind === "shaper")!;
      // Pre-wall three of its four neighbours; the last one must survive.
      const around: Array<[number, number]> = [
        [boss.y - 1, boss.x],
        [boss.y + 1, boss.x],
        [boss.y, boss.x - 1],
      ];
      for (const [wy, wx] of around) s.mapData.tiles[wy][wx] = 1;
      forceStrat(s, "wall");
      s.combatRng = seed === 1 ? () => 0.5 : mulberryish(seed);
      let cur = s;
      for (let t = 0; t < 15; t++) {
        cur = movePlayer(cur, stepTowardBoss(cur));
        if ((cur.enemies ?? []).length === 0 || cur.heroHealth <= 0) break;
        expect(bossHasStandableNeighbor(cur)).toBe(true);
      }
    }
  });
});
