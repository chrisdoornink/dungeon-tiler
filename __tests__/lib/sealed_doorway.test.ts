import {
  detonateLiveBombs,
  movePlayer,
  performThrowBomb,
  type GameState,
} from "../../lib/map/game-state";
import { Direction, FLOOR, WALL, TileSubtype } from "../../lib/map/constants";
import type { MapData, SealPayload } from "../../lib/map/types";
import {
  MAX_DECOY_SEALS,
  rollDecoySealCount,
  sealCoords,
  stampDecoySeals,
  stampSealedDoorway,
} from "../../lib/bosses/boss_entrances";
import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
} from "../../lib/map/game-state";
import { generateCompleteMapForFloor } from "../../lib/map/map-features";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";

function baseState(mapData: MapData, overrides: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.UP,
    enemies: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 0,
    runeCount: 0,
    foodCount: 0,
    potionCount: 0,
    bombCount: 3,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData,
    recentDeaths: [],
    mode: "normal",
    ...overrides,
  } as GameState;
}

/**
 * A 9x9 arena with a sealed doorway in the wall row at y=3: torch at (3,3), seal at
 * (3,4), torch at (3,5). The hero starts two tiles below the seal at (5,4) facing up, so
 * a thrown bomb comes to rest on (4,4) — directly in front of the seal.
 */
function sealArena(payload: SealPayload): GameState {
  const size = 9;
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < size; y++) {
    tiles.push(
      Array.from({ length: size }, (_, x) =>
        y === 0 || x === 0 || y === size - 1 || x === size - 1 ? WALL : FLOOR
      )
    );
    subtypes.push(Array.from({ length: size }, () => [] as number[]));
  }
  // A one-tile-thick interior wall run at y=3 with floor below it (a faced wall).
  for (let x = 1; x < size - 1; x++) tiles[3][x] = WALL;
  subtypes[3][3] = [TileSubtype.WALL_TORCH];
  subtypes[3][4] = [TileSubtype.WALL_SEAL];
  subtypes[3][5] = [TileSubtype.WALL_TORCH];
  subtypes[5][4] = [TileSubtype.PLAYER];

  return baseState(
    { tiles, subtypes },
    { sealPayloads: { "3,4": payload }, playerDirection: Direction.UP }
  );
}

/** Throw upward and resolve the fuse. */
function bombTheSeal(state: GameState): GameState {
  return detonateLiveBombs(performThrowBomb(state));
}

