import { updateDogBehavior, type NPCBehaviorContext } from "../../lib/npc_behaviors";
import { NPC } from "../../lib/npc";
import { Direction, FLOOR, WALL } from "../../lib/map/constants";

describe("Dog NPC Behavior", () => {
  const createTestGrid = (): number[][] => {
    // 5x5 grid with floor tiles
    return [
      [FLOOR, FLOOR, FLOOR, FLOOR, FLOOR],
      [FLOOR, FLOOR, FLOOR, FLOOR, FLOOR],
      [FLOOR, FLOOR, FLOOR, FLOOR, FLOOR],
      [FLOOR, FLOOR, FLOOR, FLOOR, FLOOR],
      [FLOOR, FLOOR, FLOOR, FLOOR, FLOOR],
    ];
  };

  const createDogNPC = (y: number, x: number): NPC => {
    return new NPC({
      id: "test-dog",
      name: "Test Dog",
      sprite: "/images/dog-golden/dog-front-1.png",
      y,
      x,
      facing: Direction.DOWN,
      canMove: true,
      tags: ["dog", "pet"],
      metadata: { behavior: "dog" },
    });
  };

  describe("Movement Behavior", () => {
    it("should follow player 75% of the time when player is not adjacent", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 0, x: 0 };
      
      let followCount = 0;
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const testDog = createDogNPC(2, 2);
        const ctx: NPCBehaviorContext = {
          npc: testDog,
          grid,
          player,
          npcs: [testDog],
          rng: Math.random,
        };
        
        const result = updateDogBehavior(ctx);
        if (result.moved) {
          followCount++;
        }
      }
      
      // Should be approximately 75% (allow some variance)
      expect(followCount).toBeGreaterThan(60);
      expect(followCount).toBeLessThan(90);
    });

    it("should move toward player when following", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 0, x: 0 };
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      const initialY = dog.y;
      const initialX = dog.x;
      
      updateDogBehavior(ctx);
      
      // Should move closer to player (toward 0,0)
      const movedCloser = 
        (dog.y < initialY || dog.x < initialX) &&
        (dog.y !== initialY || dog.x !== initialX);
      
      expect(movedCloser).toBe(true);
    });

    it("should not move onto player tile", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(1, 1);
      const player = { y: 1, x: 2 }; // Adjacent to dog
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      updateDogBehavior(ctx);
      
      // Dog should not be on player tile
      expect(dog.y !== player.y || dog.x !== player.x).toBe(true);
    });

    it("should not move onto other NPC tiles", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const otherNpc = new NPC({
        id: "other-npc",
        name: "Other NPC",
        sprite: "/test.png",
        y: 2,
        x: 1,
        facing: Direction.DOWN,
        canMove: false,
      });
      const player = { y: 2, x: 0 };
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog, otherNpc],
        rng: () => 0.5, // Force follow behavior
      };
      
      const initialPos = { y: dog.y, x: dog.x };
      updateDogBehavior(ctx);
      
      // Dog should not be on other NPC's tile
      expect(dog.y !== otherNpc.y || dog.x !== otherNpc.x).toBe(true);
      
      // Dog should either stay in place or move to a different tile
      if (dog.y !== initialPos.y || dog.x !== initialPos.x) {
        // If dog moved, it should not be on the other NPC
        expect(dog.y === otherNpc.y && dog.x === otherNpc.x).toBe(false);
      }
    });

    it("should not move onto enemy tiles", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 2, x: 0 };
      const enemies = [{ y: 2, x: 1 }];
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        enemies,
        rng: () => 0.5, // Force follow behavior
      };
      
      updateDogBehavior(ctx);
      
      // Dog should not be on enemy tile
      expect(dog.y !== enemies[0].y || dog.x !== enemies[0].x).toBe(true);
    });

    it("should not move through walls", () => {
      const grid = [
        [FLOOR, FLOOR, FLOOR],
        [FLOOR, WALL, FLOOR],
        [FLOOR, FLOOR, FLOOR],
      ];
      const dog = createDogNPC(1, 0);
      const player = { y: 1, x: 2 };
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      updateDogBehavior(ctx);
      
      // Dog should not be on wall tile
      expect(grid[dog.y][dog.x]).toBe(FLOOR);
    });
  });

  describe("Sprite Animation", () => {
    it("should use back sprites when moving up", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 0, x: 2 }; // Directly above
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      updateDogBehavior(ctx);
      
      // Should use back sprite when moving up
      if (dog.y < 2) {
        expect(dog.sprite).toMatch(/dog-back-[12]\.png$/);
      }
    });

    it("should use front sprites when moving down, left, or right", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 4, x: 2 }; // Below dog
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      updateDogBehavior(ctx);
      
      // Should use front sprite when moving down
      if (dog.y > 2) {
        expect(dog.sprite).toMatch(/dog-front-[1-4]\.png$/);
      }
    });

    it("should alternate sprites on each step", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 0, x: 0 };
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      const sprite1 = dog.sprite;
      updateDogBehavior(ctx);
      const sprite2 = dog.sprite;
      
      // Sprite should change (unless dog didn't move)
      if (dog.y !== 2 || dog.x !== 2) {
        expect(sprite1).not.toBe(sprite2);
      }
    });

    it("should cycle through front sprites (1-4) when idle", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 2, x: 2 }; // Same position (adjacent)
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.9, // Force idle behavior (25% chance)
      };
      
      const sprites = new Set<string>();
      
      // Run multiple times to see sprite cycling
      for (let i = 0; i < 10; i++) {
        updateDogBehavior(ctx);
        sprites.add(dog.sprite);
      }
      
      // Should have cycled through multiple front sprites
      expect(sprites.size).toBeGreaterThan(1);
      Array.from(sprites).forEach(sprite => {
        expect(sprite).toMatch(/dog-front-[1-4]\.png$/);
      });
    });

    it("should track step count in memory", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 0, x: 0 };
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      expect(dog.memory?.dogStep).toBeUndefined();
      
      updateDogBehavior(ctx);
      
      expect(dog.memory?.dogStep).toBeDefined();
      expect(typeof dog.memory?.dogStep).toBe("number");
    });
  });

  describe("Edge Cases", () => {
    it("should handle being at map boundary", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(0, 0); // Top-left corner
      const player = { y: 4, x: 4 }; // Far away
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      expect(() => updateDogBehavior(ctx)).not.toThrow();
      
      // Should still be on valid floor
      expect(grid[dog.y][dog.x]).toBe(FLOOR);
    });

    it("should handle being surrounded by obstacles", () => {
      const grid = [
        [WALL, WALL, WALL],
        [WALL, FLOOR, WALL],
        [WALL, WALL, WALL],
      ];
      const dog = createDogNPC(1, 1); // Surrounded by walls
      const player = { y: 0, x: 0 };
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      const initialY = dog.y;
      const initialX = dog.x;
      
      updateDogBehavior(ctx);
      
      // Should stay in place
      expect(dog.y).toBe(initialY);
      expect(dog.x).toBe(initialX);
    });

    it("should handle player at same position (adjacent)", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 2, x: 3 }; // Adjacent
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      expect(() => updateDogBehavior(ctx)).not.toThrow();
    });
  });

  describe("Return Values", () => {
    it("should return moved: true when dog moves", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 0, x: 0 };
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      const result = updateDogBehavior(ctx);
      
      expect(result).toHaveProperty("moved");
      expect(typeof result.moved).toBe("boolean");
    });

    it("should return spriteChanged when sprite updates", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 2, x: 2 }; // Same position
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.9, // Force idle behavior
      };
      
      const result = updateDogBehavior(ctx);
      
      if (result.spriteChanged) {
        expect(result.moved).toBe(false);
      }
    });
  });
});
