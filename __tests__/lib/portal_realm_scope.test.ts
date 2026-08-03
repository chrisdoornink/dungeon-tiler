import {
  Direction,
  TileSubtype,
  type GameState,
  movePlayer,
} from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";

/**
 * The snake medallion's portal is per-MAP. Every sub-area the hero can duck into (pink
 * realm, nightmare, outside world, boss arena) swaps mapData in place without changing
 * currentRoomId, so an unscoped portalLocation set in one of them stays live after the
 * return and teleports the hero to those raw coordinates on the outer map. In the pink
 * realm — a horizontal mirror of the floor — that reliably lands on a wall.
 */

const DUNGEON_PORTAL = { roomId: "__base__", position: [2, 2] as [number, number] };
// Where the hero "sets" a portal while inside a sub-area. Deliberately somewhere that is
// a wall back on the outer map, which is exactly the reported symptom.
const SUBAREA_PORTAL = { roomId: "__base__", position: [0, 0] as [number, number] };

function arena(size: number, py: number, px: number): MapData {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < size; y++) {
    tiles.push(new Array(size).fill(FLOOR));
    subtypes.push(Array.from({ length: size }, () => [] as number[]));
  }
  // Ring the arena in wall so (0,0) — the sub-area portal's coordinates — is solid stone.
  for (let i = 0; i < size; i++) {
    tiles[0][i] = WALL;
    tiles[size - 1][i] = WALL;
    tiles[i][0] = WALL;
    tiles[i][size - 1] = WALL;
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
    heroHealth: 10,
    heroMaxHealth: 10,
    heroAttack: 1,
    heroTorchLit: true,
    hasSnakeMedallion: true,
    mode: "daily",
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
    ...overrides,
  } as GameState;
}

function findSubtype(md: MapData, sub: number): [number, number] | null {
  for (let y = 0; y < md.subtypes.length; y++)
    for (let x = 0; x < md.subtypes[y].length; x++)
      if (md.subtypes[y][x].includes(sub)) return [y, x];
  return null;
}

/** Move the hero next to the realm's return ring and step back onto it. */
function stepBackThroughRing(inRealm: GameState): GameState {
  const map = JSON.parse(JSON.stringify(inRealm.mapData)) as MapData;
  const ring = findSubtype(map, TileSubtype.PINK_RING);
  expect(ring).not.toBeNull();
  const [ry, rx] = ring!;
  expect(rx).toBeGreaterThan(0);
  for (const row of map.subtypes)
    for (const cell of row) {
      const i = cell.indexOf(TileSubtype.PLAYER);
      if (i !== -1) cell.splice(i, 1);
    }
  map.subtypes[ry][rx - 1] = [TileSubtype.PLAYER];
  map.tiles[ry][rx - 1] = FLOOR;
  // The mist reverses controls where it lies; empty it so this step is deterministic.
  return movePlayer({ ...inRealm, mapData: map, mist: [] }, Direction.RIGHT);
}

