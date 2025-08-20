import { Enemy, EnemyState, updateEnemies } from "../../lib/enemy";

function open(n = 9) { return Array.from({ length: n }, () => Array(n).fill(0)); }

describe("stone-exciter close-range behavior", () => {
  test("within 2 tiles: faces hero and attacks only after moving (post-arrival)", () => {
    const grid = open(9);
    const player = { y: 4, x: 4 };
    const exciter = new Enemy({ y: 4, x: 6 }); // dist = 2 horizontally
    exciter.kind = 'stone-exciter';

    // One tick: should perform close-range chase (two greedy steps), end adjacent at (4,5), then attack
    const dmg = updateEnemies(grid, [exciter], player);

    // It should have moved and ended adjacent
    expect(exciter.y).toBe(4);
    expect(exciter.x).toBe(5);
    // Facing the hero (to the LEFT)
    expect(exciter.state).toBe(EnemyState.HUNTING);
    // Damage applied after movement
    expect(dmg).toBe(5);
  });
});
