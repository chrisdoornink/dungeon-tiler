import { Enemy, EnemyState, updateEnemies } from "../../lib/enemy";

function makeOpen(n = 9) { return Array.from({ length: n }, () => Array(n).fill(0)); }

describe("stone-exciter extended behavior", () => {
  test("ghost within 4 tiles triggers hunting even if player is far", () => {
    const grid = makeOpen(9);
    const player = { y: 8, x: 8 }; // far from exciter
    const exciter = new Enemy({ y: 4, x: 4 });
    // place a ghost within radius 4 of exciter
    const ghost = new Enemy({ y: 4, x: 7 });
    ghost.kind = 'ghost';

    // One tick update; expect exciter to enter HUNTING
    updateEnemies(grid, [exciter, ghost], player);
    expect(exciter.state).toBe(EnemyState.HUNTING);
  });

  test("cooldown: after 5 hunting turns in range, stays IDLE until out-of-range then retriggers", () => {
    const grid = makeOpen(9);
    const player = { y: 4, x: 0 };
    const exciter = new Enemy({ y: 4, x: 4 }); // dist 4
    exciter.kind = 'stone-exciter';

    // Hunt for 5 turns
    for (let t = 0; t < 5; t++) {
      updateEnemies(grid, [exciter], player);
      expect(exciter.state).toBe(EnemyState.HUNTING);
    }
    // Next tick still within 4 -> should now be IDLE due to cooldown
    updateEnemies(grid, [exciter], player);
    expect(exciter.state).toBe(EnemyState.IDLE);

    // Move player out of range (>4)
    player.x = 9;
    updateEnemies(grid, [exciter], player);
    expect(exciter.state).toBe(EnemyState.IDLE);

    // Move back within range
    player.x = 1;
    updateEnemies(grid, [exciter], player);
    expect(exciter.state).toBe(EnemyState.HUNTING);
  });

  test("idle wandering: moves 1 tile when only one opening exists", () => {
    const grid = makeOpen(7);
    // surround exciter with walls except one opening to the left
    const exciter = new Enemy({ y: 3, x: 3 });
    exciter.kind = 'stone-exciter';
    const player = { y: 0, x: 6 }; // out of range (>4) via Manhattan
    // walls around except (2,1)
    grid[2][3] = 1; // up
    grid[3][4] = 1; // right
    grid[4][3] = 1; // down
    // left (3,2) stays 0

    const prev = { y: exciter.y, x: exciter.x };
    updateEnemies(grid, [exciter], player);
    const manhattanMoved = Math.abs(exciter.y - prev.y) + Math.abs(exciter.x - prev.x);
    expect(manhattanMoved).toBe(1);
    expect(exciter.y).toBe(3);
    expect(exciter.x).toBe(2);
  });
});
