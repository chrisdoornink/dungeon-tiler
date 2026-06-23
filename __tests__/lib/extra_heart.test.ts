import { Direction, TileSubtype, type GameState, movePlayer } from "../../lib/map";
import { FLOOR } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";

function arena(size: number, py: number, px: number): MapData {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < size; y++) {
    tiles.push(new Array(size).fill(FLOOR));
    subtypes.push(Array.from({ length: size }, () => [] as number[]));
  }
  subtypes[py][px] = [TileSubtype.PLAYER];
  return { tiles, subtypes };
}

describe("Extra Heart", () => {
  it("adds a heart to the max and fully refills health on pickup", () => {
    const map = arena(10, 5, 5);
    map.subtypes[5][6] = [TileSubtype.EXTRA_HEART]; // revealed heart to the right
    const state: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: map,
      showFullMap: true,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      heroHealth: 1, // nearly dead
      heroMaxHealth: 5,
      heroAttack: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    };

    const after = movePlayer(state, Direction.RIGHT);

    expect(after.heroMaxHealth).toBe(6);
    expect(after.heroHealth).toBe(6); // full refill, not just +1
    expect(after.mapData.subtypes[5][6]).not.toContain(TileSubtype.EXTRA_HEART);
  });
});
