import {
  Direction,
  TileSubtype,
  type GameState,
  movePlayer,
  performUsePinkHeart,
  performUseBerry,
  PINK_HEART_BONUS_HEARTS,
} from "../../lib/map";
import { FLOOR } from "../../lib/map/constants";
import { buildPinkRealm } from "../../lib/map/pink-realm";
import { EnemyRegistry, type EnemyKind } from "../../lib/enemies/registry";
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
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
    ...overrides,
  };
}

describe("Pink realm prizes", () => {
  describe("pickup", () => {
    it("collects a pink flaming heart off the floor and clears the tile", () => {
      const map = arena(10, 5, 5);
      map.subtypes[5][6] = [TileSubtype.PINK_HEART];
      const state = baseState(map);

      const after = movePlayer(state, Direction.RIGHT);

      expect(after.pinkHeartCount ?? 0).toBe(1);
      expect(after.mapData.subtypes[5][6]).not.toContain(TileSubtype.PINK_HEART);
    });

    it("collects a belted berry off the floor and clears the tile", () => {
      const map = arena(10, 5, 5);
      map.subtypes[5][6] = [TileSubtype.BERRY];
      const state = baseState(map);

      const after = movePlayer(state, Direction.RIGHT);

      expect(after.berryCount ?? 0).toBe(1);
      expect(after.mapData.subtypes[5][6]).not.toContain(TileSubtype.BERRY);
    });
  });

  describe("performUsePinkHeart", () => {
    it("refills to full health and grants 3 temporary pink hearts, consuming one", () => {
      const map = arena(10, 5, 5);
      const state = baseState(map, { heroHealth: 2, pinkHeartCount: 1 });

      const after = performUsePinkHeart(state);

      expect(after.heroHealth).toBe(5); // full heal to heroMaxHealth
      expect(after.bonusHearts).toBe(PINK_HEART_BONUS_HEARTS); // 3
      expect(after.pinkHeartCount).toBe(0); // consumed
      expect(after.stats.pinkHeartsUsed).toBe(1);
    });

    it("is a no-op when none are held", () => {
      const map = arena(10, 5, 5);
      const state = baseState(map, { heroHealth: 2, pinkHeartCount: 0 });

      const after = performUsePinkHeart(state);

      expect(after.heroHealth).toBe(2);
      expect(after.bonusHearts ?? 0).toBe(0);
    });
  });

  describe("performUseBerry", () => {
    it("heals 3 hearts when the roll is high, consuming one berry", () => {
      const map = arena(10, 5, 5);
      const state = baseState(map, {
        heroHealth: 1,
        berryCount: 2,
        combatRng: () => 0.9, // >= 0.5 -> heals 3
      });

      const after = performUseBerry(state);

      expect(after.heroHealth).toBe(4); // 1 + 3
      expect(after.berryCount).toBe(1);
      expect(after.stats.berriesUsed).toBe(1);
    });

    it("heals 2 hearts when the roll is low", () => {
      const map = arena(10, 5, 5);
      const state = baseState(map, {
        heroHealth: 1,
        berryCount: 1,
        combatRng: () => 0.1, // < 0.5 -> heals 2
      });

      const after = performUseBerry(state);

      expect(after.heroHealth).toBe(3); // 1 + 2
      expect(after.berryCount).toBe(0);
    });

    it("clamps healing to heroMaxHealth (does not overheal into pink hearts)", () => {
      const map = arena(10, 5, 5);
      const state = baseState(map, {
        heroHealth: 4,
        heroMaxHealth: 5,
        berryCount: 1,
        combatRng: () => 0.9, // would heal 3
      });

      const after = performUseBerry(state);

      expect(after.heroHealth).toBe(5);
      expect(after.bonusHearts ?? 0).toBe(0); // berries never grant bonus hearts
    });
  });

  describe("bonus hearts absorb damage before real health", () => {
    it("poison damage drains pink bonus hearts first", () => {
      const map = arena(10, 5, 5);
      const state = baseState(map, {
        heroHealth: 5,
        bonusHearts: 3,
        conditions: {
          poisoned: {
            active: true,
            stepsSinceLastDamage: 0,
            damagePerInterval: 2,
            stepInterval: 1,
          },
        },
      });

      const after = movePlayer(state, Direction.RIGHT);

      expect(after.bonusHearts).toBe(1); // 3 - 2 absorbed
      expect(after.heroHealth).toBe(5); // real health untouched
    });

    it("spills over to real health once the buffer is exhausted", () => {
      const map = arena(10, 5, 5);
      const state = baseState(map, {
        heroHealth: 5,
        bonusHearts: 1,
        conditions: {
          poisoned: {
            active: true,
            stepsSinceLastDamage: 0,
            damagePerInterval: 2,
            stepInterval: 1,
          },
        },
      });

      const after = movePlayer(state, Direction.RIGHT);

      expect(after.bonusHearts).toBe(0); // buffer emptied
      expect(after.heroHealth).toBe(4); // remaining 1 damage hits health
    });
  });

  describe("buildPinkRealm scatter", () => {
    it("locks the heart in a chest, plants a key, and scatters four berries", () => {
      const source = arena(15, 7, 7);
      const { mapData, entry } = buildPinkRealm(source, [7, 7]);

      let hearts = 0;
      let berries = 0;
      let rings = 0;
      let chests = 0;
      let locks = 0;
      let keys = 0;
      let chestCell: number[] | null = null;
      for (let y = 0; y < mapData.subtypes.length; y++) {
        for (let x = 0; x < mapData.subtypes[y].length; x++) {
          const cell = mapData.subtypes[y][x];
          if (cell.includes(TileSubtype.PINK_HEART)) hearts++;
          if (cell.includes(TileSubtype.BERRY)) berries++;
          if (cell.includes(TileSubtype.PINK_RING)) rings++;
          if (cell.includes(TileSubtype.CHEST)) {
            chests++;
            chestCell = cell;
          }
          if (cell.includes(TileSubtype.LOCK)) locks++;
          if (cell.includes(TileSubtype.KEY)) keys++;
        }
      }

      expect(hearts).toBe(1);
      expect(berries).toBe(4);
      expect(rings).toBe(1);
      expect(chests).toBe(1);
      expect(locks).toBe(1);
      expect(keys).toBe(1);
      // The single heart lives inside the single locked chest (not loose on the floor).
      expect(chestCell).not.toBeNull();
      expect(chestCell).toContain(TileSubtype.PINK_HEART);
      expect(chestCell).toContain(TileSubtype.LOCK);
      // The entry tile is the return ring only — no prize on it.
      expect(mapData.subtypes[entry[0]][entry[1]]).toEqual([TileSubtype.PINK_RING]);
    });
  });

  describe("locked heart chest", () => {
    it("opens with a key and grants the pink heart on the follow-up step", () => {
      const map = arena(10, 5, 5);
      map.subtypes[5][6] = [
        TileSubtype.CHEST,
        TileSubtype.PINK_HEART,
        TileSubtype.LOCK,
      ];
      // Multi-tier (daily/realm) so keys are consumable chest keys.
      const state = baseState(map, {
        maxFloors: 3,
        currentFloor: 1,
        chestKeyCount: 1,
      });

      // Step 1: onto the locked chest -> unlocks + opens in place, consumes the key,
      // hero stays put, heart not yet collected.
      const opened = movePlayer(state, Direction.RIGHT);
      expect(opened.chestKeyCount).toBe(0);
      expect(opened.mapData.subtypes[5][6]).toContain(TileSubtype.OPEN_CHEST);
      expect(opened.mapData.subtypes[5][6]).not.toContain(TileSubtype.LOCK);
      expect(opened.mapData.subtypes[5][6]).not.toContain(TileSubtype.CHEST);
      expect(opened.pinkHeartCount ?? 0).toBe(0);

      // Step 2: onto the now-open chest -> collect the heart.
      const collected = movePlayer(opened, Direction.RIGHT);
      expect(collected.pinkHeartCount).toBe(1);
      expect(collected.mapData.subtypes[5][6]).not.toContain(
        TileSubtype.PINK_HEART
      );
    });

    it("stays locked and ungrabbed without a key", () => {
      const map = arena(10, 5, 5);
      map.subtypes[5][6] = [
        TileSubtype.CHEST,
        TileSubtype.PINK_HEART,
        TileSubtype.LOCK,
      ];
      const state = baseState(map, {
        maxFloors: 3,
        currentFloor: 1,
        chestKeyCount: 0,
      });

      const after = movePlayer(state, Direction.RIGHT);
      expect(after.pinkHeartCount ?? 0).toBe(0);
      expect(after.mapData.subtypes[5][6]).toContain(TileSubtype.CHEST);
      expect(after.mapData.subtypes[5][6]).toContain(TileSubtype.LOCK);
    });
  });
});

