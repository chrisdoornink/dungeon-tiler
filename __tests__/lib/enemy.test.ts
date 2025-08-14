import { canSee } from "../../lib/line_of_sight";
import { Enemy, EnemyState, placeEnemies } from "../../lib/enemy";

// Helper: simple empty 10x10 floor map with a few walls for LOS tests
const makeMap = () => {
  const grid = Array.from({ length: 10 }, () => Array(10).fill(0));
  // Vertical wall at x=4, except a gap at y=5
  for (let y = 0; y < 10; y++) {
    if (y !== 5) grid[y][4] = 1;
  }
  return grid as number[][];
};

describe("Enemy basic behaviors (TDD)", () => {
  test("enemy switches to HUNTING when it has line of sight to player (through gap)", () => {
    const grid = makeMap();
    // Place both on the same row as the gap (y=5) so LOS passes horizontally through the opening
    const player = { y: 5, x: 2 };
    const enemy = new Enemy({ y: 5, x: 7 });
    expect(canSee(grid, [enemy.y, enemy.x], [player.y, player.x])).toBe(true);
    enemy.update({ grid, player });
    expect(enemy.state).toBe(EnemyState.HUNTING);
  });

  test("enemy in HUNTING moves one step toward player on clear floor", () => {
    const grid = makeMap();
    const player = { y: 5, x: 2 };
    const enemy = new Enemy({ y: 5, x: 7 });

    // Confirm LOS through the gap
    expect(canSee(grid, [enemy.y, enemy.x], [player.y, player.x])).toBe(true);

    enemy.update({ grid, player });

    // Should take one step left toward player
    expect(enemy.y).toBe(5);
    expect(enemy.x).toBe(6);
    expect(enemy.state).toBe(EnemyState.HUNTING);
  });

  test("enemy does not move through walls; stays put if first step blocked and no alternate axis", () => {
    const grid = makeMap();
    // Block the immediate step at (5,6)
    grid[5][6] = 1;
    const player = { y: 5, x: 2 };
    const enemy = new Enemy({ y: 5, x: 7 });

    enemy.update({ grid, player });

    // Cannot step left into wall; no vertical delta to try, so stays
    expect(enemy.y).toBe(5);
    expect(enemy.x).toBe(7);
  });

  test("placeEnemies: places requested count on floor tiles, not overlapping player or each other", () => {
    const grid = makeMap();
    const player = { y: 1, x: 1 };
    const enemies = placeEnemies({
      grid,
      player,
      count: 3,
      minDistanceFromPlayer: 3,
      rng: () => 0.5, // deterministic-ish mid value
    });

    expect(enemies.length).toBe(3);

    const seen = new Set(enemies.map((e: Enemy) => `${e.y},${e.x}`));
    expect(seen.size).toBe(3); // unique positions

    // All on floor
    for (const e of enemies) {
      expect(grid[e.y][e.x]).toBe(0);
      // Not near player
      const dy = e.y - player.y;
      const dx = e.x - player.x;
      expect(Math.hypot(dy, dx)).toBeGreaterThanOrEqual(3);
    }
  });
});
