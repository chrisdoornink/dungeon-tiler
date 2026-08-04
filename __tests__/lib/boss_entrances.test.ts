import { Enemy } from "../../lib/enemy";
import { movePlayer, Direction, TileSubtype } from "../../lib/map";
import { performThrowRock } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { buildOutsideWorld } from "../../lib/map/outside-world";
import {
  buildMoatApproach,
  buildDousePortalApproach,
  buildBombSealApproach,
  stampBossEntranceOnFloor,
} from "../../lib/bosses/boss_entrances";
import { generateCompleteMapForFloor, rollWaterPlan } from "../../lib/map/map-features";

const SHAPER_ARENA_SIZE = 25;

// A small walled room with the hero at (2,1) and an open interior.
function miniRoom(extra: Partial<GameState> = {}): GameState {
  const tiles = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  const subtypes: number[][][] = tiles.map((row) => row.map(() => [] as number[]));
  subtypes[2][1] = [TileSubtype.PLAYER];
  return {
    hasKey: false, hasExitKey: false, hasSword: true, hasShield: false,
    showFullMap: true, win: false, playerDirection: Direction.RIGHT,
    enemies: [], heroHealth: 5, heroMaxHealth: 5, heroAttack: 1, heroTorchLit: true,
    rockCount: 0, runeCount: 0, foodCount: 0, potionCount: 0,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
    ...extra,
  } as GameState;
}

function findHero(s: GameState): [number, number] {
  const subs = s.mapData.subtypes;
  for (let y = 0; y < subs.length; y++)
    for (let x = 0; x < subs[y].length; x++)
      if (subs[y][x].includes(TileSubtype.PLAYER)) return [y, x];
  return [-1, -1];
}

function findSubtype(s: GameState, sub: number): [number, number] | null {
  const subs = s.mapData.subtypes;
  for (let y = 0; y < subs.length; y++)
    for (let x = 0; x < subs[y].length; x++)
      if (subs[y][x].includes(sub)) return [y, x];
  return null;
}

// Tiles reachable from a start over DRY ground (walls + lava + deep water block).
function dryReachableFrom(s: GameState, start: [number, number]): Set<string> {
  const T = s.mapData.tiles;
  const S = s.mapData.subtypes;
  const H = T.length;
  const W = T[0].length;
  const pass = (y: number, x: number) => {
    if (y < 0 || x < 0 || y >= H || x >= W) return false;
    if (T[y][x] === 1) return false; // wall
    const c = S[y]?.[x] ?? [];
    return !(
      c.includes(TileSubtype.LAVA) ||
      c.includes(TileSubtype.DEEP_WATER) ||
      c.includes(TileSubtype.OPEN_ABYSS)
    );
  };
  const seen = new Set<string>([`${start[0]},${start[1]}`]);
  const q: Array<[number, number]> = [start];
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const ny = y + dy;
      const nx = x + dx;
      const k = `${ny},${nx}`;
      if (seen.has(k) || !pass(ny, nx)) continue;
      seen.add(k);
      q.push([ny, nx]);
    }
  }
  return seen;
}

