import { NPC } from "../../lib/npc";
import { Direction } from "../../lib/map/constants";

describe("Dog NPC Properties", () => {
  // Unit tests for dog NPC configuration and properties
  
  const createDogNPC = (y: number, x: number): NPC => {
    return new NPC({
      id: "npc-dog-golden",
      name: "Golden Dog",
      sprite: "/images/dog-golden/dog-front-1.png",
      y,
      x,
      facing: Direction.DOWN,
      canMove: true,
      tags: ["dog", "pet"],
      metadata: { behavior: "dog" },
    });
  };

  it("should create dog NPC with correct properties", () => {
    const dog = createDogNPC(2, 2);
    
    expect(dog.id).toBe("npc-dog-golden");
    expect(dog.name).toBe("Golden Dog");
    expect(dog.canMove).toBe(true);
    expect(dog.tags).toContain("dog");
    expect(dog.tags).toContain("pet");
    expect(dog.metadata?.behavior).toBe("dog");
  });

  it("should have dog tag for identification", () => {
    const dog = createDogNPC(2, 2);
    
    expect(dog.tags?.includes("dog")).toBe(true);
  });

  it("should have pet tag for identification", () => {
    const dog = createDogNPC(2, 2);
    
    expect(dog.tags?.includes("pet")).toBe(true);
  });

  it("should be moveable", () => {
    const dog = createDogNPC(2, 2);
    
    expect(dog.canMove).toBe(true);
  });

  it("should have dog behavior metadata", () => {
    const dog = createDogNPC(2, 2);
    
    expect(dog.metadata).toBeDefined();
    expect(dog.metadata?.behavior).toBe("dog");
  });

  it("should start with front-facing sprite", () => {
    const dog = createDogNPC(2, 2);
    
    expect(dog.sprite).toMatch(/dog-front-\d\.png$/);
  });

  it("should support memory for tracking interactions", () => {
    const dog = createDogNPC(2, 2);
    
    dog.setMemory("petCount", 1);
    expect(dog.getMemory("petCount")).toBe(1);
    
    dog.setMemory("lastPetAt", Date.now());
    expect(dog.getMemory("lastPetAt")).toBeDefined();
  });

  it("should support step tracking in memory", () => {
    const dog = createDogNPC(2, 2);
    
    dog.setMemory("dogStep", 0);
    expect(dog.getMemory("dogStep")).toBe(0);
    
    dog.setMemory("dogStep", 1);
    expect(dog.getMemory("dogStep")).toBe(1);
  });

  it("should be distinguishable from regular NPCs by tags", () => {
    const dog = createDogNPC(2, 2);
    const regularNpc = new NPC({
      id: "npc-regular",
      name: "Regular NPC",
      sprite: "/images/npcs/test.png",
      y: 2,
      x: 3,
      facing: Direction.DOWN,
      canMove: false,
    });
    
    expect(dog.tags?.includes("dog")).toBe(true);
    expect(regularNpc.tags?.includes("dog")).toBe(false);
  });

  it("should serialize and deserialize correctly", () => {
    const dog = createDogNPC(2, 2);
    dog.setMemory("petCount", 5);
    
    const plain = dog.toPlain();
    
    expect(plain.id).toBe("npc-dog-golden");
    expect(plain.tags).toContain("dog");
    expect(plain.tags).toContain("pet");
    expect(plain.memory?.petCount).toBe(5);
    expect(plain.metadata?.behavior).toBe("dog");
  });
});