describe("sealed doorway — blowing it open", () => {
  it("opens the real seal into a BOSS_ENTRANCE cave mouth", () => {
    const blown = bombTheSeal(sealArena("boss"));

    expect(blown.mapData.tiles[3][4]).toBe(FLOOR);
    expect(blown.mapData.subtypes[3][4]).toContain(TileSubtype.BOSS_ENTRANCE);
    expect(blown.mapData.subtypes[3][4]).not.toContain(TileSubtype.WALL_SEAL);
    // The reward reads cleanly — no scorch decal fighting the cave mouth.
    expect(blown.mapData.subtypes[3][4]).not.toContain(TileSubtype.SINGED);
    // Payload consumed, so a second blast on the same tile can't mint another entrance.
    expect(blown.sealPayloads?.["3,4"]).toBeUndefined();
  });

  it("leaves both bracketing torches standing, so the motif survives the blast", () => {
    const blown = bombTheSeal(sealArena("boss"));

    for (const x of [3, 5]) {
      expect(blown.mapData.tiles[3][x]).toBe(WALL);
      expect(blown.mapData.subtypes[3][x]).toContain(TileSubtype.WALL_TORCH);
    }
    // Exactly one wall came down: the seal itself.
    expect(blown.stats.wallsDestroyed).toBe(1);
  });

  it("opens a decoy into a pot holding pink-realm fruit", () => {
    const blown = bombTheSeal(sealArena("berry"));

    expect(blown.mapData.tiles[3][4]).toBe(FLOOR);
    expect(blown.mapData.subtypes[3][4]).toContain(TileSubtype.POT);
    expect(blown.mapData.subtypes[3][4]).not.toContain(TileSubtype.BOSS_ENTRANCE);
    // The pot is pre-loaded with the berry rather than rolling random contents.
    expect(blown.potOverrides?.["3,4"]).toBe(TileSubtype.BERRY);
  });

  it("a food decoy loads ordinary food instead", () => {
    const blown = bombTheSeal(sealArena("food"));
    expect(blown.potOverrides?.["3,4"]).toBe(TileSubtype.FOOD);
  });

  it("walking into the opened decoy pot yields the fruit", () => {
    let s = bombTheSeal(sealArena("berry"));
    // Hero is at (5,4); step up onto (4,4), then bump the pot at (3,4) to open it.
    s = movePlayer(s, Direction.UP);
    s = movePlayer(s, Direction.UP);
    expect(s.mapData.subtypes[3][4]).toContain(TileSubtype.BERRY);
    expect(s.mapData.subtypes[3][4]).not.toContain(TileSubtype.POT);
    // Then step onto it to collect.
    s = movePlayer(s, Direction.UP);
    expect(s.berryCount).toBe(1);
  });

  it("a seal on the boundary row opens inward, not out to the grassland", () => {
    // The fallback site is the map's top wall row, where a blasted wall normally earns a
    // BREACH tag and walks the hero outside. A doorway must lead to what was behind it.
    const state = sealArena("boss");
    // Re-home the seal onto row 0 (the perimeter) with the hero below it.
    state.mapData.subtypes[3][4] = [];
    state.mapData.subtypes[0][4] = [TileSubtype.WALL_SEAL];
    state.mapData.tiles[3][4] = FLOOR;
    state.mapData.subtypes[5][4] = [];
    state.mapData.subtypes[2][4] = [TileSubtype.PLAYER];
    state.sealPayloads = { "0,4": "boss" };

    const blown = bombTheSeal(state);
    expect(blown.mapData.subtypes[0][4]).toContain(TileSubtype.BOSS_ENTRANCE);
    expect(blown.mapData.subtypes[0][4]).not.toContain(TileSubtype.BREACH);
  });

  it("a seal with no recorded payload just becomes plain floor", () => {
    // Defensive: a stale save without sealPayloads must not crash or mint a free boss door.
    const state = sealArena("boss");
    const blown = bombTheSeal({ ...state, sealPayloads: undefined });
    expect(blown.mapData.tiles[3][4]).toBe(FLOOR);
    expect(blown.mapData.subtypes[3][4]).not.toContain(TileSubtype.BOSS_ENTRANCE);
    expect(blown.mapData.subtypes[3][4]).not.toContain(TileSubtype.POT);
  });
});

