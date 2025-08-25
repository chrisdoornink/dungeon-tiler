import { Enemy, updateEnemies } from "../../lib/enemy";

// 7x7 open floor grid
const grid = Array.from({ length: 7 }, () => Array(7).fill(0));

function makeEnemy(y: number, x: number, kind: 'goblin' | 'ghost' | 'stone-exciter' = 'goblin') {
  const e = new Enemy({ y, x });
  e.kind = kind;
  return e;
}

describe("stone-exciter occupancy: cannot clip through or onto other enemies during double-step", () => {
  test("cannot pass through another enemy on first step toward player", () => {
    const player = { y: 3, x: 3 };
    // Stone-exciter at (3,6) moving left toward player, with a blocker at (3,5)
    const exciter = makeEnemy(3, 6, 'stone-exciter');
    const blocker = makeEnemy(3, 5, 'goblin');

    // Trigger hunt: player within 4 tiles horizontally (dist=3)
    updateEnemies(grid, [exciter, blocker], player);

    // Exciter should not move into or through (3,5); acceptable outcomes:
    // - stays at (3,6), or
    // - chooses an alternate step (e.g., down/up) that is not occupied
    expect(!(exciter.y === 3 && exciter.x === 5)).toBe(true);
  });

  test("cannot pass through another enemy on second step; must avoid occupied tiles per-step", () => {
    const player = { y: 3, x: 1 };
    // Exciter at (3,4), wants to move left twice toward player.
    // Place a blocker at (3,3) which would be the first step; ensure no clipping through to (3,2).
    const exciter = makeEnemy(3, 4, 'stone-exciter');
    const blocker = makeEnemy(3, 3, 'goblin');

    updateEnemies(grid, [exciter, blocker], player);

    // It must not end at (3,2) by passing through (3,3).
    expect(!(exciter.y === 3 && exciter.x === 2)).toBe(true);
    // And it must not occupy the blocker tile
    expect(!(exciter.y === 3 && exciter.x === 3)).toBe(true);
  });
});