// Direct exercises of the registry behavior hooks for the realm-only enemy changes.
function floorGrid(size: number): number[][] {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}
function emptySubs(size: number): number[][][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );
}

describe("ninja pink goblin behavior (realm)", () => {
  const pinkUpdate = EnemyRegistry["pink-goblin"].behavior!.customUpdate!;

  const ctxFor = (
    grid: number[][],
    subs: number[][][],
    enemy: {
      y: number;
      x: number;
      facing: "UP" | "RIGHT" | "DOWN" | "LEFT";
      memory: Record<string, unknown>;
      attack: number;
    },
    player: { y: number; x: number },
    rng: () => number
  ) => ({
    grid,
    subtypes: subs,
    enemies: [
      {
        y: enemy.y,
        x: enemy.x,
        kind: "pink-goblin" as EnemyKind,
        health: 4,
        behaviorMemory: enemy.memory,
      },
    ],
    enemyIndex: 0,
    player: { ...player, torchLit: true },
    rng,
    enemy,
  });

  it("strikes for high melee and blinks far away when adjacent", () => {
    const grid = floorGrid(21);
    const subs = emptySubs(21);
    const player = { y: 10, x: 10 };
    const enemy = {
      y: 10,
      x: 11,
      facing: "LEFT" as const,
      memory: { ninja: true, aware: true } as Record<string, unknown>,
      attack: 1,
    };
    const dmg = pinkUpdate(ctxFor(grid, subs, enemy, player, () => 0));
    expect(dmg).toBe(4); // NINJA_MELEE (engine adds variance + cap on top)
    const dist = Math.abs(enemy.y - player.y) + Math.abs(enemy.x - player.x);
    expect(dist).toBeGreaterThanOrEqual(6); // fled far across the realm
  });

  it("slides several tiles toward the player when approaching (no ring)", () => {
    const grid = floorGrid(21);
    const subs = emptySubs(21);
    const player = { y: 10, x: 10 };
    const enemy = {
      y: 10,
      x: 18,
      facing: "LEFT" as const,
      memory: { ninja: true, aware: true } as Record<string, unknown>,
      attack: 1,
    };
    const before = Math.abs(enemy.y - player.y) + Math.abs(enemy.x - player.x); // 8
    const dmg = pinkUpdate(ctxFor(grid, subs, enemy, player, () => 0.5));
    expect(dmg).toBe(0);
    const after = Math.abs(enemy.y - player.y) + Math.abs(enemy.x - player.x);
    expect(before - after).toBeGreaterThanOrEqual(3); // slid 3-4 tiles closer
    // Ninjas never drop a teleport ring in the realm.
    let rings = 0;
    for (const row of subs) for (const cell of row) if (cell.includes(TileSubtype.PINK_RING)) rings++;
    expect(rings).toBe(0);
  });
});

