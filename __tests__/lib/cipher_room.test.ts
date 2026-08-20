import { buildCipherRoomFloor } from "../../lib/map/cipher_room";
import { TileSubtype, Direction } from "../../lib/map/constants";
import { colorLockSatisfied, applyColorLock } from "../../lib/map/machinery";
import { initializeGameStateFromMap, movePlayer, type GameState } from "../../lib/map/game-state";
import type { MapData } from "../../lib/map/types";

function find(map: MapData, sub: TileSubtype): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < map.subtypes.length; y++)
    for (let x = 0; x < map.subtypes[y].length; x++)
      if (map.subtypes[y][x].includes(sub)) out.push([y, x]);
  return out;
}

describe("prescribed colour-cipher room", () => {
  it("lays out four switches, four unlit torches, a gate, and a sealed reward", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor();
    const lock = colorLocks[0];
    expect(lock.rule).toBe("match");
    expect(lock.switches.length).toBe(4);
    expect(lock.target?.length).toBe(4);
    expect(lock.legend?.torches.length).toBe(4);
    expect(lock.legend?.lit.every((l) => l === false)).toBe(true); // start unlit — code hidden
    expect(colorLockSatisfied(lock)).toBe(false); // starts unsolved
    expect(find(mapData, TileSubtype.TOGGLE_SWITCH).length).toBe(4);
    expect(find(mapData, TileSubtype.CODE_TORCH).length).toBe(4);
    expect(find(mapData, TileSubtype.SPIKES).length).toBeGreaterThan(0);
    expect(find(mapData, TileSubtype.EXTRA_HEART).length).toBe(2); // default reward, loose (no chest)
    expect(find(mapData, TileSubtype.CHEST).length).toBe(0);
  });

  it("torch i reveals switch i's target colour (legend is parallel to target)", () => {
    const seq = [1, 3, 0, 2];
    const { colorLocks } = buildCipherRoomFloor({ sequence: seq });
    const lock = colorLocks[0];
    expect(lock.target).toEqual(seq);
    // Each torch sits directly above its switch (same column).
    lock.legend!.torches.forEach(([ty, tx], i) => {
      const [sy, sx] = lock.switches[i];
      expect(tx).toBe(sx);
      expect(ty).toBe(sy + 1); // torch is the row below the switch
    });
  });

  it("solving the code retracts the gate spikes (frees the reward)", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor();
    const solved = { ...colorLocks[0], states: (colorLocks[0].target ?? []).slice() };
    expect(colorLockSatisfied(solved)).toBe(true);
    applyColorLock({ mapData, platforms: [] }, solved, new Set());
    for (const [gy, gx] of solved.gates) {
      expect(mapData.subtypes[gy][gx]).not.toContain(TileSubtype.SPIKES);
    }
  });

  it("stepping onto a torch with a lit hero-torch lights it (and only it)", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor();
    const base = initializeGameStateFromMap(mapData);
    // Relocate the hero directly below torch 0 so a single UP step lands on it.
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
    expect(lit[1]).toBe(false); // untouched torches stay dark
    // The original state was not mutated (immutability of the lighting update).
    expect(state.colorLocks?.[0].legend?.lit[0]).toBe(false);
  });

  it("an unlit hero torch cannot light a code torch", () => {
    const { mapData, colorLocks } = buildCipherRoomFloor();
    const base = initializeGameStateFromMap(mapData);
    const [ty, tx] = colorLocks[0].legend!.torches[0];
    for (let y = 0; y < mapData.subtypes.length; y++)
      for (let x = 0; x < mapData.subtypes[y].length; x++)
        mapData.subtypes[y][x] = mapData.subtypes[y][x].filter((s) => s !== TileSubtype.PLAYER);
    mapData.subtypes[ty + 1][tx] = [TileSubtype.PLAYER];
    const state: GameState = { ...base, mapData, colorLocks, enemies: [], heroTorchLit: false };
    const after = movePlayer(state, Direction.UP);
    expect(after.colorLocks?.[0].legend?.lit[0]).toBe(false);
  });
});