describe("boss-room entrance warps", () => {
  test("stepping onto a BOSS_ENTRANCE warps into the Shaper arena", () => {
    const s = miniRoom();
    s.mapData.subtypes[2][2] = [TileSubtype.BOSS_ENTRANCE];
    const after = movePlayer(s, Direction.RIGHT);
    expect(after.inBossRoom).toBe(true);
    expect(after.reachedBossRoom).toBe(true);
    // The map became the 25x25 arena with a shaper waiting.
    expect(after.mapData.tiles.length).toBe(SHAPER_ARENA_SIZE);
    expect((after.enemies ?? []).some((e) => e.kind === "shaper")).toBe(true);
  });

  test("a CAVE_OPENING does NOT warp (story-mode safety)", () => {
    const s = miniRoom();
    s.mapData.subtypes[2][2] = [TileSubtype.CAVE_OPENING];
    const after = movePlayer(s, Direction.RIGHT);
    expect(after.inBossRoom).toBeFalsy();
    expect(after.mapData.tiles.length).toBe(5); // still the little room
  });

  test("a DARK_PORTAL is inert while the torch is LIT", () => {
    const s = miniRoom({ heroTorchLit: true });
    s.mapData.subtypes[2][2] = [TileSubtype.DARK_PORTAL];
    const after = movePlayer(s, Direction.RIGHT);
    expect(after.inBossRoom).toBeFalsy();
    expect(after.mapData.tiles.length).toBe(5);
    // The hero stepped onto the portal tile, and the portal survives for later.
    expect(findHero(after)).toEqual([2, 2]);
    expect(after.mapData.subtypes[2][2]).toContain(TileSubtype.DARK_PORTAL);
  });

  test("a DARK_PORTAL warps once the torch is OUT", () => {
    const s = miniRoom({ heroTorchLit: false });
    s.mapData.subtypes[2][2] = [TileSubtype.DARK_PORTAL];
    const after = movePlayer(s, Direction.RIGHT);
    expect(after.inBossRoom).toBe(true);
    expect(after.mapData.tiles.length).toBe(SHAPER_ARENA_SIZE);
  });
});

describe("moat crossing mechanics (controlled)", () => {
  test("stepping into uncooled lava kills the hero", () => {
    const s = miniRoom();
    s.mapData.subtypes[2][2] = [TileSubtype.LAVA];
    const after = movePlayer(s, Direction.RIGHT); // hero (2,1) -> lava (2,2)
    expect(after.heroHealth).toBe(0);
    expect(after.deathCause?.type).toBe("lava");
  });

  test("cooling the lava edge with a rock makes it crossable", () => {
    const s = miniRoom({ rockCount: 3 }); // facing RIGHT by default
    s.mapData.subtypes[2][2] = [TileSubtype.LAVA];
    const thrown = performThrowRock(s); // cools (2,2) lava -> obsidian
    expect(thrown.mapData.subtypes[2][2]).toContain(TileSubtype.OBSIDIAN);
    const stepOn = movePlayer(thrown, Direction.RIGHT);
    expect(stepOn.heroHealth).toBeGreaterThan(0);
    expect(findHero(stepOn)).toEqual([2, 2]);
  });

  test("wading deep water snuffs the torch", () => {
    const s = miniRoom({ heroTorchLit: true });
    s.mapData.subtypes[2][2] = [TileSubtype.DEEP_WATER];
    const after = movePlayer(s, Direction.RIGHT);
    expect(findHero(after)).toEqual([2, 2]);
    expect(after.heroTorchLit).toBe(false);
  });
});

describe("moat approach in a real Level-3 room", () => {
  test("stamps the chosen element + a cave mouth into a genuine L3 layout", () => {
    for (const el of ["lava", "water"] as const) {
      const s = buildMoatApproach(el);
      // A real floor-3 grid (much larger than the little test rooms).
      expect(s.mapData.tiles.length).toBeGreaterThanOrEqual(20);
      const cells = s.mapData.subtypes.flat();
      const elementSub = el === "lava" ? TileSubtype.LAVA : TileSubtype.DEEP_WATER;
      expect(cells.some((c) => c.includes(elementSub))).toBe(true);
      expect(cells.some((c) => c.includes(TileSubtype.BOSS_ENTRANCE))).toBe(true);
      // The generator still placed the hero and the floor's exit + key.
      expect(findHero(s)[0]).toBeGreaterThanOrEqual(0);
      expect(cells.some((c) => c.includes(TileSubtype.EXIT))).toBe(true);
      expect(s.rockCount).toBeGreaterThanOrEqual(8);
      expect(s.bossArenaSeed).toBe(el);
    }
  });

  test("lava crossing is a straight spur that ONLY gates the secret", () => {
    for (let i = 0; i < 8; i++) {
      const s = buildMoatApproach("lava");
      const entrance = findSubtype(s, TileSubtype.BOSS_ENTRANCE);
      expect(entrance).not.toBeNull();
      const [ey, ex] = entrance!;
      // You reach the entrance by crossing lava: a neighbor of it is lava.
      const gatedByLava = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>).some(
        ([dy, dx]) => s.mapData.subtypes[ey + dy]?.[ex + dx]?.includes(TileSubtype.LAVA)
      );
      expect(gatedByLava).toBe(true);
      // The entrance is NOT reachable over dry ground (it is gated by the lava)...
      const dry = dryReachableFrom(s, findHero(s));
      expect(dry.has(`${ey},${ex}`)).toBe(false);
      // ...but the room's normal exit is still approachable (nothing legit walled
      // off). The exit is a wall-door, so check a neighbor is dry-reachable.
      const exit = findSubtype(s, TileSubtype.EXIT);
      if (exit) {
        const [exy, exx] = exit;
        const approachable = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>).some(
          ([dy, dx]) => dry.has(`${exy + dy},${exx + dx}`)
        );
        expect(approachable).toBe(true);
      }
    }
  });
});

