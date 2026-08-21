import { buildCipherRoomFloor, stampCipherRoom } from "../../lib/map/cipher_room";
import { TileSubtype, Direction, FLOOR, WALL } from "../../lib/map/constants";
import { colorLockSatisfied, applyColorLock } from "../../lib/map/machinery";
import {
  initializeGameStateFromMap,
  initializeGameStateForMultiTier,
  advanceToNextFloor,
  movePlayer,
  type GameState,
} from "../../lib/map/game-state";
import { findPlayerPosition } from "../../lib/map/player";
import { mulberry32, withPatchedMathRandom } from "../../lib/rng";
import type { MapData } from "../../lib/map/types";

function find(map: MapData, sub: TileSubtype): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < map.subtypes.length; y++)
    for (let x = 0; x < map.subtypes[y].length; x++)
      if (map.subtypes[y][x].includes(sub)) out.push([y, x]);
  return out;
}

/** Floor the hero can walk given the map (spikes/lava block; mural + torch tiles are walkable). */
function reachable(map: MapData, start: [number, number]): Set<string> {
  const ok = (y: number, x: number) => {
    if (map.tiles[y]?.[x] !== FLOOR) return false;
    const s = map.subtypes[y]?.[x] ?? [];
    return !s.includes(TileSubtype.SPIKES) && !s.includes(TileSubtype.LAVA);
  };
  const seen = new Set<string>();
  if (!ok(start[0], start[1])) return seen;
  seen.add(`${start[0]},${start[1]}`);
  const st = [start];
  while (st.length) {
    const [y, x] = st.pop() as [number, number];
    for (const [ny, nx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]] as Array<[number, number]>) {
      const k = `${ny},${nx}`;
      if (!seen.has(k) && ok(ny, nx)) {
        seen.add(k);
        st.push([ny, nx]);
      }
    }
  }
  return seen;
}

describe("cipher room — mural variant (default)", () => {
  it("puts the code on a mural in a chamber far from the switches", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor();
    const lock = colorLocks[0];
    expect(lock.rule).toBe("match");
    expect(lock.switches.length).toBe(4);
    expect(lock.target?.length).toBe(4);
    expect(lock.mural?.tiles.length).toBe(2); // spans two wall tiles so each glyph is legible
    expect(lock.legend).toBeUndefined(); // no torches in the mural variant
    expect(colorLockSatisfied(lock)).toBe(false);
    expect(find(mapData, TileSubtype.MURAL_PANEL).length).toBe(2);
    expect(find(mapData, TileSubtype.CODE_TORCH).length).toBe(0);
    expect(find(mapData, TileSubtype.EXTRA_HEART).length).toBe(2);
    const switchRow = lock.switches[0][0];
    for (const [muralRow, muralCol] of lock.mural!.tiles) {
      // The mural and the switches are far apart — you cannot read one while standing at the other.
      expect(Math.abs(muralRow - switchRow)).toBeGreaterThanOrEqual(6);
      // Each is a WALL engraving with floor directly below it (a camera-facing face to read).
      expect(mapData.tiles[muralRow][muralCol]).toBe(WALL);
      expect(mapData.tiles[muralRow + 1][muralCol]).toBe(FLOOR);
    }
  });

  it("is solvable: hero reaches the mural and the switches, but the reward is sealed until solved", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor();
    const lock = colorLocks[0];
    const hero = findPlayerPosition(mapData)!;
    const reach = reachable(mapData, hero);
    const [my, mx] = lock.mural!.tiles[0];
    expect(reach.has(`${my + 1},${mx}`)).toBe(true); // hero can stand below the wall engraving to read it
    for (const [sy, sx] of lock.switches) expect(reach.has(`${sy},${sx}`)).toBe(true); // set the switches
    const reward = find(mapData, TileSubtype.EXTRA_HEART);
    for (const [ry, rx] of reward) expect(reach.has(`${ry},${rx}`)).toBe(false); // sealed behind the gate

    // Open the gate (satisfy the lock) and the reward becomes reachable.
    const solved = { ...lock, states: (lock.target ?? []).slice() };
    expect(colorLockSatisfied(solved)).toBe(true);
    applyColorLock({ mapData, platforms: [] }, solved, new Set());
    const afterReach = reachable(mapData, hero);
    for (const [ry, rx] of reward) expect(afterReach.has(`${ry},${rx}`)).toBe(true);
  });

  it("spreads the code across two adjacent wall tiles", () => {
    const seq = [3, 1, 2, 0];
    const { colorLocks } = buildCipherRoomFloor({ sequence: seq });
    expect(colorLocks[0].target).toEqual(seq);
    const tiles = colorLocks[0].mural!.tiles;
    expect(tiles.length).toBe(2);
    // adjacent: same row, neighbouring columns (so the engraving reads as one continuous row)
    expect(tiles[0][0]).toBe(tiles[1][0]);
    expect(Math.abs(tiles[0][1] - tiles[1][1])).toBe(1);
  });
});