describe("medallion portal is scoped to the map it was set on", () => {
  describe("pink realm", () => {
    /** A floor with a parked portal at (2,2) and a leftover pink ring to the hero's right. */
    function floorWithRingAndPortal(): GameState {
      const map = arena(12, 5, 5);
      map.subtypes[5][6] = [TileSubtype.PINK_RING];
      map.subtypes[2][2] = [TileSubtype.PORTAL];
      return baseState(map, { portalLocation: { ...DUNGEON_PORTAL } });
    }

    it("stashes the dungeon's portal on entry and hands the realm an empty slot", () => {
      const inRealm = movePlayer(floorWithRingAndPortal(), Direction.RIGHT);

      expect(inRealm.inPinkRealm).toBe(true);
      expect(inRealm.portalLocation).toBeUndefined();
      expect(inRealm.dungeonReturn?.portalLocation).toEqual(DUNGEON_PORTAL);
    });

    it("restores the dungeon's portal on the way out", () => {
      const inRealm = movePlayer(floorWithRingAndPortal(), Direction.RIGHT);
      const back = stepBackThroughRing(inRealm);

      expect(back.inPinkRealm).toBeFalsy();
      expect(back.portalLocation).toEqual(DUNGEON_PORTAL);
      // And the marker the player can see is still on that tile.
      expect(back.mapData.subtypes[2][2]).toContain(TileSubtype.PORTAL);
    });

    it("does not let a portal set inside the realm follow the hero back out", () => {
      const inRealm = movePlayer(floorWithRingAndPortal(), Direction.RIGHT);
      // The medallion sets a portal on the realm's own map (what the UI does).
      const setInRealm: GameState = {
        ...inRealm,
        portalLocation: { ...SUBAREA_PORTAL },
      };

      const back = stepBackThroughRing(setInRealm);

      expect(back.portalLocation).toEqual(DUNGEON_PORTAL);
      // The realm's coordinates are a wall back here — the bug was traveling to them.
      expect(back.mapData.tiles[0][0]).toBe(WALL);
    });

    it("leaves no portal behind when the hero had none before the realm", () => {
      const map = arena(12, 5, 5);
      map.subtypes[5][6] = [TileSubtype.PINK_RING];
      const inRealm = movePlayer(baseState(map), Direction.RIGHT);
      const setInRealm: GameState = {
        ...inRealm,
        portalLocation: { ...SUBAREA_PORTAL },
      };

      expect(stepBackThroughRing(setInRealm).portalLocation).toBeUndefined();
    });
  });

  describe("nightmare room", () => {
    /** The pink realm with the hero on its outer breach and a portal parked at (2,2). */
    function realmWithBreachAndPortal(): GameState {
      const map = arena(11, 5, 5);
      map.subtypes[5][5] = [];
      map.tiles[5][0] = FLOOR;
      map.subtypes[5][0] = [TileSubtype.PLAYER, TileSubtype.BREACH];
      map.subtypes[2][2] = [TileSubtype.PORTAL];
      map.environment = "pink_realm";
      return baseState(map, {
        inPinkRealm: true,
        mist: [],
        playerDirection: Direction.LEFT,
        portalLocation: { ...DUNGEON_PORTAL },
      });
    }

    it("stashes the realm's portal on the way in and restores it on the way back", () => {
      const nightmare = movePlayer(realmWithBreachAndPortal(), Direction.LEFT);
      expect(nightmare.inNightmare).toBe(true);
      expect(nightmare.portalLocation).toBeUndefined();
      expect(nightmare.realmReturn?.portalLocation).toEqual(DUNGEON_PORTAL);

      // Walk back out through the nightmare's inner (right-edge) breach: onto it, then
      // off the edge.
      const setInside: GameState = {
        ...nightmare,
        portalLocation: { ...SUBAREA_PORTAL },
      };
      const atEdge = movePlayer(setInside, Direction.RIGHT);
      const back = movePlayer(atEdge, Direction.RIGHT);
      expect(back.inPinkRealm).toBe(true);
      expect(back.portalLocation).toEqual(DUNGEON_PORTAL);
    });
  });

  describe("outside world", () => {
    it("stashes the dungeon's portal outside and restores it on the walk back in", () => {
      const size = 10;
      const map = arena(size, 4, size - 1);
      map.subtypes[4][size - 1] = [TileSubtype.PLAYER, TileSubtype.BREACH];
      map.tiles[4][size - 1] = FLOOR;
      map.subtypes[2][2] = [TileSubtype.PORTAL];
      const state = baseState(map, { portalLocation: { ...DUNGEON_PORTAL } });

      const outside = movePlayer(state, Direction.RIGHT);
      expect(outside.inOutsideWorld).toBe(true);
      expect(outside.portalLocation).toBeUndefined();
      expect(outside.dungeonReturn?.portalLocation).toEqual(DUNGEON_PORTAL);

      // Set one out in the grassland, then walk back through the inner breach.
      const setOutside: GameState = {
        ...outside,
        portalLocation: { ...SUBAREA_PORTAL },
      };
      const atEdge = movePlayer(setOutside, Direction.LEFT);
      const back = movePlayer(atEdge, Direction.LEFT);

      expect(back.inOutsideWorld).toBeFalsy();
      expect(back.portalLocation).toEqual(DUNGEON_PORTAL);
    });
  });

  describe("boss arena", () => {
    it("stashes the floor's portal on entry and restores it on the way out", () => {
      const tiles = [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
      ];
      const subtypes: number[][][] = tiles.map((row) => row.map(() => [] as number[]));
      subtypes[2][1] = [TileSubtype.PLAYER];
      subtypes[2][2] = [TileSubtype.BOSS_ENTRANCE];
      subtypes[1][1] = [TileSubtype.PORTAL];
      const floor = baseState(
        { tiles, subtypes, environment: "cave" },
        {
          currentFloor: 3,
          maxFloors: 3,
          portalLocation: { roomId: "__base__", position: [1, 1] },
        }
      );

      const entered = movePlayer(floor, Direction.RIGHT);
      expect(entered.inBossRoom).toBe(true);
      expect(entered.portalLocation).toBeUndefined();
      expect(entered.bossReturn?.portalLocation).toEqual({
        roomId: "__base__",
        position: [1, 1],
      });

      // Set one in the arena, then step off the arrival tile and back onto it.
      const setInArena: GameState = {
        ...entered,
        portalLocation: { ...SUBAREA_PORTAL },
      };
      const back = movePlayer(movePlayer(setInArena, Direction.UP), Direction.DOWN);

      expect(back.inBossRoom).toBeFalsy();
      expect(back.portalLocation).toEqual({ roomId: "__base__", position: [1, 1] });
    });
  });
});