describe("outside world is no longer a boss route", () => {
  // The old bomb entrance carved a cave mouth through the far tree wall. Once players
  // knew it was there, bombing ANY outer wall reached the boss, so the secret was gone.
  // The outside world is now a dead end again; the boss sits behind a sealed doorway.
  test("carves no boss entrance in any direction", () => {
    for (const dir of [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT]) {
      const { mapData } = buildOutsideWorld(dir, 15, 15);
      const any = mapData.subtypes.some((row) =>
        row.some((cell) => cell.includes(TileSubtype.BOSS_ENTRANCE))
      );
      expect(any).toBe(false);
    }
  });
});

describe("approach builders are valid playable states", () => {
  test("each builder places the hero and an entrance/bomb kit", () => {
    const douse = buildDousePortalApproach();
    expect(findHero(douse)[0]).toBeGreaterThanOrEqual(0);
    const hasPortal = douse.mapData.subtypes.some((r) =>
      r.some((c) => c.includes(TileSubtype.DARK_PORTAL))
    );
    expect(hasPortal).toBe(true);
    expect(douse.showFullMap).toBe(false); // fog on so the dark reveal renders

    const bomb = buildBombSealApproach();
    expect(bomb.bombCount).toBe(3);
    expect(findHero(bomb)[0]).toBeGreaterThanOrEqual(0);
    // A sealed doorway + its decoys, and a payload recorded for each one.
    const seals = bomb.mapData.subtypes
      .flat()
      .filter((c) => c.includes(TileSubtype.WALL_SEAL));
    expect(seals.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(bomb.sealPayloads ?? {}).length).toBe(seals.length);
    expect(Object.values(bomb.sealPayloads ?? {})).toContain("boss");
  });
});

function ghostCount(s: GameState): number {
  return (s.enemies ?? []).filter((e) => e.kind === "ghost").length;
}

describe("douse portal in an L3-sized room, with ghosts", () => {
  test("is a real L3 room with deep water to wade, a dark portal, and 3 ghosts", () => {
    for (let i = 0; i < 5; i++) {
      const s = buildDousePortalApproach();
      // Real floor-3 grid, not the old compact hand-built room.
      expect(s.mapData.tiles.length).toBeGreaterThanOrEqual(20);
      const cells = s.mapData.subtypes.flat();
      expect(cells.some((c) => c.includes(TileSubtype.DEEP_WATER))).toBe(true); // torch-snuffer
      expect(cells.some((c) => c.includes(TileSubtype.DARK_PORTAL))).toBe(true);
      expect(ghostCount(s)).toBe(3);
    }
  });

  test("both moat types also carry 3 ghosts", () => {
    expect(ghostCount(buildMoatApproach("lava"))).toBe(3);
    expect(ghostCount(buildMoatApproach("water"))).toBe(3);
  });

  test("the room keeps its real wall torches", () => {
    // It used to be built with wallTorches: 0, which made it dark by construction and so
    // the one arrangement that cannot reproduce a torch pinning the portal off.
    const lit = Array.from({ length: 6 }, () => buildDousePortalApproach()).filter((s) =>
      s.mapData.subtypes.flat().some((c) => c.includes(TileSubtype.WALL_TORCH))
    );
    expect(lit.length).toBeGreaterThan(0);
  });
});

