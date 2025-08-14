import { initializeGameState } from "../../lib/map";
import { placeEnemies } from "../../lib/enemy";

describe("Health system - initial hero health", () => {
  test("hero starts with 5 health", () => {
    const gs = initializeGameState();
    // New field to introduce via TDD
    expect(gs.heroHealth).toBe(5);
  });
});

describe("Attack system - default values", () => {
  test("hero attack defaults to 1", () => {
    const gs = initializeGameState();
    // New field to introduce via TDD
    expect(gs.heroAttack).toBe(1);
  });

  test("goblin attack defaults to 1", () => {
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const player = { y: 1, x: 1 };
    const enemies = placeEnemies({ grid, player, count: 1, minDistanceFromPlayer: 0, rng: () => 0.5 });
    expect(enemies.length).toBe(1);
    // New field to introduce via TDD
    expect(enemies[0].attack).toBe(1);
  });
});

describe("Health system - initial goblin health", () => {
  test("goblin starts with 3 health", () => {
    // Simple tiny floor grid 3x3
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const player = { y: 1, x: 1 };
    const enemies = placeEnemies({ grid, player, count: 1, minDistanceFromPlayer: 0, rng: () => 0.5 });
    expect(enemies.length).toBe(1);
    // New field to introduce via TDD
    expect(enemies[0].health).toBe(3);
  });
});