describe("sealed doorway — placement rules", () => {
  function floor3(seed: number): MapData {
    return withPatchedMathRandom(mulberry32(seed), () =>
      generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, 3)
    );
  }

  function sealsOf(map: MapData): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < map.subtypes.length; y++)
      for (let x = 0; x < map.subtypes[y].length; x++)
        if (map.subtypes[y][x].includes(TileSubtype.WALL_SEAL)) out.push([y, x]);
    return out;
  }

  /** Stamp the doorway then the max decoys, the way the harness does. */
  function stampBoth(seed: number) {
    const map = floor3(seed);
    const payloads = withPatchedMathRandom(mulberry32(seed * 31), () => {
      const real = stampSealedDoorway(map);
      if (!real) return null;
      return {
        ...real,
        ...stampDecoySeals(map, MAX_DECOY_SEALS, sealCoords(real)),
      };
    });
    return { map, payloads };
  }

  it("only ever seals a wall with FLOOR below it (the only wall with a visible face)", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { map, payloads } = stampBoth(seed);
      if (!payloads) continue;
      for (const [y, x] of sealsOf(map)) {
        expect(map.tiles[y][x]).toBe(WALL);
        expect(map.tiles[y + 1][x]).toBe(FLOOR);
      }
    }
  });

  it("brackets the real seal with two torches and keeps decoys well clear of any torch", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { map, payloads } = stampBoth(seed);
      if (!payloads) continue;

      const bossKeys = Object.entries(payloads).filter(([, p]) => p === "boss");
      expect(bossKeys).toHaveLength(1);
      const [by, bx] = bossKeys[0][0].split(",").map(Number);
      expect(map.subtypes[by][bx - 1]).toContain(TileSubtype.WALL_TORCH);
      expect(map.subtypes[by][bx + 1]).toContain(TileSubtype.WALL_TORCH);

      // A decoy must have no torch within 2 tiles, or the torch-pair tell breaks down.
      for (const [key, payload] of Object.entries(payloads)) {
        if (payload === "boss") continue;
        const [y, x] = key.split(",").map(Number);
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            expect(map.subtypes[y + dy]?.[x + dx] ?? []).not.toContain(
              TileSubtype.WALL_TORCH
            );
      }
    }
  });

  it("records a payload for every seal it stamps, and at least one fruit decoy", () => {
    let checked = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { map, payloads } = stampBoth(seed);
      if (!payloads) continue;
      checked++;
      expect(Object.keys(payloads).length).toBe(sealsOf(map).length);
      expect(Object.keys(payloads).length).toBeLessThanOrEqual(MAX_DECOY_SEALS + 1);
      // Every decoy is worth the bomb, and the first one is always pink-realm fruit.
      const decoys = Object.values(payloads).filter((p) => p !== "boss");
      if (decoys.length > 0) expect(decoys).toContain("berry");
      for (const p of Object.values(payloads))
        expect(["boss", "berry", "food"]).toContain(p);
    }
    expect(checked).toBeGreaterThan(20); // a site exists on the vast majority of floors
  });

  it("never overwrites the exit, its key, or a chest", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const map = floor3(seed);
      const before = JSON.stringify(map.subtypes);
      const protectedBefore = [
        TileSubtype.EXIT,
        TileSubtype.EXITKEY,
        TileSubtype.CHEST,
        TileSubtype.PLAYER,
      ].map((s) => (before.match(new RegExp(`\\b${s}\\b`, "g")) ?? []).length);
      withPatchedMathRandom(mulberry32(seed * 31), () => stampSealedDoorway(map));
      const after = JSON.stringify(map.subtypes);
      const protectedAfter = [
        TileSubtype.EXIT,
        TileSubtype.EXITKEY,
        TileSubtype.CHEST,
        TileSubtype.PLAYER,
      ].map((s) => (after.match(new RegExp(`\\b${s}\\b`, "g")) ?? []).length);
      expect(protectedAfter).toEqual(protectedBefore);
    }
  });

  it("is DETERMINISTIC — the same seed stamps the same seals and payloads", () => {
    for (const day of ["2026-08-03", "2026-09-19"]) {
      const seed = hashStringToSeed(day);
      const run = () => {
        const map = floor3(seed);
        const payloads = withPatchedMathRandom(mulberry32(seed), () => {
          const real = stampSealedDoorway(map);
          return real
            ? { ...real, ...stampDecoySeals(map, MAX_DECOY_SEALS, sealCoords(real)) }
            : null;
        });
        return { seals: sealsOf(map), payloads };
      };
      const a = run();
      const b = run();
      expect(a.seals).toEqual(b.seals);
      expect(a.payloads).toEqual(b.payloads);
    }
  });
});

