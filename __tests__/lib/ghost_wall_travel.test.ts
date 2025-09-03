import { Enemy } from "../../lib/enemy";

describe("Ghost movement on walls", () => {
  test("ghost can move onto a wall tile", () => {
    // 3x3 grid with a wall in the center
    const W = 1; // wall id
    const F = 0; // floor id
    const grid = [
      [F, F, F],
      [F, W, F],
      [F, F, F],
    ];
    const subtypes = [
      [[], [], []],
      [[], [], []],
      [[], [], []],
    ];

    // Ghost above center, player below center so ghost moves toward player
    const ghost = new Enemy({ y: 0, x: 1 });
    ghost.kind = "ghost";
    const player = { y: 2, x: 1 };

    const dmg = ghost.update({ grid, subtypes, player });

    // Should have moved onto the wall at [1,1]
    expect({ y: ghost.y, x: ghost.x }).toEqual({ y: 1, x: 1 });
    expect(dmg).toBe(0);
  });
});