/**
 * Would ending a move on (y,x) relight a doused torch? An INDEPENDENT restatement of the
 * two rules in movePlayer (orthogonally adjacent to a WALL_TORCH; anywhere inside a LAVA
 * tile's glow octagon — Chebyshev 2 minus the far corners), deliberately not sharing code
 * with the generator so this fails if the generator's own predicate is wrong. Deep water
 * snuffs the torch and overrides every relight source.
 */
function relightsAt(map: GameState["mapData"], y: number, x: number): boolean {
  const at = (yy: number, xx: number) => map.subtypes[yy]?.[xx] ?? [];
  if (at(y, x).includes(TileSubtype.DEEP_WATER)) return false;
  for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (at(y + dy, x + dx).includes(TileSubtype.WALL_TORCH)) return true;
  }
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dy === 0 && dx === 0) continue;
      if (Math.abs(dy) === 2 && Math.abs(dx) === 2) continue; // octagon, not a 5x5 square
      if (at(y + dy, x + dx).includes(TileSubtype.LAVA)) return true;
    }
  }
  return false;
}

/** Tiles reachable from `seeds` without ever ending a step somewhere that relights. */
function darkReachable(
  map: GameState["mapData"],
  seeds: Array<[number, number]>
): Set<string> {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const pass = (y: number, x: number) => {
    if (y < 0 || x < 0 || y >= H || x >= W) return false;
    if (map.tiles[y][x] === 1) return false; // wall
    const c = map.subtypes[y]?.[x] ?? [];
    if (c.includes(TileSubtype.LAVA) || c.includes(TileSubtype.OPEN_ABYSS)) return false;
    return !relightsAt(map, y, x);
  };
  const seen = new Set<string>();
  const q: Array<[number, number]> = [];
  for (const [y, x] of seeds) {
    if (!pass(y, x) || seen.has(`${y},${x}`)) continue;
    seen.add(`${y},${x}`);
    q.push([y, x]);
  }
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const k = `${y + dy},${x + dx}`;
      if (seen.has(k) || !pass(y + dy, x + dx)) continue;
      seen.add(k);
      q.push([y + dy, x + dx]);
    }
  }
  return seen;
}

function findAll(map: GameState["mapData"], sub: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < map.subtypes.length; y++)
    for (let x = 0; x < map.subtypes[y].length; x++)
      if (map.subtypes[y][x].includes(sub)) out.push([y, x]);
  return out;
}

/**
 * The invariant that makes a douse day playable at all.
 *
 * A DARK_PORTAL only warps while the torch is OUT, the pool is the only REPEATABLE way to
 * put it out (an adjacent ghost snuffs the torch and then vanishes, so the three ghosts are
 * one-shot douses a player can spend anywhere), and a single wall torch beside the only
 * corridor back relights the hero and leaves the portal inert. So: there must be a route
 * from the water to the portal on which the torch never comes back.
 *
 * This is the bug that shipped — the old placement only checked the portal's own 3x3.
 */