describe("decoy cracks on every floor", () => {
  it("rolls 0, 1, or 2 — and actually produces all three over many days", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const n = withPatchedMathRandom(mulberry32(seed), () => rollDecoySealCount());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(MAX_DECOY_SEALS);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([0, 1, MAX_DECOY_SEALS]);
  });

  it("puts cracks on floor 1, where the hero has no bombs and can do nothing about them", () => {
    // The point of a floor-1 crack: it teaches the motif before it can ever be used.
    let floorsWithCracks = 0;
    let sawEmptyFloor = false;
    for (let i = 0; i < 40; i++) {
      const seed = hashStringToSeed(`2026-10-${String((i % 28) + 1).padStart(2, "0")}-${i}`);
      const f1 = withPatchedMathRandom(mulberry32(seed), () =>
        initializeGameStateForMultiTier(1)
      );
      const cracks = f1.mapData.subtypes
        .flat()
        .filter((c) => c.includes(TileSubtype.WALL_SEAL)).length;
      expect(cracks).toBeLessThanOrEqual(MAX_DECOY_SEALS);
      expect(Object.keys(f1.sealPayloads ?? {}).length).toBe(cracks);
      // Floor 1 never hides the boss — only decoys.
      expect(Object.values(f1.sealPayloads ?? {})).not.toContain("boss");
      expect(f1.bombCount ?? 0).toBe(0);
      if (cracks > 0) floorsWithCracks++;
      else sawEmptyFloor = true;
    }
    expect(floorsWithCracks).toBeGreaterThan(0);
    expect(sawEmptyFloor).toBe(true); // variance is the point: some floors have none
  });

  it("puts cracks on floor 2 as well, alongside the day's chests", () => {
    let floorsWithCracks = 0;
    for (let i = 0; i < 25; i++) {
      const seed = hashStringToSeed(`2026-11-${String((i % 28) + 1).padStart(2, "0")}`);
      const f1 = withPatchedMathRandom(mulberry32(seed), () =>
        initializeGameStateForMultiTier(1)
      );
      const f2 = advanceToNextFloor(f1, seed);
      const cracks = f2.mapData.subtypes
        .flat()
        .filter((c) => c.includes(TileSubtype.WALL_SEAL)).length;
      expect(cracks).toBeLessThanOrEqual(MAX_DECOY_SEALS);
      expect(Object.keys(f2.sealPayloads ?? {}).length).toBe(cracks);
      expect(Object.values(f2.sealPayloads ?? {})).not.toContain("boss");
      if (cracks > 0) floorsWithCracks++;
    }
    expect(floorsWithCracks).toBeGreaterThan(0);
  });

  it("floor 3 carries at most one boss seal, and 0-2 decoys on top of it", () => {
    let bombDays = 0;
    let bombDayDecoyCounts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const seed = hashStringToSeed(`2026-12-${String((i % 28) + 1).padStart(2, "0")}-${i}`);
      const f1 = withPatchedMathRandom(mulberry32(seed), () =>
        initializeGameStateForMultiTier(1)
      );
      const f3 = advanceToNextFloor(advanceToNextFloor(f1, seed), seed);
      const payloads = f3.sealPayloads ?? {};
      const cracks = f3.mapData.subtypes
        .flat()
        .filter((c) => c.includes(TileSubtype.WALL_SEAL)).length;
      expect(Object.keys(payloads).length).toBe(cracks);

      const bosses = Object.values(payloads).filter((p) => p === "boss");
      expect(bosses.length).toBeLessThanOrEqual(1);
      const decoys = Object.values(payloads).length - bosses.length;
      expect(decoys).toBeLessThanOrEqual(MAX_DECOY_SEALS);
      if (bosses.length === 1) {
        bombDays++;
        bombDayDecoyCounts.add(decoys);
        expect(f3.bossEntranceKind).toBe("bomb");
      }
    }
    expect(bombDays).toBeGreaterThan(0);
    // A bomb day can roll zero decoys (only the bracketed doorway) or up to the max.
    expect(Math.min(...bombDayDecoyCounts)).toBe(0);
  });
});
