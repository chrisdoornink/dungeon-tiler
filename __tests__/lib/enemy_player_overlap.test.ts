/**
 * Regression tests for the daily-mode "stuck run" bug (2026-07-20): a pink goblin
 * teleported onto the hero's tile and its ring cleanup erased the PLAYER marker
 * from the map, leaving the hero invisible/unfindable with every input dead —
 * persisted across refreshes via the auto-save.
 *
 * Covered here:
 *  1. The exact reproduction: hero standing on an owned (inert) ring, pressing
 *     into a wall — the goblin's ring teleport must not land on the hero and the
 *     PLAYER marker must survive the ring's removal/relocation.
 *  2. Engine-level guard: ANY enemy that ends its tick on the player's tile is
 *     reverted (updateEnemies occupancy set).
 *  3. cleanupPinkRing: killing the ring's owner while standing on the ring keeps
 *     the PLAYER marker.
 *  4. sanitizeLoadedGameState: corrupted saves (enemy on hero tile / missing
 *     PLAYER marker) are repaired at load.
 */
import {
  Direction,
  TileSubtype,
  type GameState,
  movePlayer,
  performThrowRune,
} from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";
import { findPlayerPosition } from "../../lib/map/player";
import type { MapData } from "../../lib/map/types";
import { Enemy, updateEnemies } from "../../lib/enemy";
import { EnemyRegistry } from "../../lib/enemies/registry";
import {
  sanitizeLoadedGameState,
  type StoredGameState,
} from "../../lib/current_game_storage";

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

function pinkGoblinWithRing(
  gy: number,
  gx: number,
  ringY: number,
  ringX: number,
  extraMem: Record<string, unknown> = {}
): Enemy {
  const e = new Enemy({ y: gy, x: gx });
  e.kind = "pink-goblin";
  Object.assign(e.behaviorMemory, {
    ringY,
    ringX,
    ringOrigSubs: [],
    ...extraMem,
  });
  return e;
}

describe("pink goblin ring teleport vs hero on the ring tile", () => {
  // Reproduction of the reported daily-mode bug: hero walked onto the goblin's
  // inert ring, then pressed into a wall (a blocked move still ticks enemies).
  // The goblin's aged ring rolled its 50% teleport — pre-fix it landed on the
  // hero's tile and removeRing() wiped the PLAYER marker off the map.
  function corruptionSetup() {
    const map = arena(12, 5, 5);
    // Hero stands ON the goblin's ring (owned rings are inert and walkable).
    map.subtypes[5][5] = [TileSubtype.PINK_RING, TileSubtype.PLAYER];
    // Wall below the hero: pressing DOWN is a blocked (but enemy-ticking) turn.
    map.tiles[6][5] = WALL;
    // Wall row above blocks line of sight to the goblin at (3,5), so the goblin
    // is aware (manhattan 2 <= 8) but sightless -> ring/teleport logic runs.
    for (let x = 0; x < 12; x++) map.tiles[4][x] = WALL;
    const goblin = pinkGoblinWithRing(3, 5, 5, 5, { aware: true, ringAge: 2 });
    // Constant low roll: pre-fix this forces the "teleport to ring" branch.
    const state = baseState(map, {
      enemies: [goblin],
      combatRng: () => 0.1,
    });
    return { state, goblin };
  }

  it("never lands the goblin on the hero's tile", () => {
    const { state, goblin } = corruptionSetup();
    const after = movePlayer(state, Direction.DOWN);
    expect(after.enemies).toContain(goblin);
    expect([goblin.y, goblin.x]).not.toEqual([5, 5]);
  });

  it("keeps the PLAYER marker when the ring is removed or relocated under the hero", () => {
    const { state } = corruptionSetup();
    const after = movePlayer(state, Direction.DOWN);
    expect(after.mapData.subtypes[5][5]).toContain(TileSubtype.PLAYER);
    expect(findPlayerPosition(after.mapData)).toEqual([5, 5]);
  });

  it("leaves the hero able to keep playing on the following turn", () => {
    const { state } = corruptionSetup();
    const afterBlocked = movePlayer(state, Direction.DOWN);
    const afterLeft = movePlayer(afterBlocked, Direction.LEFT);
    expect(findPlayerPosition(afterLeft.mapData)).toEqual([5, 4]);
  });

  it("keeps the PLAYER marker when the goblin gains LOS and cleans its ring up", () => {
    const map = arena(12, 5, 5);
    map.subtypes[5][5] = [TileSubtype.PINK_RING, TileSubtype.PLAYER];
    map.tiles[6][5] = WALL;
    // Same row, clear sight line, distance 4 -> LOS mode calls removeRing().
    const goblin = pinkGoblinWithRing(5, 1, 5, 5, { aware: true, ringAge: 1 });
    const state = baseState(map, { enemies: [goblin], combatRng: () => 0.1 });

    const after = movePlayer(state, Direction.DOWN);
    expect(after.mapData.subtypes[5][5]).toContain(TileSubtype.PLAYER);
    expect(after.mapData.subtypes[5][5]).not.toContain(TileSubtype.PINK_RING);
  });
});

