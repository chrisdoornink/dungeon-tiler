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
 * Destroying a snake pot from range (rock, rune, or bomb) should kill the coiled
 * snake before it can ambush AND give the player clear credit: the POT+SNAKE tags
 * are cleared, the kill counts in stats (toward the snake/rock badges), and for
 * rock/rune the tile is added to recentDeaths so a spirit rises from the broken
 * pot. No live snake enemy should spawn and the hero should take no damage/poison.
 *
 * Regression guard for the prior bug where a thrown rock silently stripped the POT
 * tag, leaving an invisible orphaned SNAKE tag and giving zero feedback.
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

describe("Rock destroys a snake pot", () => {
  it("clears both tags, credits a snake kill, records the death, and leaves no live snake", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = performThrowRock(
      baseState(map, { rockCount: 2, currentFloor: 2 })
    );

    const tile = after.mapData.subtypes[py][px + 3];
    // Both the pot and the (invisible) snake marker are gone — no orphan tag.
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    // Rock consumed, none placed on the pot tile.
    expect(after.rockCount).toBe(1);
    expect(after.stats.rocksThrown).toBe(1);
    expect(tile).not.toContain(TileSubtype.ROCK);
    // Kill credited like any snake rock kill.
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.stats.enemiesKilledByRock).toBe(1);
    expect(after.stats.damageDealt).toBe(2);
    expect(after.stats.byKind?.snake).toBe(1);
    expect(after.stats.byFloor?.[2]?.snake).toBe(1);
    // Spirit VFX feedback: the tile is registered as a death this tick.
    expect(after.recentDeaths).toContainEqual([py, px + 3]);
    // The latent snake never becomes a live enemy and the hero is unharmed.
    expect(after.enemies?.length ?? 0).toBe(0);
    expect(after.heroHealth).toBe(5);
    expect(after.conditions?.poisoned?.active ?? false).toBe(false);
  });

  it("does not award a snake kill for an ordinary (non-snake) pot", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT];

    const after = performThrowRock(baseState(map, { rockCount: 1 }));

    expect(after.mapData.subtypes[py][px + 3]).not.toContain(TileSubtype.POT);
    expect(after.stats.enemiesDefeated).toBe(0);
    expect(after.stats.byKind?.snake ?? 0).toBe(0);
    expect(after.recentDeaths ?? []).toHaveLength(0);
  });
});

describe("Rune destroys a snake pot", () => {
  it("clears both tags, credits a snake kill, drops the rune in front, and records the death", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    map.subtypes[py][px + 3] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = performThrowRune(
      baseState(map, { runeCount: 1, currentFloor: 3 })
    );

    const tile = after.mapData.subtypes[py][px + 3];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    // Rune lands on the floor tile just before the pot, so it can be retrieved.
    expect(after.runeCount).toBe(0);
    expect(after.mapData.subtypes[py][px + 2]).toContain(TileSubtype.RUNE);
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.stats.damageDealt).toBe(2);
    expect(after.stats.byKind?.snake).toBe(1);
    // The rune-master badge is stone-goblin-specific; a snake rune kill must NOT
    // advance enemiesKilledByRune (matches normal rune kills of non-stone enemies).
    expect(after.stats.enemiesKilledByRune ?? 0).toBe(0);
    expect(after.recentDeaths).toContainEqual([py, px + 3]);
    expect(after.enemies?.length ?? 0).toBe(0);
    expect(after.heroHealth).toBe(5);
  });

  it("keeps the rune in inventory when a snake pot is directly adjacent (nowhere to land), still credits the kill", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    // Pot directly ahead of the player: there is no floor tile in front of it to
    // drop the bounced rune onto, so the rune must not be consumed.
    map.subtypes[py][px + 1] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = performThrowRune(baseState(map, { runeCount: 1, currentFloor: 2 }));

    const tile = after.mapData.subtypes[py][px + 1];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    // Rune preserved (scarce resource not silently destroyed on a smart play).
    expect(after.runeCount).toBe(1);
    // Snake still killed and credited.
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.stats.byKind?.snake).toBe(1);
    expect(after.recentDeaths).toContainEqual([py, px + 1]);
    expect(after.enemies?.length ?? 0).toBe(0);
  });
});

describe("Bomb blast destroys a snake pot", () => {
  it("clears both tags and credits a snake kill (blast VFX is its own feedback)", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    // A live bomb sits next to a snake pot, both on the carved floor row.
    map.subtypes[py][px + 1] = [TileSubtype.BOMB_LIVE];
    map.subtypes[py][px + 2] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = detonateLiveBombs(baseState(map, { currentFloor: 2 }));

    const tile = after.mapData.subtypes[py][px + 2];
    expect(tile).not.toContain(TileSubtype.POT);
    expect(tile).not.toContain(TileSubtype.SNAKE);
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.stats.damageDealt).toBe(2);
    expect(after.stats.byKind?.snake).toBe(1);
    expect(after.enemies?.length ?? 0).toBe(0);
    // The ranged kill avoids the walk-in ambush, so no poison is applied.
    expect(after.conditions?.poisoned?.active ?? false).toBe(false);
    // A snake pot pushes nothing onto defeatedEnemies (it never became a real
    // enemy), so the story-event slice window stays exact.
    expect(after.defeatedEnemies ?? []).toHaveLength(0);
  });

  it("counts a snake pot AND a real enemy in the same blast without polluting the defeated-enemy window", () => {
    const py = 5,
      px = 5;
    const map = makeCorridor(py, px);
    // Bomb at px+2; its 3x3 blast spans px+1..px+3 on the player's row.
    map.subtypes[py][px + 2] = [TileSubtype.BOMB_LIVE];
    map.subtypes[py][px + 3] = [TileSubtype.POT, TileSubtype.SNAKE];
    const goblin = new Enemy({ y: py, x: px + 1 });
    goblin.kind = "fire-goblin";
    goblin.health = 1; // dies to the blast

    const after = detonateLiveBombs(
      baseState(map, { currentFloor: 2, enemies: [goblin] })
    );

    // Both the snake pot and the real enemy are counted as kills.
    expect(after.stats.enemiesDefeated).toBe(2);
    expect(after.stats.byKind?.snake).toBe(1);
    expect(after.stats.byKind?.["fire-goblin"]).toBe(1);
    expect(after.enemies?.length ?? 0).toBe(0);
    // Only the real enemy is recorded in defeatedEnemies — the snake pot must not
    // inflate it, or the slice(-enemiesDefeated) story window would re-process a
    // stale enemy.
    expect(after.defeatedEnemies ?? []).toHaveLength(1);
    expect(after.defeatedEnemies?.[0]?.kind).toBe("fire-goblin");
  });
});
