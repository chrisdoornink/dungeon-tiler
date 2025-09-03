import { Enemy } from "../../lib/enemy";
import { TileSubtype } from "../../lib/map";

describe("Ghost movement on faulty floors", () => {
  test("ghost can move onto faulty floor tile", () => {
    // 3x3 all floors
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    // Faulty floor in the center
    const subtypes = [
      [[], [], []],
      [[], [TileSubtype.FAULTY_FLOOR], []],
      [[], [], []],
    ];

    // Ghost above center, player below center so ghost moves toward player
    const ghost = new Enemy({ y: 0, x: 1 });
    ghost.kind = 'ghost';
    const player = { y: 2, x: 1 };

    const dmg = ghost.update({ grid, subtypes, player });

    // Should have moved onto the faulty floor at [1,1]
    expect({ y: ghost.y, x: ghost.x }).toEqual({ y: 1, x: 1 });
    expect(dmg).toBe(0);
  });
});
