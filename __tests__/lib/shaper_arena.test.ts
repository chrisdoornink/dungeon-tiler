import { TileSubtype } from "../../lib/map";
import type { GameState } from "../../lib/map/game-state";
import {
  SHAPER_LAYOUTS,
  SHAPER_ENTRIES,
  buildShaperArena,
} from "../../lib/bosses/shaper_arena";

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function reachable(state: GameState, from: [number, number]): Set<string> {
  const tiles = state.mapData.tiles;
  const subs = state.mapData.subtypes;
  const H = tiles.length;
  const W = tiles[0].length;
  const walkable = (y: number, x: number) =>
    y >= 0 && x >= 0 && y < H && x < W &&
    tiles[y][x] === 0 &&
    !(subs[y][x] ?? []).includes(TileSubtype.LAVA);
  const seen = new Set<string>([`${from[0]},${from[1]}`]);
  const q: Array<[number, number]> = [from];
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const k = `${y + dy},${x + dx}`;
      if (!seen.has(k) && walkable(y + dy, x + dx)) {
        seen.add(k);
        q.push([y + dy, x + dx]);
      }
    }
  }
  return seen;
}
function findPlayer(state: GameState): [number, number] {
  const subs = state.mapData.subtypes;
  for (let y = 0; y < subs.length; y++)
    for (let x = 0; x < subs[y].length; x++)
      if (subs[y][x].includes(TileSubtype.PLAYER)) return [y, x];
  throw new Error("no player");
}
function count(state: GameState, sub: number): number {
  let c = 0;
  for (const row of state.mapData.subtypes) for (const cell of row) if (cell.includes(sub)) c++;
  return c;
}
function bossReachable(state: GameState): boolean {
  const seen = reachable(state, findPlayer(state));
  const b = state.enemies![0];
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dy, dx]) => seen.has(`${b.y + dy},${b.x + dx}`));
}
// Distance to the first wall going `dir` from center (12,12).
function firstWallDist(state: GameState, dir: [number, number]): number {
  let y = 12;
  let x = 12;
  for (let d = 1; d <= 12; d++) {
    y += dir[0];
    x += dir[1];
    if (state.mapData.tiles[y]?.[x] === 1) return d;
  }
  return 99;
}

describe("Shaper randomized labyrinth", () => {
  SHAPER_ENTRIES.forEach((entry) => {
    test(`is always solvable from the ${entry} entry (40 random mazes)`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const state = buildShaperArena(SHAPER_LAYOUTS[0], entry, mulberry32(seed));
        expect(bossReachable(state)).toBe(true);
      }
    });
  });

  test("the boss sees INTO the inner tiers (aligned inner gaps — no sneaking up)", () => {
    // Inner rings are gapped on all four sides at the center lines, so every
    // cardinal ray out of the center runs clear through both inner tiers before
    // any wall (dist >= 7) — the boss spots you as you reach the inner halls.
    for (let seed = 1; seed <= 40; seed++) {
      const state = buildShaperArena(SHAPER_LAYOUTS[0], "south", mulberry32(seed));
      for (const dir of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
        expect(firstWallDist(state, dir)).toBeGreaterThanOrEqual(7);
      }
    }
  });

  test("each maze genuinely winds (large reachable area from the entry)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = buildShaperArena(SHAPER_LAYOUTS[0], "south", mulberry32(seed));
      expect(reachable(state, findPlayer(state)).size).toBeGreaterThan(80);
    }
  });

  test("boss dead center on clean floor with a 7x7 roam box (both layouts)", () => {
    for (const layout of SHAPER_LAYOUTS) {
      const state = buildShaperArena(layout, "south", mulberry32(3));
      const boss = state.enemies![0];
      expect([boss.y, boss.x]).toEqual([12, 12]);
      expect(state.mapData.tiles[12][12]).toBe(0);
      const mem = boss.behaviorMemory as Record<string, unknown>;
      expect(mem.roamMinY).toBe(9);
      expect(mem.roamMaxY).toBe(15);
    }
  });

  test("loot survives on the halls regardless of the gap rng", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = buildShaperArena(SHAPER_LAYOUTS[0], "south", mulberry32(seed));
      expect(count(state, TileSubtype.ROCK)).toBeGreaterThanOrEqual(8);
      expect(count(state, TileSubtype.POT)).toBeGreaterThanOrEqual(3);
    }
  });
});
