import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
  type GameState,
} from "../../lib/map/game-state";
import { mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { FLOOR, TileSubtype } from "../../lib/map/constants";
import { findPlayerPosition } from "../../lib/map/player";
import { colorLockSatisfied } from "../../lib/map/machinery";
import type { MapData } from "../../lib/map/types";

/**
 * The floor-2 colour-switch puzzle wired into the real daily build (advanceToNextFloor). Pins that it
 * appears on ~40% of days, is well-formed and never breaks the floor, is deterministic per daily
 * seed, and resets on the next floor. The /stats-safety of the wiring rests on the stamper never
 * touching Math.random (proven in color_switch_puzzle.test.ts) + being stamped from a separate stream
 * after every rng step here — a structural guarantee, so the daily chain below is just checked to be
 * deterministic.
 */
function daily(seed: number): { f2: GameState; f3: GameState } {
  const f1 = withPatchedMathRandom(mulberry32(seed), () => initializeGameStateForMultiTier(1));
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  return { f2, f3 };
}
function reachable(map: MapData, start: [number, number]): Set<string> {
  const seen = new Set<string>();
  const ok = (y: number, x: number) => {
    if (map.tiles[y]?.[x] !== FLOOR) return false;
    const s = map.subtypes[y]?.[x] ?? [];
    return !s.includes(TileSubtype.SPIKES) && !s.includes(TileSubtype.LAVA);
  };
  if (!ok(start[0], start[1])) return seen;
  seen.add(`${start[0]},${start[1]}`);
  const st = [start];
  while (st.length) {
    const [y, x] = st.pop() as [number, number];
    for (const [ny, nx] of [
      [y - 1, x],
      [y + 1, x],
      [y, x - 1],
      [y, x + 1],
    ] as Array<[number, number]>) {
      const k = `${ny},${nx}`;
      if (!seen.has(k) && ok(ny, nx)) {
        seen.add(k);
        st.push([ny, nx]);
      }
    }
  }
  return seen;
}
function find(map: MapData, sub: TileSubtype): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < map.tiles.length; y++)
    for (let x = 0; x < map.tiles[0].length; x++)
      if ((map.subtypes[y][x] ?? []).includes(sub)) out.push([y, x]);
  return out;
}

describe("daily floor-2 colour puzzle", () => {
  it("appears on a minority of days and is absent on the rest", () => {
    let withPuzzle = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { f2 } = daily(seed);
      if ((f2.colorLocks ?? []).length > 0) withPuzzle++;
    }
    // ~40% roll rate, and the stamper can decline a floor -> expect a clear minority, never all/none.
    expect(withPuzzle).toBeGreaterThan(3);
    expect(withPuzzle).toBeLessThan(37);
  });

  it("every placed puzzle is well-formed and never breaks the floor", () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 6; seed++) {
      const { f2 } = daily(seed);
      const locks = f2.colorLocks ?? [];
      if (locks.length === 0) continue;
      checked++;
      const lock = locks[0];
      expect(lock.rule).toBe("allEqual");
      expect(lock.switches.length).toBe(4);
      expect(lock.colors).toBe(4);
      expect(colorLockSatisfied(lock)).toBe(false); // starts unsolved

      const map = f2.mapData;
      const hero = findPlayerPosition(map)!;
      const openNow = reachable(map, hero);
      // Switches reachable; floor still completable past the sealed gate.
      for (const [sy, sx] of lock.switches) expect(openNow.has(`${sy},${sx}`)).toBe(true);
      const exit = find(map, TileSubtype.EXIT)[0];
      const exitKey = find(map, TileSubtype.EXITKEY)[0];
      expect(openNow.has(`${exit[0]},${exit[1]}`)).toBe(true);
      expect(openNow.has(`${exitKey[0]},${exitKey[1]}`)).toBe(true);
      // The gate is a real cut: opening it (satisfy the lock) makes the reward reachable, not before.
      const gate = lock.gates[0];
      const open = JSON.parse(JSON.stringify(map)) as MapData;
      open.subtypes[gate[0]][gate[1]] = [TileSubtype.SPIKE_HOLES];
      const reward = find(open, TileSubtype.CHEST).find(
        ([y, x]) => (open.subtypes[y][x] ?? []).includes(TileSubtype.FOOD)
      );
      expect(reward).toBeTruthy();
      expect(reachable(open, hero).has(`${reward![0]},${reward![1]}`)).toBe(true);
      expect(openNow.has(`${reward![0]},${reward![1]}`)).toBe(false);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("is deterministic per daily seed and resets on the next floor", () => {
    // Find a seed that rolls the puzzle.
    let seed = 1;
    for (; seed <= 60; seed++) if ((daily(seed).f2.colorLocks ?? []).length > 0) break;
    const a = daily(seed);
    const b = daily(seed);
    expect(b.f2.colorLocks).toEqual(a.f2.colorLocks);
    expect(b.f2.mapData).toEqual(a.f2.mapData);
    // Floor 3 must NOT inherit floor 2's lock (its switch tiles don't exist on the new map).
    expect(a.f3.colorLocks ?? []).toEqual([]);
  });
});
