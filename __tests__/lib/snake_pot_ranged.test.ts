import {
  Direction,
  TileSubtype,
  type GameState,
  performThrowRock,
  performThrowRune,
  detonateLiveBombs,
} from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { Enemy } from "../../lib/enemy";

/**
 * Ranged interactions with a pot (POT, optionally + SNAKE / + RUNE / food).
 *
 * A thrown ROCK or RUNE BREAKS the pot but does NOT destroy what's inside — the
 * contents are released onto the tile: a snake slithers out as a live enemy (no
 * free ambush bite, since you broke it from a distance), and runes/food are left
 * on the floor to pick up. A BOMB blast, being an explosion, obliterates the pot
 * and kills the snake outright.
 *
 * Regression guard for the earlier behavior where a thrown rock silently deleted
 * the snake and the pot's food.
 */

function makeCorridor(py: number, px: number, size = 12): MapData {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < size; y++) {
    tiles.push(new Array(size).fill(WALL));
    subtypes.push(Array.from({ length: size }, () => [] as number[]));
  }
  // Carve a floor row for the player and the throw path.
  for (let x = 0; x < size; x++) {
    tiles[py][x] = FLOOR;
    subtypes[py][x] = [];
  }
  subtypes[py][px] = [TileSubtype.PLAYER];
  return { tiles, subtypes };
}

function baseState(mapData: MapData, overrides: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    currentFloor: 2,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
    ...overrides,
  };
}

describe("Rock breaks a snake pot", () => {
  it("releases the snake as a live enemy without an ambush, and does not count as a kill", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = performThrowRock(baseState(map, { rockCount: 2 }));

    const tile = after.mapData.subtypes[py][px + 3];
    // Pot shattered, snake no longer hidden inside.
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    expect(tile).not.toContain(TileSubtype.ROCK);
    expect(after.rockCount).toBe(1);
    expect(after.stats.rocksThrown).toBe(1);
    // The snake slithered out as a live enemy at the pot tile.
    expect(after.enemies).toHaveLength(1);
    expect(after.enemies?.[0]?.kind).toBe("snake");
    expect(after.enemies?.[0]?.y).toBe(py);
    expect(after.enemies?.[0]?.x).toBe(px + 3);
    // Breaking it from range is NOT a kill: no credit, no spirit.
    expect(after.stats.enemiesDefeated).toBe(0);
    expect(after.stats.byKind?.snake ?? 0).toBe(0);
    expect(after.recentDeaths ?? []).toHaveLength(0);
    // No free ambush bite or poison — the player is at a distance.
    expect(after.heroHealth).toBe(5);
    expect(after.conditions?.poisoned?.active ?? false).toBe(false);
  });
});

describe("Rock breaks an ordinary pot", () => {
  it("reveals the pot's item on the floor instead of destroying it (deterministic override)", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT];
    const key = `${py},${px + 3}`;

    const after = performThrowRock(
      baseState(map, { rockCount: 1, potOverrides: { [key]: TileSubtype.FOOD } })
    );

    const tile = after.mapData.subtypes[py][px + 3];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).toContain(TileSubtype.FOOD);
    expect(after.rockCount).toBe(0);
    // The reveal override is consumed.
    expect(after.potOverrides?.[key]).toBeUndefined();
  });

  it("reveals a food or potion even without an override (contents are never destroyed)", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT];

    const after = performThrowRock(baseState(map, { rockCount: 1 }));

    const tile = after.mapData.subtypes[py][px + 3];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(
      tile.includes(TileSubtype.FOOD) || tile.includes(TileSubtype.MED)
    ).toBe(true);
  });

  it("reveals the rune from a rune pot", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT, TileSubtype.RUNE];

    const after = performThrowRock(baseState(map, { rockCount: 1 }));

    const tile = after.mapData.subtypes[py][px + 3];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).toContain(TileSubtype.RUNE);
  });
});

describe("Rune breaks a snake pot", () => {
  it("releases the snake and drops the thrown rune in front (no kill)", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = performThrowRune(baseState(map, { runeCount: 1, currentFloor: 3 }));

    const tile = after.mapData.subtypes[py][px + 3];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    expect(after.enemies).toHaveLength(1);
    expect(after.enemies?.[0]?.kind).toBe("snake");
    // Thrown rune lands on the floor tile just before the pot.
    expect(after.runeCount).toBe(0);
    expect(after.mapData.subtypes[py][px + 2]).toContain(TileSubtype.RUNE);
    // Not a kill.
    expect(after.stats.enemiesDefeated).toBe(0);
    expect(after.recentDeaths ?? []).toHaveLength(0);
  });

  it("keeps the rune in inventory when the snake pot is directly adjacent (nowhere to land)", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 1] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = performThrowRune(baseState(map, { runeCount: 1 }));

    const tile = after.mapData.subtypes[py][px + 1];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    expect(after.enemies).toHaveLength(1);
    expect(after.enemies?.[0]?.kind).toBe("snake");
    // Rune preserved (scarce resource not silently destroyed).
    expect(after.runeCount).toBe(1);
  });
});

describe("Bomb blast destroys a snake pot", () => {
  it("obliterates the pot and kills the snake (counts as a kill, blast VFX is its own feedback)", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 1] = [TileSubtype.BOMB_LIVE];
    map.subtypes[py][px + 2] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = detonateLiveBombs(baseState(map, { currentFloor: 2 }));

    const tile = after.mapData.subtypes[py][px + 2];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.stats.damageDealt).toBe(2);
    expect(after.stats.byKind?.snake).toBe(1);
    // No snake survives the blast (it is killed, not released).
    expect(after.enemies?.length ?? 0).toBe(0);
    expect(after.conditions?.poisoned?.active ?? false).toBe(false);
    // A snake pot pushes nothing onto defeatedEnemies, keeping the story-event
    // slice window exact.
    expect(after.defeatedEnemies ?? []).toHaveLength(0);
  });

  it("counts a snake pot AND a real enemy in the same blast without polluting the defeated-enemy window", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 2] = [TileSubtype.BOMB_LIVE];
    map.subtypes[py][px + 3] = [TileSubtype.POT, TileSubtype.SNAKE];
    const goblin = new Enemy({ y: py, x: px + 1 });
    goblin.kind = "fire-goblin";
    goblin.health = 1; // dies to the blast

    const after = detonateLiveBombs(
      baseState(map, { currentFloor: 2, enemies: [goblin] })
    );

    expect(after.stats.enemiesDefeated).toBe(2);
    expect(after.stats.byKind?.snake).toBe(1);
    expect(after.stats.byKind?.["fire-goblin"]).toBe(1);
    expect(after.enemies?.length ?? 0).toBe(0);
    // Only the real enemy is recorded in defeatedEnemies.
    expect(after.defeatedEnemies ?? []).toHaveLength(1);
    expect(after.defeatedEnemies?.[0]?.kind).toBe("fire-goblin");
  });
});
