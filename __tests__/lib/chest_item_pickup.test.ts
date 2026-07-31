import { Enemy } from "../../lib/enemy";
import { TileSubtype, Direction } from "../../lib/map";
import { movePlayer } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";

/**
 * Chest loot sits loose on the floor once the chest is opened, and enemies wander over
 * it. Regression cover for the melee-bump duplicate: the pickup must only fire when the
 * hero actually ENTERS the tile, never when a swing at an enemy standing on the loot
 * resolves in place. Getting this wrong re-granted the item on every hit (a shipped run
 * recorded ["sword","shield","shield","shield","bomb","extra_heart"], and EXTRA_HEART /
 * BOMB stacked their effects per swing).
 */

function baseState(
  tiles: number[][],
  subtypes: number[][][],
  overrides: Partial<GameState> = {}
): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: { tiles, subtypes },
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    enemies: [],
    npcs: [],
    rockCount: 0,
    runeCount: 0,
    bombCount: 0,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

/** 3x3 floor, hero at (1,0), the given loot tags at (1,1). */
function lootBoard(loot: TileSubtype[]): { tiles: number[][]; subtypes: number[][][] } {
  return {
    tiles: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    subtypes: [
      [[], [], []],
      [[TileSubtype.PLAYER], [...loot], []],
      [[], [], []],
    ],
  };
}

/** An enemy tanky enough to survive every swing a test throws at it. */
function tank(y: number, x: number): Enemy {
  const e = new Enemy({ y, x });
  e.health = 999;
  return e;
}

describe("chest loot pickup", () => {
  test("walking onto revealed loot records it exactly once and clears the tile", () => {
    const { tiles, subtypes } = lootBoard([TileSubtype.SHIELD]);
    let state = baseState(tiles, subtypes);

    state = movePlayer(state, Direction.RIGHT);

    expect(state.hasShield).toBe(true);
    expect(state.stats.chestItemsCollected).toEqual(["shield"]);
    expect(state.mapData.subtypes[1][1]).not.toContain(TileSubtype.SHIELD);
  });

  test("stepping back and forth over a collected tile does not re-record", () => {
    const { tiles, subtypes } = lootBoard([TileSubtype.SHIELD]);
    let state = baseState(tiles, subtypes);

    state = movePlayer(state, Direction.RIGHT);
    state = movePlayer(state, Direction.LEFT);
    state = movePlayer(state, Direction.RIGHT);

    expect(state.stats.chestItemsCollected).toEqual(["shield"]);
  });

  test("swinging at an enemy standing on loot does not collect it", () => {
    const { tiles, subtypes } = lootBoard([TileSubtype.SHIELD]);
    let state = baseState(tiles, subtypes, {
      enemies: [tank(1, 1)],
      combatRng: () => 0.5,
    });

    for (let i = 0; i < 3; i++) state = movePlayer(state, Direction.RIGHT);

    expect(state.hasShield).toBeFalsy();
    expect(state.stats.chestItemsCollected ?? []).toEqual([]);
    // The loot is still there, waiting for the hero to actually step on it.
    expect(state.mapData.subtypes[1][1]).toContain(TileSubtype.SHIELD);
    expect(state.stats.damageDealt).toBeGreaterThan(0);
  });

  test("EXTRA_HEART and BOMB do not stack per melee swing", () => {
    const { tiles, subtypes } = lootBoard([TileSubtype.EXTRA_HEART, TileSubtype.BOMB]);
    let state = baseState(tiles, subtypes, {
      enemies: [tank(1, 1)],
      combatRng: () => 0.5,
    });

    for (let i = 0; i < 4; i++) state = movePlayer(state, Direction.RIGHT);

    expect(state.heroMaxHealth).toBe(5);
    expect(state.bombCount).toBe(0);
    expect(state.stats.chestItemsCollected ?? []).toEqual([]);
  });

  test("loot is collected once the enemy guarding it is gone", () => {
    const { tiles, subtypes } = lootBoard([TileSubtype.EXTRA_HEART]);
    const guard = new Enemy({ y: 1, x: 1 });
    guard.health = 1;
    let state = baseState(tiles, subtypes, {
      enemies: [guard],
      combatRng: () => 0.5,
    });

    state = movePlayer(state, Direction.RIGHT); // kills the guard, hero stays put
    expect(state.enemies?.length ?? 0).toBe(0);
    expect(state.heroMaxHealth).toBe(5);

    state = movePlayer(state, Direction.RIGHT); // now actually steps onto the loot

    expect(state.heroMaxHealth).toBe(6);
    expect(state.heroHealth).toBe(6);
    expect(state.stats.chestItemsCollected).toEqual(["extra_heart"]);
    expect(state.mapData.subtypes[1][1]).not.toContain(TileSubtype.EXTRA_HEART);
  });

  test("a still-locked chest is not looted by bumping into it", () => {
    const { tiles, subtypes } = lootBoard([
      TileSubtype.CHEST,
      TileSubtype.SHIELD,
      TileSubtype.LOCK,
    ]);
    let state = baseState(tiles, subtypes, { chestKeyCount: 0 });

    state = movePlayer(state, Direction.RIGHT);

    expect(state.hasShield).toBeFalsy();
    expect(state.stats.chestItemsCollected ?? []).toEqual([]);
    expect(state.mapData.subtypes[1][1]).toContain(TileSubtype.SHIELD);
  });
});
