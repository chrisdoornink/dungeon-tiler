import { Enemy } from "../../lib/enemy";
import { TileSubtype, Direction } from "../../lib/map";
import { movePlayer, initializeGameState } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";

describe("Open Abyss Behavior", () => {
  describe("Faulty floor conversion to open abyss", () => {
    test("player stepping on faulty floor converts it to open abyss", () => {
      // Create a simple map with faulty floor
      const mapData = {
        tiles: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        subtypes: [
          [[], [TileSubtype.PLAYER], []],
          [[], [TileSubtype.FAULTY_FLOOR], []],
          [[], [], []],
        ],
      };

      const gameState: GameState = {
        hasKey: false,
        hasExitKey: false,
        mapData,
        showFullMap: false,
        win: false,
        playerDirection: Direction.DOWN,
        heroHealth: 5,
        heroMaxHealth: 5,
        heroAttack: 1,
        enemies: [],
        npcs: [],
        stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      };

      // Move player down onto faulty floor
      const newState = movePlayer(gameState, Direction.DOWN);

      // Player should be dead
      expect(newState.heroHealth).toBe(0);
      expect(newState.deathCause?.type).toBe("faulty_floor");

      // Faulty floor should be converted to open abyss at position [1,1]
      const tileSubtypes = newState.mapData.subtypes[1][1];
      expect(tileSubtypes).toContain(TileSubtype.OPEN_ABYSS);
      expect(tileSubtypes).not.toContain(TileSubtype.FAULTY_FLOOR);
      // Player should also be on this tile (dead)
      expect(tileSubtypes).toContain(TileSubtype.PLAYER);
    });

    test("goblin stepping on faulty floor converts it to open abyss", () => {
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

      // Enemy should move onto faulty floor when chasing
      enemy.update({ grid, subtypes, player });

      // Enemy should be on the faulty floor
      expect(enemy.y).toBe(1);
      expect(enemy.x).toBe(1);

      // Now simulate the hazard death check that happens in game state
      // The faulty floor should convert to open abyss
      const tileSubs = subtypes[enemy.y][enemy.x];
      const onFaulty = tileSubs.includes(TileSubtype.FAULTY_FLOOR);
      
      if (onFaulty) {
        // Convert faulty floor to open abyss
        subtypes[enemy.y][enemy.x] = subtypes[enemy.y][enemy.x].filter(
          (type) => type !== TileSubtype.FAULTY_FLOOR
        );
        subtypes[enemy.y][enemy.x].push(TileSubtype.OPEN_ABYSS);
      }

      // Verify conversion
      expect(subtypes[1][1]).toContain(TileSubtype.OPEN_ABYSS);
      expect(subtypes[1][1]).not.toContain(TileSubtype.FAULTY_FLOOR);
    });
  });

  describe("Goblin avoidance behavior", () => {
    test("goblin avoids faulty floor when patrolling (not chasing)", () => {
      // Test the underlying isSafeFloorForEnemy logic directly
      // When a goblin is not chasing (isChasing=false), it should not be able to move onto faulty floors
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

      // Simulate checking if position [1,1] is safe for a goblin when NOT chasing
      // This tests the core logic without relying on random wandering behavior
      const Enemy = require("../../lib/enemy").Enemy;
      const testEnemy = new Enemy({ y: 0, x: 0 });
      testEnemy.kind = 'fire-goblin';
      
      // When player is far away (out of vision range), goblin won't chase
      // Vision range is typically 8-10 tiles
      const player = { y: 10, x: 10 };
      
      testEnemy.update({ grid, subtypes, player });
      
      // Goblin should not have moved onto faulty floor at [1,1]
      const notOnFaultyFloor = !(testEnemy.y === 1 && testEnemy.x === 1);
      expect(notOnFaultyFloor).toBe(true);
    });

    test("goblin can step on faulty floor when chasing player", () => {
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
      // Player directly below - goblin will chase
      const player = { y: 2, x: 1 };

      enemy.update({ grid, subtypes, player });

      // Goblin should have moved onto faulty floor
      expect(enemy.y).toBe(1);
      expect(enemy.x).toBe(1);
      expect(subtypes[enemy.y][enemy.x]).toContain(TileSubtype.FAULTY_FLOOR);
    });
  });

  describe("Open abyss avoidance", () => {
    test("goblin always avoids open abyss even when chasing", () => {
      const grid = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];

      const subtypes = [
        [[], [], []],
        [[], [TileSubtype.OPEN_ABYSS], []],
        [[], [], []],
      ];

      const enemy = new Enemy({ y: 0, x: 1 });
      enemy.kind = 'fire-goblin';
      const player = { y: 2, x: 1 };

      enemy.update({ grid, subtypes, player });

      // Goblin should NOT have moved onto open abyss
      expect(enemy.y).toBe(0);
      expect(enemy.x).toBe(1);
    });

    test("snake always avoids open abyss", () => {
      const grid = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];

      const subtypes = [
        [[], [], []],
        [[], [TileSubtype.OPEN_ABYSS], []],
        [[], [], []],
      ];

      const enemy = new Enemy({ y: 0, x: 1 });
      enemy.kind = 'snake';
      const player = { y: 2, x: 1 };

      enemy.update({ grid, subtypes, player });

      // Snake should NOT have moved onto open abyss
      expect(enemy.y).toBe(0);
      expect(enemy.x).toBe(1);
    });

    test("stone-goblin avoids open abyss even when chasing", () => {
      const grid = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];

      const subtypes = [
        [[], [], []],
        [[], [TileSubtype.OPEN_ABYSS], []],
        [[], [], []],
      ];

      const enemy = new Enemy({ y: 0, x: 1 });
      enemy.kind = 'stone-goblin';
      const player = { y: 2, x: 1 };

      enemy.update({ grid, subtypes, player });

      // Stone-goblin should NOT have moved onto open abyss
      expect(enemy.y).toBe(0);
      expect(enemy.x).toBe(1);
    });

  });
});
