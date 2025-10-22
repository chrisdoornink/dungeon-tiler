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

  describe("Sidestep After Petting", () => {
    it("should sidestep when pet and player is above", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 1, x: 2 }; // Above dog
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      const initialX = dog.x;
      updateDogBehavior(ctx);
      
      // Dog should sidestep left or right
      expect(dog.y).toBe(2); // Same row
      expect(dog.x).not.toBe(initialX); // Different column
    });

    it("should sidestep when pet and player is to the left", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 2, x: 1 }; // Left of dog
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      const initialY = dog.y;
      updateDogBehavior(ctx);
      
      // Dog should sidestep up or down
      expect(dog.x).toBe(2); // Same column
      expect(dog.y).not.toBe(initialY); // Different row
    });

    it("should back away 2 spaces when sidestep not possible", () => {
      const grid = [
        [WALL, WALL, WALL, WALL, WALL, WALL],
        [WALL, FLOOR, FLOOR, FLOOR, FLOOR, WALL],
        [WALL, FLOOR, FLOOR, FLOOR, FLOOR, WALL],
        [WALL, FLOOR, FLOOR, FLOOR, FLOOR, WALL],
        [WALL, WALL, WALL, WALL, WALL, WALL],
      ];
      const dog = createDogNPC(2, 2);
      const player = { y: 2, x: 1 }; // Left of dog
      
      // Block sidestep options with NPCs
      const npcAbove = new NPC({
        id: "npc-above",
        name: "Above",
        sprite: "/test.png",
        y: 1,
        x: 2,
        facing: Direction.DOWN,
        canMove: false,
      });
      const npcBelow = new NPC({
        id: "npc-below",
        name: "Below",
        sprite: "/test.png",
        y: 3,
        x: 2,
        facing: Direction.DOWN,
        canMove: false,
      });
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog, npcAbove, npcBelow],
        rng: () => 0.5,
      };
      
      updateDogBehavior(ctx);
      
      // Dog should back away to the right (away from player)
      // Should move 2 spaces if possible (x=4 is available)
      expect(dog.x).toBe(4);
      expect(dog.y).toBe(2);
    });

    it("should back away 1 space when 2 spaces not available", () => {
      const grid = [
        [WALL, WALL, WALL, WALL],
        [WALL, FLOOR, FLOOR, WALL],
        [WALL, FLOOR, FLOOR, WALL],
        [WALL, WALL, WALL, WALL],
      ];
      const dog = createDogNPC(1, 2);
      const player = { y: 1, x: 1 }; // Left of dog
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      updateDogBehavior(ctx);
      
      // Dog can't move 2 spaces (wall at x=3), but should still try to move away
      // Since sidestep blocked by walls, should stay in place or move if possible
      expect(grid[dog.y][dog.x]).toBe(FLOOR);
    });

    it("should not sidestep if not recently pet", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 1, x: 2 }; // Above dog
      
      // Pet was long ago (more than 500ms)
      dog.setMemory("lastPetAt", Date.now() - 1000);
      
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
      
      // Dog should not sidestep (should follow normal behavior)
      // Since player is adjacent (distance = 1), dog won't move toward player
      // So dog should stay in place or do idle animation
      expect(dog.y).toBe(initialY);
      expect(dog.x).toBe(initialX);
    });

    it("should not sidestep if player is not adjacent", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 0, x: 0 }; // Far from dog
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      updateDogBehavior(ctx);
      
      // Dog should follow normal behavior (move toward player)
      // Not sidestep since player is not adjacent
      const distToPlayer = Math.abs(dog.y - player.y) + Math.abs(dog.x - player.x);
      expect(distToPlayer).toBeLessThan(4); // Should have moved closer
    });

    it("should respect NPC blocking when sidestepping", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 1, x: 2 }; // Above dog
      const otherNpc = new NPC({
        id: "blocking-npc",
        name: "Blocker",
        sprite: "/test.png",
        y: 2,
        x: 1, // Left of dog
        facing: Direction.DOWN,
        canMove: false,
      });
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog, otherNpc],
        rng: () => 0.5,
      };
      
      updateDogBehavior(ctx);
      
      // Dog should sidestep right (not left where NPC is)
      expect(dog.x).toBe(3);
      expect(dog.y).toBe(2);
    });

    it("should respect enemy blocking when sidestepping", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 1, x: 2 }; // Above dog
      const enemies = [{ y: 2, x: 3 }]; // Right of dog
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        enemies,
        rng: () => 0.5,
      };
      
      updateDogBehavior(ctx);
      
      // Dog should sidestep left (not right where enemy is)
      expect(dog.x).toBe(1);
      expect(dog.y).toBe(2);
    });

    it("should update sprite correctly when sidestepping", () => {
      const grid = createTestGrid();
      const dog = createDogNPC(2, 2);
      const player = { y: 1, x: 2 }; // Above dog
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      updateDogBehavior(ctx);
      
      // Sprite should be updated (front or back depending on direction)
      expect(dog.sprite).toMatch(/dog-(front|back)-[1-4]\.png$/);
    });
  });

  describe("Restricted Tiles (Entrance/Exit Areas)", () => {
    it("should not move onto restricted tile at (12,30)", () => {
      // Create a larger grid to accommodate the restricted tile
      const grid = Array(20).fill(null).map(() => Array(40).fill(FLOOR));
      const dog = createDogNPC(12, 29);
      const player = { y: 12, x: 31 }; // Player to the right, dog would try to move to (12,30)
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      updateDogBehavior(ctx);
      
      // Dog should not move to restricted tile (12,30)
      expect(dog.y === 12 && dog.x === 30).toBe(false);
    });

    it("should not move onto restricted tile at (30,4)", () => {
      // Create a larger grid to accommodate the restricted tile
      const grid = Array(35).fill(null).map(() => Array(10).fill(FLOOR));
      const dog = createDogNPC(29, 4);
      const player = { y: 31, x: 4 }; // Player below, dog would try to move to (30,4)
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5, // Force follow behavior
      };
      
      updateDogBehavior(ctx);
      
      // Dog should not move to restricted tile (30,4)
      expect(dog.y === 30 && dog.x === 4).toBe(false);
    });

    it("should avoid all entrance restricted tiles", () => {
      const restrictedTiles = [
        [12, 30], [12, 29], [13, 29], [13, 30], [11, 29], [11, 30],
        [30, 4], [29, 4], [28, 4], [27, 4]
      ];
      
      // Test each restricted tile
      for (const [restrictedY, restrictedX] of restrictedTiles) {
        const grid = Array(40).fill(null).map(() => Array(40).fill(FLOOR));
        const dog = createDogNPC(restrictedY - 1, restrictedX);
        const player = { y: restrictedY + 1, x: restrictedX }; // Player below restricted tile
        
        const ctx: NPCBehaviorContext = {
          npc: dog,
          grid,
          player,
          npcs: [dog],
          rng: () => 0.5, // Force follow behavior
        };
        
        updateDogBehavior(ctx);
        
        // Dog should not be on the restricted tile
        expect(dog.y === restrictedY && dog.x === restrictedX).toBe(false);
      }
    });

    it("should not sidestep onto restricted tiles", () => {
      const grid = Array(20).fill(null).map(() => Array(40).fill(FLOOR));
      const dog = createDogNPC(12, 28);
      const player = { y: 11, x: 28 }; // Above dog
      
      // Simulate recent petting
      dog.setMemory("lastPetAt", Date.now());
      
      const ctx: NPCBehaviorContext = {
        npc: dog,
        grid,
        player,
        npcs: [dog],
        rng: () => 0.5,
      };
      
      updateDogBehavior(ctx);
      
      // Dog should not sidestep to (12,29) which is restricted
      expect(dog.y === 12 && dog.x === 29).toBe(false);
    });
  });
});
