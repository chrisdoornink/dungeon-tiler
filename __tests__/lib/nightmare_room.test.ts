import {
  Direction,
  TileSubtype,
  type GameState,
  movePlayer,
} from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";
import { buildNightmareRoom } from "../../lib/map/outside-world";
import { buildPinkRealm } from "../../lib/map/pink-realm";
import type { MapData } from "../../lib/map/types";

function findPlayer(md: MapData): [number, number] | null {
  for (let y = 0; y < md.subtypes.length; y++)
    for (let x = 0; x < md.subtypes[y].length; x++)
      if (md.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x];
  return null;
}

function realmArena(size: number): MapData {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < size; y++) {
    tiles.push(new Array(size).fill(FLOOR));
    subtypes.push(Array.from({ length: size }, () => [] as number[]));
  }
  return { tiles, subtypes, environment: "pink_realm" };
}

function realmState(map: MapData, overrides: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: map,
    showFullMap: true,
    win: false,
    playerDirection: Direction.LEFT,
    enemies: [],
    heroHealth: 10,
    heroMaxHealth: 10,
    heroAttack: 1,
    heroTorchLit: true,
    inPinkRealm: true,
    mist: [],
    mode: "daily",
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
    ...overrides,
  } as GameState;
}

describe("buildNightmareRoom", () => {
  it.each([Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT])(
    "is a walled cave room with a breach on the inner edge and a floor entry (dir %s)",
    (dir) => {
      const W = 13;
      const H = 11;
      const { mapData, entry } = buildNightmareRoom(dir, W, H);
      expect(mapData.environment).toBe("pink_realm");
      expect(mapData.tiles[entry[0]][entry[1]]).toBe(FLOOR);

      // There is at least one walled side and at least one breach opening.
      let walls = 0;
      let breaches = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (mapData.tiles[y][x] === WALL) walls++;
          if (mapData.subtypes[y][x].includes(TileSubtype.BREACH)) breaches++;
        }
      expect(walls).toBeGreaterThan(0);
      expect(breaches).toBeGreaterThan(0);
      // No enemies and no items are baked into the room itself.
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const subs = mapData.subtypes[y][x];
          const onlyBreachOrEmpty = subs.every((s) => s === TileSubtype.BREACH);
          expect(onlyBreachOrEmpty).toBe(true);
        }
    }
  );
});

describe("buildPinkRealm carries dungeon breaches into the realm mirror", () => {
  it("a breach blown in the dungeon survives the warp (mirrored), so it can lead to the nightmare", () => {
    const size = 9;
    const tiles = Array.from({ length: size }, () => Array(size).fill(FLOOR));
    const subtypes = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => [] as number[])
    );
    // A charred breach on the dungeon's right edge, plus the player somewhere inside.
    subtypes[4][size - 1] = [TileSubtype.BREACH];
    subtypes[4][4] = [TileSubtype.PLAYER];
    const source = { tiles, subtypes, environment: "cave" } as MapData;

    const { mapData } = buildPinkRealm(source, [4, 4]);

    // Horizontal mirror: the right-edge breach lands on the realm's left edge.
    expect(mapData.subtypes[4][0]).toContain(TileSubtype.BREACH);
  });

  it("stepping through a carried-over breach in the realm enters the nightmare", () => {
    const size = 11;
    const tiles = Array.from({ length: size }, () => Array(size).fill(FLOOR));
    const subtypes = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => [] as number[])
    );
    subtypes[5][size - 1] = [TileSubtype.BREACH]; // dungeon breach on the right edge
    subtypes[5][5] = [TileSubtype.PLAYER];
    const source = { tiles, subtypes, environment: "cave" } as MapData;
    const { mapData } = buildPinkRealm(source, [5, 5]);

    // Stand the hero on the realm's (mirrored, left-edge) breach.
    for (const row of mapData.subtypes)
      for (const cell of row) {
        const i = cell.indexOf(TileSubtype.PLAYER);
        if (i >= 0) cell.splice(i, 1);
      }
    mapData.subtypes[5][0] = [...(mapData.subtypes[5][0] ?? []), TileSubtype.PLAYER];

    const nightmare = movePlayer(realmState(mapData, { mist: [] }), Direction.LEFT);
    expect(nightmare.inNightmare).toBe(true);
  });
});

describe("nightmare room flow (bomb-breach the pink realm wall, step through)", () => {
  it("breaching the realm wall enters the nightmare: torch kept lit, cave, realm stashed", () => {
    const map = realmArena(11);
    // Player stands on a breach at the left edge, facing out.
    map.subtypes[5][0] = [TileSubtype.PLAYER, TileSubtype.BREACH];

    const nightmare = movePlayer(realmState(map), Direction.LEFT);

    expect(nightmare.inNightmare).toBe(true);
    expect(nightmare.inPinkRealm).toBeFalsy();
    // The flame stays lit; the renderer (inNightmare) forces the darkness instead.
    expect(nightmare.heroTorchLit).toBe(true);
    expect(nightmare.mapData.environment).toBe("pink_realm");
    expect(nightmare.realmReturn).toBeTruthy();
    expect(nightmare.realmReturn?.position).toEqual([5, 0]);
  });

  it("the dark drains the hero the deeper they wander, and not at the edge", () => {
    const map = realmArena(11);
    map.subtypes[5][0] = [TileSubtype.PLAYER, TileSubtype.BREACH];
    const nightmare = movePlayer(realmState(map), Direction.LEFT);
    const startHp = nightmare.heroHealth;

    // Stepping deeper (LEFT == away from the right-side inner edge) costs health.
    const deeper = movePlayer({ ...nightmare, mist: [] }, Direction.LEFT);
    expect(deeper.inNightmare).toBe(true);
    expect(deeper.heroHealth).toBeLessThan(startHp);

    // ...and it escalates with each further step inward.
    const deeper2 = movePlayer({ ...deeper, mist: [] }, Direction.LEFT);
    const firstDrop = startHp - deeper.heroHealth;
    const secondDrop = deeper.heroHealth - deeper2.heroHealth;
    expect(secondDrop).toBeGreaterThan(firstDrop);
  });

  it("dying to the dark records the 'darkness' death cause", () => {
    const map = realmArena(11);
    map.subtypes[5][0] = [TileSubtype.PLAYER, TileSubtype.BREACH];
    let s = movePlayer(realmState(map, { heroHealth: 3, heroMaxHealth: 3 }), Direction.LEFT);
    for (let i = 0; i < 6 && s.heroHealth > 0; i++) {
      s = movePlayer({ ...s, mist: [] }, Direction.LEFT); // wander deeper
    }
    expect(s.heroHealth).toBe(0);
    expect(s.deathCause?.type).toBe("darkness");
  });

  it("walking back out through the breach returns to the realm with the torch relit", () => {
    const map = realmArena(11);
    map.subtypes[5][0] = [TileSubtype.PLAYER, TileSubtype.BREACH];
    const nightmare = movePlayer(realmState(map), Direction.LEFT);

    const entry = findPlayer(nightmare.mapData)!;
    expect(entry).not.toBeNull();

    // Inner edge is the right column; step onto the breach tile, then off the edge.
    const onBreach = movePlayer({ ...nightmare, mist: [] }, Direction.RIGHT);
    const back = movePlayer({ ...onBreach, mist: [] }, Direction.RIGHT);

    expect(back.inNightmare).toBeFalsy();
    expect(back.inPinkRealm).toBe(true);
    expect(back.heroTorchLit).toBe(true);
    expect(back.mapData.environment).toBe("pink_realm");
    expect(findPlayer(back.mapData)).toEqual([5, 0]);
  });
});
