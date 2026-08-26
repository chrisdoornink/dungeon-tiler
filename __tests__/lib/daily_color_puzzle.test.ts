import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
  type GameState,
} from "../../lib/map/game-state";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { FLOOR, TileSubtype } from "../../lib/map/constants";
import { SWITCH_GATE_START_DATE } from "../../lib/map";
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
      // Two variants share the floor-2 slot: the all-same-colour puzzle (allEqual) and the cipher
      // room (match + a two-tile mural placed well away from the switches). Both are mandatory and
      // seal the exit key the same way — only the rule and the mural differ.
      expect(["allEqual", "match"]).toContain(lock.rule);
      if (lock.rule === "match") {
        expect(lock.target?.length).toBe(4);
        expect(lock.mural?.tiles.length).toBe(2);
      }
      expect(lock.switches.length).toBe(4);
      expect(lock.colors).toBe(4);
      expect(colorLockSatisfied(lock)).toBe(false); // starts unsolved

      const map = f2.mapData;
      const hero = findPlayerPosition(map)!;
      const openNow = reachable(map, hero);
      // Switches reachable.
      for (const [sy, sx] of lock.switches) expect(openNow.has(`${sy},${sx}`)).toBe(true);
      const exit = find(map, TileSubtype.EXIT)[0];
      const keys = find(map, TileSubtype.EXITKEY);
      expect(keys.length).toBe(1); // exactly one, relocated behind the gate (not duplicated)
      const key = keys[0];
      // The exit tile is reachable, but the exit KEY is sealed behind the gate — you cannot leave the
      // floor without solving the puzzle (mandatory).
      expect(openNow.has(`${exit[0]},${exit[1]}`)).toBe(true);
      expect(openNow.has(`${key[0]},${key[1]}`)).toBe(false);
      // Opening the whole gate run (satisfy the lock) makes the key reachable, not before.
      expect(lock.gates.length).toBeGreaterThanOrEqual(1);
      expect(lock.gates.length).toBeLessThanOrEqual(3);
      const open = JSON.parse(JSON.stringify(map)) as MapData;
      for (const [gy, gx] of lock.gates) open.subtypes[gy][gx] = [TileSubtype.SPIKE_HOLES];
      expect(reachable(open, hero).has(`${key[0]},${key[1]}`)).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("never stacks a floor-2 puzzle on a day that already has a floor-1 puzzle (one per run)", () => {
    // Floor 1 generates first, so when it places a colour puzzle floor 2 must skip its roll —
    // two back-to-back colour puzzles play repetitively. Scan enough seeds to hit some floor-1
    // puzzle days (~5%), and assert none of them also carry a floor-2 puzzle.
    let floor1PuzzleDays = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const f1 = withPatchedMathRandom(mulberry32(seed), () => initializeGameStateForMultiTier(1));
      if ((f1.colorLocks ?? []).length === 0) continue;
      floor1PuzzleDays++;
      const f2 = advanceToNextFloor(f1, seed);
      expect(f2.colorLocks ?? []).toEqual([]);
    }
    expect(floor1PuzzleDays).toBeGreaterThan(0); // the sample actually exercised the rule
  });

  it("NEVER leaves an orphaned switch: every TOGGLE_SWITCH tile is wired to a ColorLock", () => {
    // Regression for the cipher stamper stamping switches (and carving its gate + relocating the key)
    // BEFORE it could bail out and return null — leaving inert blue switches, and sometimes a spike gate
    // sealing the exit key that no switch could open (a soft-lock). stampCipherRoom is now transactional:
    // it computes switches + gate + mural first and only writes the map once all three are guaranteed.
    // Scan the REAL daily date stream (hashStringToSeed + date-gated switch gates) across a wide window,
    // every floor, and assert the map never carries a switch tile that isn't in some lock's `switches`.
    const countSwitchTiles = (map: MapData): number => find(map, TileSubtype.TOGGLE_SWITCH).length;
    const lockSwitchCount = (s: GameState): number =>
      (s.colorLocks ?? []).reduce((a, l) => a + l.switches.length, 0);

    let sawPuzzle = false;
    const offenders: string[] = [];
    const start = new Date("2026-08-01").getTime();
    for (let i = 0; i < 200; i++) {
      const dateStr = new Date(start + i * 86400000).toISOString().slice(0, 10);
      const seed = hashStringToSeed(dateStr);
      const f1 = withPatchedMathRandom(mulberry32(seed), () =>
        initializeGameStateForMultiTier(1, { switchGates: dateStr >= SWITCH_GATE_START_DATE })
      );
      const f2 = advanceToNextFloor(f1, seed);
      const f3 = advanceToNextFloor(f2, seed);
      [f1, f2, f3].forEach((s, fi) => {
        const onMap = countSwitchTiles(s.mapData);
        const inLocks = lockSwitchCount(s);
        if (inLocks > 0) sawPuzzle = true;
        // The invariant: no switch tile exists that isn't wired to a lock.
        if (onMap !== inLocks) {
          offenders.push(`${dateStr} F${fi + 1}: mapSwitches=${onMap} lockSwitches=${inLocks}`);
        }
      });
    }
    expect(offenders).toEqual([]);
    expect(sawPuzzle).toBe(true); // the sweep actually exercised puzzle days
  });

  it("NEVER seals the exit key with no lock able to open it (no soft-lock)", () => {
    // The nastier face of the same bug: cipher bailed AFTER carving its gate + relocating the key, so the
    // key sat behind a spike gate with no working switch. Assert that whenever the exit key is
    // unreachable on foot, there is at least one ColorLock whose gates, once opened, free it.
    const start = new Date("2026-08-01").getTime();
    for (let i = 0; i < 200; i++) {
      const dateStr = new Date(start + i * 86400000).toISOString().slice(0, 10);
      const seed = hashStringToSeed(dateStr);
      const f1 = withPatchedMathRandom(mulberry32(seed), () =>
        initializeGameStateForMultiTier(1, { switchGates: dateStr >= SWITCH_GATE_START_DATE })
      );
      for (const s of [f1, advanceToNextFloor(f1, seed)]) {
        const map = s.mapData;
        const hero = findPlayerPosition(map);
        const keys = find(map, TileSubtype.EXITKEY);
        if (!hero || keys.length === 0) continue;
        const [ky, kx] = keys[0];
        if (reachable(map, hero).has(`${ky},${kx}`)) continue; // key reachable on foot — fine
        // Key is sealed. There must be a lock whose opened gates make it reachable.
        const locks = s.colorLocks ?? [];
        expect(locks.length).toBeGreaterThan(0); // <- would FAIL on the orphaned-gate soft-lock
        const open = JSON.parse(JSON.stringify(map)) as MapData;
        for (const l of locks) for (const [gy, gx] of l.gates) open.subtypes[gy][gx] = [TileSubtype.SPIKE_HOLES];
        expect(reachable(open, hero).has(`${ky},${kx}`)).toBe(true);
      }
    }
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