describe("updateEnemies engine guard", () => {
  it("reverts any enemy move that ends on the player's tile", () => {
    const map = arena(9, 4, 4);
    const rogue = new Enemy({ y: 4, x: 6 });
    rogue.kind = "fire-goblin";
    const cfg = EnemyRegistry["fire-goblin"];
    const originalBehavior = cfg.behavior;
    // Force a behavior that jumps straight onto the player, like the old ring
    // teleport did — the engine's occupancy set must bounce it back.
    cfg.behavior = {
      customUpdate: (ctx) => {
        ctx.enemy.y = ctx.player.y;
        ctx.enemy.x = ctx.player.x;
        return 0;
      },
    };
    try {
      updateEnemies(map.tiles, map.subtypes, [rogue], { y: 4, x: 4 }, {});
    } finally {
      cfg.behavior = originalBehavior;
    }
    expect([rogue.y, rogue.x]).toEqual([4, 6]);
  });
});

describe("cleanupPinkRing with the hero standing on the ring", () => {
  it("keeps the PLAYER marker when the ring's owner is killed", () => {
    const map = arena(12, 5, 5);
    // Hero stands on the goblin's ring; the goblin is adjacent to the right.
    map.subtypes[5][5] = [TileSubtype.PINK_RING, TileSubtype.PLAYER];
    const goblin = pinkGoblinWithRing(5, 6, 5, 5);

    const after = performThrowRune(
      baseState(map, {
        enemies: [goblin],
        runeCount: 1,
        playerDirection: Direction.RIGHT,
      })
    );
    expect(after.enemies?.length ?? 0).toBe(0); // rune killed it
    expect(after.mapData.subtypes[5][5]).toContain(TileSubtype.PLAYER);
    expect(after.mapData.subtypes[5][5]).not.toContain(TileSubtype.PINK_RING);
  });
});

describe("sanitizeLoadedGameState", () => {
  function storedState(map: MapData, enemies: unknown[]): StoredGameState {
    return {
      ...baseState(map),
      enemies: enemies as GameState["enemies"],
      lastSaved: 0,
    } as StoredGameState;
  }

  it("moves an enemy off the hero's tile to the nearest open floor", () => {
    const map = arena(9, 4, 4);
    // Plain JSON enemy, as it comes out of localStorage (kind under _kind).
    const overlapped = { y: 4, x: 4, _kind: "pink-goblin" };
    const repaired = sanitizeLoadedGameState(storedState(map, [overlapped]));

    expect(findPlayerPosition(repaired.mapData)).toEqual([4, 4]);
    expect([overlapped.y, overlapped.x]).not.toEqual([4, 4]);
    // Evicted to an adjacent open tile, not flung across the map.
    expect(
      Math.abs(overlapped.y - 4) + Math.abs(overlapped.x - 4)
    ).toBe(1);
  });

  it("restores an erased hero at the overlapping pink goblin's tile", () => {
    const map = arena(9, 4, 4);
    map.subtypes[4][4] = []; // the corruption: PLAYER marker wiped entirely
    const goblin = { y: 4, x: 4, _kind: "pink-goblin" };
    const repaired = sanitizeLoadedGameState(storedState(map, [goblin]));

    // Hero restored exactly where the teleporting goblin landed on them...
    expect(findPlayerPosition(repaired.mapData)).toEqual([4, 4]);
    // ...and the goblin evicted off that tile.
    expect([goblin.y, goblin.x]).not.toEqual([4, 4]);
  });

  it("leaves a healthy save untouched", () => {
    const map = arena(9, 4, 4);
    const goblin = { y: 2, x: 7, _kind: "pink-goblin" };
    const repaired = sanitizeLoadedGameState(storedState(map, [goblin]));

    expect(findPlayerPosition(repaired.mapData)).toEqual([4, 4]);
    expect([goblin.y, goblin.x]).toEqual([2, 7]);
    expect(repaired.enemies?.length).toBe(1);
  });
});
