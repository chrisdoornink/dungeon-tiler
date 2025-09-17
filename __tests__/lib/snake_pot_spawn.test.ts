import { Direction, TileSubtype, movePlayer, type GameState } from "../../lib/map";
import { createEmptyByKind } from "../../lib/enemies/registry";

function makeEmptyState(): GameState {
  const size = 25;
  const tiles = Array.from({ length: size }, () => Array(size).fill(0));
  const subtypes = Array.from({ length: size }, () => Array.from({ length: size }, () => [] as number[]));
  // Place player at (12,12)
  subtypes[12][12] = [TileSubtype.PLAYER];
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: { tiles, subtypes },
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    heroHealth: 5,
    heroAttack: 1,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0, byKind: createEmptyByKind() },
    recentDeaths: [],
    heroTorchLit: true,
  } as unknown as GameState;
}

describe("Snake in pot behavior", () => {
  test("opening a snake pot spawns a snake and immediately applies poison attack", () => {
    const gs = makeEmptyState();
    // Place a pot with a snake tag above the player at (11,12)
    gs.mapData.subtypes[11][12] = [TileSubtype.POT, TileSubtype.SNAKE];

    const after = movePlayer(gs, Direction.UP);

    // Player should not move onto the pot tile on reveal action
    expect(after.mapData.subtypes[12][12]).toContain(TileSubtype.PLAYER);
    // The pot should now be gone and an enemy list should include a snake at (11,12)
    const spawned = (after.enemies || []).find(e => e.y === 11 && e.x === 12 && e.kind === "snake");
    expect(spawned).toBeTruthy();

    // Player should have poison condition active
    expect(after.conditions?.poisoned?.active).toBe(true);
    // Poison attack deals normal enemy damage on open; damageTaken increments by >= 1
    expect(after.stats.damageTaken).toBeGreaterThanOrEqual(1);
  });
});
