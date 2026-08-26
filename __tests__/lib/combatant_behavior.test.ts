import { updateCombatantBehavior } from "../../lib/npc_behaviors";
import { NPC } from "../../lib/npc";
import { Direction, FLOOR, WALL } from "../../lib/map";

function member(y: number, x: number, health = 5): NPC {
  return new NPC({
    id: "npc-test",
    name: "Test",
    sprite: "/images/family/test-front.png",
    y,
    x,
    facing: Direction.DOWN,
    canMove: true,
    health,
    maxHealth: 5,
    metadata: {
      partyId: "test",
      behavior: "idle",
      directionalSprites: { back: "b.png", side: "s.png" },
    },
  });
}

function enemyAt(y: number, x: number, attack = 1, health = 4) {
  return { y, x, attack, health };
}

function grid(size = 9) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => FLOOR)
  );
}

function ctx(npc: NPC, enemies: Array<{ y: number; x: number }>, g = grid()) {
  return {
    npc,
    grid: g,
    subtypes: undefined,
    player: { y: 0, x: 0 },
    npcs: [npc],
    enemies,
  };
}

describe("updateCombatantBehavior", () => {
  it("ignores enemies beyond awareness and yields to the base behavior", () => {
    const npc = member(4, 4);
    const result = updateCombatantBehavior(ctx(npc, [enemyAt(4, 8)]), {
      armed: true,
      attack: 2,
    });
    // Distance 4 is within 5 — reacts. Push it to 6 to fall out of awareness.
    expect(result.reacted).toBe(true);

    const far = member(0, 0);
    const r2 = updateCombatantBehavior(ctx(far, [enemyAt(0, 6)]), {
      armed: true,
      attack: 2,
    });
    expect(r2.reacted).toBe(false);
    expect(far.memory?.engaging ?? null).toBeNull();
  });

  it("armed member closes on the nearest enemy", () => {
    const npc = member(4, 1);
    const result = updateCombatantBehavior(ctx(npc, [enemyAt(4, 4)]), {
      armed: true,
      attack: 2,
    });
    expect(result.reacted).toBe(true);
    expect([npc.y, npc.x]).toEqual([4, 2]); // stepped toward
    expect(npc.memory?.engaging).toBe(true);
  });

  it("armed member holds and faces when already adjacent", () => {
    const npc = member(4, 3);
    updateCombatantBehavior(ctx(npc, [enemyAt(4, 4)]), {
      armed: true,
      attack: 2,
    });
    expect([npc.y, npc.x]).toEqual([4, 3]); // did not move
    expect(npc.facing).toBe(Direction.RIGHT);
    expect(npc.memory?.engaging).toBe(true);
  });

  it("unarmed member flees, increasing distance, and will not strike", () => {
    const npc = member(4, 4);
    const before = Math.abs(npc.y - 4) + Math.abs(npc.x - 6); // = 2
    const result = updateCombatantBehavior(ctx(npc, [enemyAt(4, 6)]), {
      armed: false,
      attack: 1,
    });
    expect(result.reacted).toBe(true);
    const after = Math.abs(npc.y - 4) + Math.abs(npc.x - 6);
    expect(after).toBeGreaterThan(before); // moved away from the enemy
    expect(npc.memory?.engaging).toBe(false);
  });

  it("armed but badly outmatched member also flees", () => {
    const npc = member(4, 4, 2); // power = 2 * 2 = 4
    const result = updateCombatantBehavior(ctx(npc, [enemyAt(4, 6, 3, 8)]), {
      armed: true,
      attack: 2,
    }); // enemy power = 24; 4 < 24 * 0.6
    expect(result.reacted).toBe(true);
    expect(npc.memory?.engaging).toBe(false);
  });

  it("cornered unarmed member turns and fights", () => {
    // Trap the member in a 1-tile pocket: walls on three sides, enemy on the
    // fourth. No retreat tile improves distance, so it must fight.
    const g = grid(5);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) if (!(y === 2 && x >= 1 && x <= 2)) g[y][x] = WALL;
    // open tiles: (2,1) member, (2,2) enemy-adjacent path
    const npc = member(2, 1);
    const result = updateCombatantBehavior(ctx(npc, [enemyAt(2, 2)], g), {
      armed: false,
      attack: 1,
    });
    expect(result.reacted).toBe(true);
    expect([npc.y, npc.x]).toEqual([2, 1]); // nowhere to run
    expect(npc.memory?.engaging).toBe(true);
    expect(npc.facing).toBe(Direction.RIGHT);
  });
});
