import {
  Direction,
  TileSubtype,
  type GameState,
  movePlayer,
  detonateLiveBombs,
  performThrowRune,
} from "../../lib/map";
import { FLOOR } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { Enemy } from "../../lib/enemy";

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

function baseState(map: MapData, overrides: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: map,
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    mode: "normal",
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
    ...overrides,
  };
}

function pinkGoblinWithRing(gy: number, gx: number, ringY: number, ringX: number): Enemy {
  const e = new Enemy({ y: gy, x: gx });
  e.kind = "pink-goblin";
  const mem = e.behaviorMemory as { ringY?: number; ringX?: number };
  mem.ringY = ringY;
  mem.ringX = ringX;
  return e;
}

describe("Pink goblin ring on death", () => {
  it("a bomb kill keeps a ring that was already out", () => {
    const map = arena(12, 5, 0);
    // Goblin at (5,5), ring out at (2,8) (far from the blast).
    map.subtypes[2][8] = [TileSubtype.PINK_RING];
    map.subtypes[5][5] = [TileSubtype.BOMB_LIVE];
    const goblin = pinkGoblinWithRing(5, 5, 2, 8);

    const blown = detonateLiveBombs(baseState(map, { enemies: [goblin] }));

    expect(blown.enemies?.length ?? 0).toBe(0); // goblin killed
    expect(blown.mapData.subtypes[2][8]).toContain(TileSubtype.PINK_RING); // ring persists
  });

  it("a bomb kill drops a ring on the death tile even with no ring out", () => {
    const map = arena(12, 5, 0);
    map.subtypes[5][5] = [TileSubtype.BOMB_LIVE];
    const goblin = new Enemy({ y: 5, x: 5 });
    goblin.kind = "pink-goblin"; // no ring in memory

    const blown = detonateLiveBombs(baseState(map, { enemies: [goblin] }));
    expect(blown.enemies?.length ?? 0).toBe(0);
    // The bomb leaves a ring behind, on the tile where the goblin died.
    expect(blown.mapData.subtypes[5][5]).toContain(TileSubtype.PINK_RING);
  });

  it("a rune kill leaves no ring behind", () => {
    const map = arena(12, 5, 5); // player at (5,5)
    map.subtypes[2][8] = [TileSubtype.PINK_RING];
    const goblin = pinkGoblinWithRing(5, 6, 2, 8); // adjacent, ring out at (2,8)

    const after = performThrowRune(
      baseState(map, { enemies: [goblin], runeCount: 1, playerDirection: Direction.RIGHT })
    );
    expect(after.enemies?.length ?? 0).toBe(0); // rune killed it
    let rings = 0;
    for (const row of after.mapData.subtypes)
      for (const cell of row) if (cell.includes(TileSubtype.PINK_RING)) rings++;
    expect(rings).toBe(0); // no ring from a non-bomb kill
  });

  it("a melee kill leaves no ring behind", () => {
    const map = arena(12, 5, 5); // player at (5,5)
    const goblin = new Enemy({ y: 5, x: 6 }); // adjacent
    goblin.kind = "pink-goblin";
    goblin.health = 1; // one strong hit kills it

    const after = movePlayer(
      baseState(map, { enemies: [goblin], heroAttack: 5, playerDirection: Direction.RIGHT }),
      Direction.RIGHT
    );
    expect(after.enemies?.length ?? 0).toBe(0); // killed by melee
    let rings = 0;
    for (const row of after.mapData.subtypes)
      for (const cell of row) if (cell.includes(TileSubtype.PINK_RING)) rings++;
    expect(rings).toBe(0); // no ring from a non-bomb kill
  });
});

describe("Pink ring warp", () => {
  it("warps to the pink realm when stepping on a leftover ring, and back via the return ring", () => {
    const map = arena(12, 5, 5);
    map.subtypes[5][6] = [TileSubtype.PINK_RING]; // leftover ring to the right, no owner
    const state = baseState(map, { enemies: [], playerDirection: Direction.RIGHT });

    const inRealm = movePlayer(state, Direction.RIGHT);
    expect(inRealm.inPinkRealm).toBe(true);
    expect(inRealm.mapData.environment).toBe("pink_realm");
    expect(inRealm.dungeonReturn?.position).toEqual([5, 6]);

    // The realm has a return ring; find it and step onto it.
    let ring: [number, number] | null = null;
    for (let y = 0; y < inRealm.mapData.subtypes.length; y++) {
      for (let x = 0; x < inRealm.mapData.subtypes[y].length; x++) {
        if (inRealm.mapData.subtypes[y][x].includes(TileSubtype.PINK_RING)) ring = [y, x];
      }
    }
    expect(ring).not.toBeNull();

    // Place the player adjacent to the return ring and step onto it.
    const [ry, rx] = ring!;
    const realmMap = inRealm.mapData;
    // remove player from wherever they are
    for (const row of realmMap.subtypes)
      for (const cell of row) {
        const i = cell.indexOf(TileSubtype.PLAYER);
        if (i !== -1) cell.splice(i, 1);
      }
    realmMap.subtypes[ry][rx - 1] = [TileSubtype.PLAYER];
    realmMap.tiles[ry][rx - 1] = FLOOR;
    const back = movePlayer({ ...inRealm, mapData: realmMap }, Direction.RIGHT);
    expect(back.inPinkRealm).toBeFalsy();
    expect(back.mapData.environment).not.toBe("pink_realm");
  });

  it("latches reachedPinkRealm true on entry and keeps it after returning", () => {
    const map = arena(12, 5, 5);
    map.subtypes[5][6] = [TileSubtype.PINK_RING];
    const state = baseState(map, { enemies: [], playerDirection: Direction.RIGHT });
    expect(state.reachedPinkRealm).toBeFalsy();

    const inRealm = movePlayer(state, Direction.RIGHT);
    expect(inRealm.inPinkRealm).toBe(true);
    expect(inRealm.reachedPinkRealm).toBe(true);

    // Find the return ring, step onto it, and confirm the flag survives the trip home.
    let ring: [number, number] | null = null;
    for (let y = 0; y < inRealm.mapData.subtypes.length; y++) {
      for (let x = 0; x < inRealm.mapData.subtypes[y].length; x++) {
        if (inRealm.mapData.subtypes[y][x].includes(TileSubtype.PINK_RING)) ring = [y, x];
      }
    }
    const [ry, rx] = ring!;
    const realmMap = inRealm.mapData;
    for (const row of realmMap.subtypes)
      for (const cell of row) {
        const i = cell.indexOf(TileSubtype.PLAYER);
        if (i !== -1) cell.splice(i, 1);
      }
    realmMap.subtypes[ry][rx - 1] = [TileSubtype.PLAYER];
    realmMap.tiles[ry][rx - 1] = FLOOR;
    const back = movePlayer({ ...inRealm, mapData: realmMap }, Direction.RIGHT);
    expect(back.inPinkRealm).toBeFalsy();
    expect(back.reachedPinkRealm).toBe(true); // achievement persists after returning
  });

  it("does NOT warp when the ring is still owned by a living pink goblin", () => {
    const map = arena(12, 5, 5);
    map.subtypes[5][6] = [TileSubtype.PINK_RING];
    const goblin = pinkGoblinWithRing(1, 1, 5, 6); // claims the ring at (5,6)
    const after = movePlayer(
      baseState(map, { enemies: [goblin], playerDirection: Direction.RIGHT }),
      Direction.RIGHT
    );
    expect(after.inPinkRealm).toBeFalsy();
    expect(after.mapData.environment).not.toBe("pink_realm");
  });
});