describe("a douse day's portal is reachable IN THE DARK", () => {
  function assertDarkPathToPortal(map: GameState["mapData"]) {
    const water = findAll(map, TileSubtype.DEEP_WATER);
    expect(water.length).toBeGreaterThan(0);
    const portals = findAll(map, TileSubtype.DARK_PORTAL);
    expect(portals).toHaveLength(1);

    // The hero must be able to get to the pool in the first place (torch lit, wading ok).
    const hero = findAll(map, TileSubtype.PLAYER)[0];
    const wet = dryReachableFrom({ mapData: map } as GameState, hero);
    const touchesPool = water.some(([wy, wx]) =>
      [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dy, dx]) => wet.has(`${wy + dy},${wx + dx}`))
    );
    expect(touchesPool).toBe(true);

    // ...and then walk pool -> portal without ever relighting.
    const dark = darkReachable(map, water);
    const [py, px] = portals[0];
    expect(dark.has(`${py},${px}`)).toBe(true);
  }

  // Both sweeps are deliberately long. The rule this replaced left the portal
  // unreachable on ~6% of generated floor 3s, so a handful of iterations would catch a
  // regression only about half the time; 40 + 60 puts detection over 99%.
  test("holds for the harness room, torches and all", () => {
    for (let i = 0; i < 40; i++) {
      assertDarkPathToPortal(buildDousePortalApproach().mapData);
    }
  });

  test("holds when stamped onto a daily floor 3, water and lava and all", () => {
    for (let i = 0; i < 60; i++) {
      // Same terrain options the daily passes (game-state.ts): floor 3 always rolls for
      // lava, and water is a weighted size tier. Both change the pool geometry the dark
      // route has to thread, so a sweep without them is not the production case.
      const map = generateCompleteMapForFloor(
        { chests: 0, keys: 0, chestContents: [] },
        3,
        { includeLava: true, waterPlan: rollWaterPlan(3) ?? undefined }
      );
      const { placed } = stampBossEntranceOnFloor(map, "douse");
      // Never bail: a bossless day would rewrite what past dates replay to
      // (lib/stats/boss_day.ts reads entranceKind straight off the regenerated floor).
      expect(placed).toBe(true);
      assertDarkPathToPortal(map);
    }
  });

  test("the portal itself never sits on a tile that relights", () => {
    for (let i = 0; i < 8; i++) {
      const map = buildDousePortalApproach().mapData;
      const [py, px] = findAll(map, TileSubtype.DARK_PORTAL)[0];
      expect(relightsAt(map, py, px)).toBe(false);
    }
  });
});

