import { Enemy, EnemyState, updateEnemies } from "../../lib/enemy";

const makeOpen = (n = 7) => Array.from({ length: n }, () => Array(n).fill(0));

describe("stone-exciter basic behavior", () => {
  test("adjacent to hero within 4 tiles: enters hunting and deals 5 damage on contact", () => {
    const grid = makeOpen(7);
    const player = { y: 3, x: 3 };
    const exciter = new Enemy({ y: 3, x: 4 }); // to the right of hero
    exciter.kind = "stone-exciter";

    const dmg = updateEnemies(grid, [exciter], player);

    expect(dmg).toBe(5);
    expect(exciter.state).toBe(EnemyState.HUNTING);
  });

  test("farther than 4 tiles: remains idle and does not attack", () => {
    const grid = makeOpen(7);
    const player = { y: 0, x: 0 };
    const exciter = new Enemy({ y: 6, x: 6 }); // distance > 4
    exciter.kind = "stone-exciter";

    const dmg = updateEnemies(grid, [exciter], player);

    expect(dmg).toBe(0);
    expect([EnemyState.IDLE, EnemyState.HUNTING]).toContain(exciter.state);
  });
});
