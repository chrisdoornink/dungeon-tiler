import { Direction } from "../../lib/map";
import { NPC, serializeNPCs, rehydrateNPCs } from "../../lib/npc";

describe("NPC serialization", () => {
  test("roundtrip preserves core fields and memory", () => {
    const npc = new NPC({
      id: "npc-test",
      name: "Test NPC",
      sprite: "/images/hero/hero-front-static.png",
      y: 3,
      x: 4,
      facing: Direction.UP,
      canMove: true,
      maxHealth: 5,
      health: 3,
      memory: {
        metHero: true,
        giftAvailable: false,
      },
      interactionHooks: [
        {
          id: "npc-test-greet",
          type: "dialogue",
          description: "Greet the hero",
        },
      ],
      actions: ["greet"],
      metadata: {
        archetype: "tester",
      },
    });

    npc.takeDamage(1);
    npc.setMemory("metHero", true);

    const serialized = serializeNPCs([npc]);
    expect(serialized).toHaveLength(1);

    const restored = rehydrateNPCs(serialized);
    expect(restored).toHaveLength(1);
    const clone = restored[0];
    expect(clone.id).toBe(npc.id);
    expect(clone.name).toBe(npc.name);
    expect(clone.health).toBe(npc.health);
    expect(clone.maxHealth).toBe(npc.maxHealth);
    expect(clone.memory.metHero).toBe(true);
    expect(clone.memory.giftAvailable).toBe(false);
    expect(clone.interactionHooks).toHaveLength(1);
    expect(clone.interactionHooks?.[0]?.id).toBe("npc-test-greet");
  });
});

describe("NPC interaction events", () => {
  test("fallback hook is used when none provided", () => {
    const npc = new NPC({
      id: "solo",
      name: "Solo",
      sprite: "/images/hero/hero-front-static.png",
      y: 1,
      x: 1,
    });

    const event = npc.createInteractionEvent("bump");
    expect(event.npcId).toBe("solo");
    expect(event.type).toBe("dialogue");
    expect(event.hookId).toBe("solo-dialogue");
    expect(event.availableHooks).toHaveLength(0);
  });

  test("first hook metadata is surfaced when available", () => {
    const npc = new NPC({
      id: "mentor",
      name: "Mentor",
      sprite: "/images/hero/hero-front-static.png",
      y: 0,
      x: 0,
      interactionHooks: [
        {
          id: "mentor-talk",
          type: "dialogue",
          description: "Talk to the mentor",
        },
        {
          id: "mentor-gift",
          type: "item",
          description: "Receive an item",
        },
      ],
    });

    const event = npc.createInteractionEvent("action");
    expect(event.hookId).toBe("mentor-talk");
    expect(event.availableHooks).toHaveLength(2);
    expect(event.availableHooks[1]?.id).toBe("mentor-gift");
    expect(event.memory?.mentor).toBeUndefined();
  });
});