describe("realm white goblin buff", () => {
  const whiteUpdate = EnemyRegistry["white-goblin"].behavior!.customUpdate!;

  const adjacentBite = (realmBuffed: boolean): number => {
    const grid = floorGrid(11);
    const subs = emptySubs(11);
    const memory: Record<string, unknown> = realmBuffed ? { realmBuffed: true } : {};
    const enemy = { y: 5, x: 6, facing: "LEFT" as const, memory, attack: 1 };
    return whiteUpdate({
      grid,
      subtypes: subs,
      enemies: [
        { y: 5, x: 6, kind: "white-goblin" as EnemyKind, health: 3, behaviorMemory: memory },
      ],
      enemyIndex: 0,
      player: { y: 5, x: 5, torchLit: true },
      rng: () => 0.5,
      enemy,
    });
  };

  it("buffed white goblins bite harder than dungeon ones (no flankers)", () => {
    expect(adjacentBite(true)).toBe(3); // realm base 3
    expect(adjacentBite(false)).toBe(2); // dungeon base 2
  });
});

describe("pink realm population (on warp)", () => {
  it("spawns 4 buffed white-goblin swarms and 4 ninja pink goblins", () => {
    // Stand next to an unclaimed leftover pink ring (no living pink goblins) and step on
    // it to warp into the realm, which runs buildPinkRealmEnemies.
    const map = arena(25, 12, 12);
    map.subtypes[12][13] = [TileSubtype.PINK_RING];
    const state = baseState(map, { maxFloors: 3, currentFloor: 1, enemies: [] });

    const realm = movePlayer(state, Direction.RIGHT);

    expect(realm.inPinkRealm).toBe(true);
    const enemies = realm.enemies ?? [];
    const whites = enemies.filter((e) => e.kind === "white-goblin");
    const pinks = enemies.filter((e) => e.kind === "pink-goblin");

    expect(whites.length).toBe(16); // 4 swarms x 4 goblins
    expect(pinks.length).toBe(4);
    // Ninjas are tagged so the registry runs the realm hit-and-run behavior.
    expect(pinks.every((p) => p.behaviorMemory?.ninja === true)).toBe(true);
    // Whites are buffed: tougher (HP 3) and harder-hitting (realmBuffed flag).
    expect(
      whites.every(
        (w) => w.health === 3 && w.behaviorMemory?.realmBuffed === true
      )
    ).toBe(true);
  });
});
