import { generateCompleteMapForFloor } from "../../lib/map/map-features";
import { stampColorSwitchLock } from "../../lib/map/color_switch_puzzle";
import { mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { FLOOR, TileSubtype } from "../../lib/map/constants";
import { findPlayerPosition } from "../../lib/map/player";
import { colorLockSatisfied } from "../../lib/map/machinery";
import type { MapData } from "../../lib/map/types";

/**
 * The level-scale colour-switch puzzle, stamped onto a REAL generated floor. The properties that make
 * it safe to drop into the live daily: it places a solvable make-them-match puzzle whose gate is a
 * genuine cut to a reward, it never severs the floor's own path to the key/exit, it's deterministic
 * from its own seed, and it never consumes the shared Math.random stream (so /stats reconstruction of
 * past days is untouched).
 */
function genFloor2(seed: number): MapData {
  return withPatchedMathRandom(mulberry32(seed), () =>
    generateCompleteMapForFloor(
      { chests: 2, keys: 2, chestContents: [TileSubtype.SWORD, TileSubtype.SHIELD] },
      2,
      {}
    )
  );
}

/** Walkable flood (spikes-up + lava block; everything else floor is walkable). */
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

describe("stampColorSwitchLock", () => {
  it("places a valid, solvable puzzle on most real floors, and every placed one is well-formed", () => {
    let placed = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const map = genFloor2(seed);
      const hero = findPlayerPosition(map)!;
      const locks = stampColorSwitchLock(map, mulberry32(seed * 7 + 1), { switches: 4, colors: 4 });
      if (!locks) continue; // no safe spot this floor — graceful skip
      placed++;
      const lock = locks[0];

      // Well-formed: 4 switches, 4 colours, allEqual, distinct start (=> starts UNsatisfied).
      expect(lock.rule).toBe("allEqual");
      expect(lock.switches.length).toBe(4);
      expect(lock.colors).toBe(4);
      expect(colorLockSatisfied(lock)).toBe(false);
      expect(find(map, TileSubtype.TOGGLE_SWITCH).length).toBe(4);

      const gate = lock.gates[0];
      // Exactly one exit key, RELOCATED behind the gate (the puzzle is mandatory now).
      const keys = find(map, TileSubtype.EXITKEY);
      expect(keys.length).toBe(1);
      const key = keys[0];
      const exit = find(map, TileSubtype.EXIT)[0];

      const openNow = reachable(map, hero);
      // Every switch is reachable...
      for (const [sy, sx] of lock.switches) expect(openNow.has(`${sy},${sx}`)).toBe(true);
      // ...the exit key is SEALED behind the gate (a real cut, shut at the start) so you cannot leave
      // without solving it...
      expect(openNow.has(`${key[0]},${key[1]}`)).toBe(false);
      // ...but the exit tile itself is still reachable (you just need the key first).
      expect(openNow.has(`${exit[0]},${exit[1]}`)).toBe(true);

      // Solvable: making the lock satisfied (all same colour) opens the gate -> key reachable.
      const openGate = JSON.parse(JSON.stringify(map)) as MapData;
      openGate.subtypes[gate[0]][gate[1]] = [TileSubtype.SPIKE_HOLES];
      expect(reachable(openGate, hero).has(`${key[0]},${key[1]}`)).toBe(true);
    }
    // It should find a spot on the large majority of floor-2 maps.
    expect(placed).toBeGreaterThanOrEqual(20);
  });

  it("is deterministic — same map seed + same rng seed rebuilds the identical puzzle", () => {
    const a = genFloor2(3);
    const b = genFloor2(3);
    const la = stampColorSwitchLock(a, mulberry32(99), { switches: 4, colors: 4 });
    const lb = stampColorSwitchLock(b, mulberry32(99), { switches: 4, colors: 4 });
    expect(lb).toEqual(la);
    expect(b).toEqual(a); // the stamped maps are identical too
  });

  it("never consumes the shared Math.random stream (the /stats-safety contract)", () => {
    const map = genFloor2(4);
    const realRandom = Math.random;
    let calls = 0;
    Math.random = () => {
      calls++;
      return realRandom();
    };
    try {
      stampColorSwitchLock(map, mulberry32(1234), { switches: 4, colors: 4 });
    } finally {
      Math.random = realRandom;
    }
    expect(calls).toBe(0); // uses ONLY its own rng — the daily's shared stream is untouched
  });
});
