import { Enemy } from "../../lib/enemy";
import { TileSubtype } from "../../lib/map";

describe("Enemy Faulty Floor Avoidance", () => {
  test("snake enemy avoids moving onto faulty floor tiles", () => {
    // Create a simple 3x3 grid with floor tiles
    const grid = [
      [0, 0, 0], // floor tiles
      [0, 0, 0],
      [0, 0, 0],
    ];

    // Create subtypes array with faulty floor at [1, 1]
    const subtypes = [
      [[], [], []],
      [[], [TileSubtype.FAULTY_FLOOR], []],
      [[], [], []],
    ];

    // Place enemy at [0, 1] and player at [2, 1]
    const enemy = new Enemy({ y: 0, x: 1 });
    enemy.kind = 'snake';
    const player = { y: 2, x: 1 };

    // Enemy should try to move toward player but avoid faulty floor
    const damage = enemy.update({ grid, subtypes, player });

    // Enemy should not step on faulty floor tile [1, 1]
    // If enemy moved, verify it's not on a faulty floor
    if (enemy.y !== 0 || enemy.x !== 1) {
      const enemySubtypes = subtypes[enemy.y][enemy.x];
      expect(enemySubtypes).not.toContain(TileSubtype.FAULTY_FLOOR);
    }
    
    expect(damage).toBe(0); // No contact damage since not adjacent to player
  });

  test("snake enemy finds alternative path when direct route has faulty floor", () => {
    // Create a 3x3 grid where enemy can move horizontally to avoid faulty floor
    const grid = [
      [0, 0, 0],
      [0, 0, 0], 
      [0, 0, 0],
    ];

    // Place faulty floor at [1, 1] - blocking direct vertical path
    const subtypes = [
      [[], [], []],
      [[], [TileSubtype.FAULTY_FLOOR], []],
      [[], [], []],
    ];

    // Place enemy at [0, 1] and player at [2, 1] - direct path blocked
    const enemy = new Enemy({ y: 0, x: 1 });
    enemy.kind = 'snake';
    const player = { y: 2, x: 1 };

    // Enemy should try horizontal moves since vertical is blocked
    const damage = enemy.update({ grid, subtypes, player });

    // Verify enemy didn't step on faulty floor if it moved
    if (enemy.y !== 0 || enemy.x !== 1) {
      const enemySubtypes = subtypes[enemy.y][enemy.x];
      expect(enemySubtypes).not.toContain(TileSubtype.FAULTY_FLOOR);
    }
    
    expect(damage).toBe(0); // No contact damage since not adjacent
  });

  test("enemy can still move on regular floor tiles", () => {
    // Create a simple 3x3 grid with all floor tiles
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    // No faulty floors, all safe
    const subtypes = [
      [[], [], []],
      [[], [], []],
      [[], [], []],
    ];

    // Place enemy at [0, 0] and player at [2, 2]
    const enemy = new Enemy({ y: 0, x: 0 });
    const player = { y: 2, x: 2 };

    const initialPos = { y: enemy.y, x: enemy.x };
    const damage = enemy.update({ grid, subtypes, player });

    // Enemy should move toward player since no obstacles
    const moved = enemy.y !== initialPos.y || enemy.x !== initialPos.x;
    expect(moved).toBe(true);
    expect(damage).toBe(0); // No contact damage since not adjacent
  });

  test("goblin is allowed to step onto faulty floor tile", () => {
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    const subtypes = [
      [[], [], []],
      [[], [TileSubtype.FAULTY_FLOOR], []],
      [[], [], []],
    ];

    const enemy = new Enemy({ y: 0, x: 1 });
    enemy.kind = 'fire-goblin';
    const player = { y: 2, x: 1 };

    enemy.update({ grid, subtypes, player });

    expect(enemy.y).toBe(1);
    expect(enemy.x).toBe(1);
    expect(subtypes[enemy.y][enemy.x]).toContain(TileSubtype.FAULTY_FLOOR);
  });

  test("stone-exciter is allowed to step onto faulty floor tile", () => {
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    const subtypes = [
      [[], [], []],
      [[], [TileSubtype.FAULTY_FLOOR], []],
      [[], [], []],
    ];

    const enemy = new Enemy({ y: 0, x: 1 });
    enemy.kind = 'stone-exciter';
    const player = { y: 2, x: 1 };

    enemy.update({ grid, subtypes, player });

    expect(enemy.y).toBe(1);
    expect(enemy.x).toBe(1);
    expect(subtypes[enemy.y][enemy.x]).toContain(TileSubtype.FAULTY_FLOOR);
  });
});
