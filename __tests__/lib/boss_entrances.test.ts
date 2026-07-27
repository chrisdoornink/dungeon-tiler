import { movePlayer, Direction, TileSubtype } from "../../lib/map";
import { performThrowRock } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { buildOutsideWorld } from "../../lib/map/outside-world";
import {
  buildMoatApproach,
  buildDousePortalApproach,
  buildBombOutsideApproach,
} from "../../lib/bosses/boss_entrances";

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

describe("outside-world boss entrance", () => {
  test("bossEntrance:true carves an opening and places a BOSS_ENTRANCE in the far tree wall", () => {
    // Stepping UP out of the dungeon -> inner edge is the bottom, far wall the top.
    const { mapData } = buildOutsideWorld(Direction.UP, 15, 15, { bossEntrance: true });
    let found: [number, number] | null = null;
    for (let y = 0; y < mapData.subtypes.length; y++)
      for (let x = 0; x < mapData.subtypes[y].length; x++)
        if (mapData.subtypes[y][x].includes(TileSubtype.BOSS_ENTRANCE)) found = [y, x];
    expect(found).not.toBeNull();
    // The carve runs through the far (top) tree border, so the entrance's column is FLOOR.
    const [ey, ex] = found!;
    expect(mapData.tiles[ey][ex]).toBe(0);
    expect(mapData.tiles[ey + 1][ex]).toBe(0); // path punched through the border
  });

  test("without the flag, no boss entrance is carved", () => {
    const { mapData } = buildOutsideWorld(Direction.UP, 15, 15);
    const any = mapData.subtypes.some((row) =>
      row.some((cell) => cell.includes(TileSubtype.BOSS_ENTRANCE))
    );
    expect(any).toBe(false);
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

    const bomb = buildBombOutsideApproach();
    expect(bomb.bombCount).toBe(3);
    expect(bomb.outsideHasBossEntrance).toBe(true);
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
});