describe("boss room as an ALTERNATE ENDING", () => {
  // A daily-like floor 3 with a boss entrance next to the hero.
  function dailyFloorWithEntrance(): GameState {
    const s = miniRoom({
      currentFloor: 3,
      maxFloors: 3,
      mode: "daily" as unknown as GameState["mode"],
      hasExitKey: false,
      stats: { damageDealt: 4, damageTaken: 2, enemiesDefeated: 7, steps: 33 },
    });
    s.mapData.subtypes[2][2] = [TileSubtype.BOSS_ENTRANCE];
    return s;
  }

  test("entering preserves the run (stats, floor, mode) and stashes a way back", () => {
    const before = dailyFloorWithEntrance();
    const after = movePlayer(before, Direction.RIGHT);
    expect(after.inBossRoom).toBe(true);
    // The run is intact — entering must not reset the daily.
    expect(after.currentFloor).toBe(3);
    expect(after.maxFloors).toBe(3);
    expect(after.mode).toBe(before.mode);
    expect(after.stats.steps).toBeGreaterThanOrEqual(33);
    expect(after.stats.enemiesDefeated).toBe(7);
    // And there's a stashed floor to come back to.
    expect(after.bossReturn).toBeTruthy();
    expect(after.bossReturn!.position).toEqual([2, 2]);
  });

  test("the arena has a locked exit and the boss waiting", () => {
    const after = movePlayer(dailyFloorWithEntrance(), Direction.RIGHT);
    const cells = after.mapData.subtypes.flat();
    expect(cells.some((c) => c.includes(TileSubtype.EXIT))).toBe(true);
    expect((after.enemies ?? []).some((e) => e.kind === "shaper")).toBe(true);
    expect(after.hasExitKey).toBe(false); // the exit is not yet openable
  });

  test("walking back onto the arrival tile returns to the floor", () => {
    const entered = movePlayer(dailyFloorWithEntrance(), Direction.RIGHT);
    const [ay, ax] = findHero(entered);
    // The arrival tile doubles as the way out.
    expect(entered.mapData.subtypes[ay][ax]).toContain(TileSubtype.BOSS_ENTRANCE);
    // Step off, then back on.
    const off = movePlayer(entered, Direction.UP);
    const back = movePlayer(off, Direction.DOWN);
    expect(back.inBossRoom).toBeFalsy();
    expect(back.mapData.tiles.length).toBe(5); // the little floor is restored
    expect(back.currentFloor).toBe(3);
  });

  // A compact stand-in arena: hero beside a nearly-dead Shaper, plus a locked exit.
  function arenaShowdown(): GameState {
    const s = miniRoom({
      inBossRoom: true,
      currentFloor: 3,
      maxFloors: 3,
      hasSword: true,
      heroAttack: 1,
    });
    const boss = new Enemy({ y: 2, x: 2 });
    boss.kind = "shaper";
    boss.health = 1;
    s.enemies = [boss];
    // The keep's exit is a doorway on the FLOOR (as buildShaperArena places it).
    s.mapData.subtypes[2][4] = [TileSubtype.EXIT];
    return s;
  }

  test("killing the Shaper drops the gold key", () => {
    const after = movePlayer(arenaShowdown(), Direction.RIGHT); // strike it down
    expect((after.enemies ?? []).some((e) => e.kind === "shaper")).toBe(false);
    expect(after.bossDefeated).toBe(true);
    const cells = after.mapData.subtypes.flat();
    expect(cells.some((c) => c.includes(TileSubtype.EXITKEY))).toBe(true);
    // And the kill is tallied for the end-of-day casualties.
    expect(after.stats.byKind?.shaper).toBe(1);
  });

  test("the gold key opens the arena exit and WINS the run outright", () => {
    let s = movePlayer(arenaShowdown(), Direction.RIGHT); // strike: boss dies, key drops
    s = movePlayer(s, Direction.RIGHT); // step onto the key tile at (2,2)
    expect(s.hasExitKey).toBe(true);
    s = movePlayer(s, Direction.RIGHT); // walk to (2,3)
    s = movePlayer(s, Direction.RIGHT); // into the exit wall at (2,4)
    expect(s.win).toBe(true);
    // Crucially it does NOT try to advance a floor — this is the ending.
    expect(s.needsFloorTransition).toBeFalsy();
  });
});

describe("carrying the level-3 gold key into the keep", () => {
  test("the key you already hold DOES open the keep's exit (a valid boss bypass)", () => {
    const s = miniRoom({
      inBossRoom: true,
      currentFloor: 3,
      maxFloors: 3,
      hasExitKey: true, // picked up on floor 3 before finding the entrance
    });
    // A live Shaper is still standing; the exit is a wall tile two steps away.
    const boss = new Enemy({ y: 1, x: 1 });
    boss.kind = "shaper";
    s.enemies = [boss];
    s.mapData.subtypes[2][4] = [TileSubtype.EXIT]; // floor doorway, as in the real keep

    let out = movePlayer(s, Direction.RIGHT); // (2,2)
    out = movePlayer(out, Direction.RIGHT); // (2,3)
    out = movePlayer(out, Direction.RIGHT); // into the exit
    expect(out.win).toBe(true);
    // Skipping the kill is allowed: no boss key was needed and none was dropped.
    expect(out.bossDefeated).toBeFalsy();
  });

  test("entering the keep preserves a key you already had", () => {
    const s = miniRoom({ hasExitKey: true });
    s.mapData.subtypes[2][2] = [TileSubtype.BOSS_ENTRANCE];
    const after = movePlayer(s, Direction.RIGHT);
    expect(after.inBossRoom).toBe(true);
    expect(after.hasExitKey).toBe(true);
  });
});