describe("cipher room — torch variant", () => {
  const opts = { legendStyle: "torches" as const };

  it("lays out four unlit torches above the switches", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor(opts);
    const lock = colorLocks[0];
    expect(lock.legend?.torches.length).toBe(4);
    expect(lock.legend?.lit.every((l) => l === false)).toBe(true);
    expect(lock.mural).toBeUndefined();
    expect(find(mapData, TileSubtype.CODE_TORCH).length).toBe(4);
    lock.legend!.torches.forEach(([ty, tx], i) => {
      const [sy, sx] = lock.switches[i];
      expect(tx).toBe(sx);
      expect(ty).toBe(sy + 1);
    });
  });

  it("stepping onto a torch with a lit hero-torch lights it (and only it)", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor(opts);
    const base = initializeGameStateFromMap(mapData);
    const [ty, tx] = colorLocks[0].legend!.torches[0];
    for (let y = 0; y < mapData.subtypes.length; y++)
      for (let x = 0; x < mapData.subtypes[y].length; x++)
        mapData.subtypes[y][x] = mapData.subtypes[y][x].filter((s) => s !== TileSubtype.PLAYER);
    mapData.subtypes[ty + 1][tx] = [TileSubtype.PLAYER];
    const state: GameState = {
      ...base,
      mapData,
      colorLocks: colorLocks.map((l) => ({ ...l, legend: l.legend && { ...l.legend, lit: l.legend.lit.slice() } })),
      enemies: [],
      heroTorchLit: true,
    };
    const after = movePlayer(state, Direction.UP);
    const lit = after.colorLocks?.[0].legend?.lit ?? [];
    expect(lit[0]).toBe(true);
    expect(lit[1]).toBe(false);
    expect(state.colorLocks?.[0].legend?.lit[0]).toBe(false); // original not mutated
  });
});

describe("cipher room — stamped into a real generated floor", () => {
  function realFloor(seed: number, f: number): MapData {
    const f1 = withPatchedMathRandom(mulberry32(seed), () => initializeGameStateForMultiTier(1));
    let s = f1;
    for (let i = 2; i <= f; i++) s = advanceToNextFloor(s, seed);
    return s.mapData;
  }

  it("distributes staggered switches, a gated reward, and an offscreen mural", () => {
    let placed: ReturnType<typeof stampCipherRoom> = null;
    let map: MapData | null = null;
    for (let seed = 1; seed <= 60 && !placed; seed++) {
      const m = realFloor(seed, 2);
      const lock = stampCipherRoom(m, mulberry32(seed ^ 0xc15e));
      if (lock) {
        placed = lock;
        map = m;
      }
    }
    expect(placed).toBeTruthy();
    const lock = placed!;
    // Four switches, distinct columns, ordered left-to-right, staggered within a four-row band.
    expect(lock.switches.length).toBe(4);
    const cols = lock.switches.map(([, x]) => x);
    expect(new Set(cols).size).toBe(4);
    expect(cols).toEqual([...cols].sort((a, b) => a - b));
    const rows = lock.switches.map(([y]) => y);
    expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(4);
    // The switches and mural are actually STAMPED ON THE MAP (not just referenced by the lock) — else
    // the puzzle renders as invisible floor and you see the mural with nothing to solve.
    for (const [sy, sx] of lock.switches) expect(map!.subtypes[sy][sx]).toContain(TileSubtype.TOGGLE_SWITCH);
    for (const [my, mx] of lock.mural!.tiles) expect(map!.subtypes[my][mx]).toContain(TileSubtype.MURAL_PANEL);
    for (const [gy, gx] of lock.gates) expect(map!.subtypes[gy][gx]).toContain(TileSubtype.SPIKES);
    // The mural is two adjacent wall tiles, placed well away from the switches (offscreen).
    expect(lock.mural?.tiles.length).toBe(2);
    expect(lock.mural!.tiles[0][0]).toBe(lock.mural!.tiles[1][0]);
    expect(Math.abs(lock.mural!.tiles[0][1] - lock.mural!.tiles[1][1])).toBe(1);
    const cy = rows.reduce((a, b) => a + b, 0) / 4;
    const cx = cols.reduce((a, b) => a + b, 0) / 4;
    const d = Math.hypot(lock.mural!.tiles[0][0] - cy, lock.mural!.tiles[0][1] - cx);
    expect(d).toBeGreaterThanOrEqual(11); // kept well offscreen (stamp aims >= 13 from the floor front)
    // Solvable: match rule, starts unsolved, and satisfying it retracts the gate.
    expect(lock.rule).toBe("match");
    expect(colorLockSatisfied(lock)).toBe(false);
    const solved = { ...lock, states: (lock.target ?? []).slice() };
    applyColorLock({ mapData: map!, platforms: [] }, solved, new Set());
    for (const [gy, gx] of lock.gates) expect(map!.subtypes[gy][gx]).not.toContain(TileSubtype.SPIKES);
  });
});
