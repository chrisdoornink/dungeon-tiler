import { Enemy, updateEnemies } from "../../lib/enemy";

// Fully open floor so line-of-sight is always clear and any step is walkable.
function openGrid(n = 21): number[][] {
  return Array.from({ length: n }, () => Array(n).fill(0));
}
function emptySubtypes(n = 21): number[][][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));
}

function makeWhiteGoblin(y: number, x: number, swarmId: string): Enemy {
  const e = new Enemy({ y, x });
  e.kind = "white-goblin";
  e.behaviorMemory.swarmId = swarmId;
  return e;
}

// Neutral variance: white goblins use the goblin band (0.40<=r<0.80 -> +0), so
// 0.5 leaves the returned base damage untouched. Adjacency path uses no rng for
// movement, so this is fully deterministic for the damage assertions.
const neutralRng = () => 0.5;

describe("white goblin swarm — strength in numbers (damage)", () => {
  test("a lone white goblin hits for base 2 (up from 1)", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 5 };
    const goblin = makeWhiteGoblin(5, 4, "lone"); // directly left of player
    const result = updateEnemies(grid, subtypes, [goblin], player, {
      rng: neutralRng,
    }) as { damage: number; attackingEnemies: Array<{ kind: string; damage: number }> };

    // Attack entries also carry the attacker's post-move position and a
    // ranged flag for render-layer VFX.
    expect(result.attackingEnemies).toEqual([
      { kind: "white-goblin", damage: 2, y: 5, x: 4, ranged: false },
    ]);
    expect(result.damage).toBe(2);
  });

  test("two flanking swarm-mates each hit harder (+1 -> 3 each)", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 5 };
    const a = makeWhiteGoblin(5, 4, "s"); // left
    const b = makeWhiteGoblin(4, 5, "s"); // above
    const result = updateEnemies(grid, subtypes, [a, b], player, {
      rng: neutralRng,
    }) as { damage: number; attackingEnemies: Array<{ kind: string; damage: number }> };

    expect(result.attackingEnemies).toHaveLength(2);
    for (const atk of result.attackingEnemies) {
      expect(atk.damage).toBe(3); // base 2 + 1 flanker
    }
    expect(result.damage).toBe(6); // pre-cap sum; the 4/turn cap is applied later
  });

  test("a fuller surround caps the per-goblin bonus at +2 (4 each)", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 5 };
    const goblins = [
      makeWhiteGoblin(5, 4, "s"), // left
      makeWhiteGoblin(4, 5, "s"), // above
      makeWhiteGoblin(6, 5, "s"), // below
      makeWhiteGoblin(5, 6, "s"), // right
    ];
    const result = updateEnemies(grid, subtypes, goblins, player, {
      rng: neutralRng,
    }) as { damage: number; attackingEnemies: Array<{ kind: string; damage: number }> };

    expect(result.attackingEnemies).toHaveLength(4);
    for (const atk of result.attackingEnemies) {
      expect(atk.damage).toBe(4); // base 2 + min(3 flankers, 2)
    }
  });

  test("a different swarmId is NOT counted as a flanker", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 5 };
    const mine = makeWhiteGoblin(5, 4, "A"); // left, swarm A
    const stranger = makeWhiteGoblin(4, 5, "B"); // above, swarm B
    const result = updateEnemies(grid, subtypes, [mine, stranger], player, {
      rng: neutralRng,
    }) as { damage: number; attackingEnemies: Array<{ kind: string; damage: number }> };

    // Each is alone within its own swarm -> base 2, no flank bonus.
    for (const atk of result.attackingEnemies) {
      expect(atk.damage).toBe(2);
    }
  });
});

describe("white goblin swarm — encirclement (movement)", () => {
  test("a stacked swarm fans out and presses multiple sides instead of single file", () => {
    const grid = openGrid(21);
    const subtypes = emptySubtypes(21);
    const player = { y: 10, x: 10 };
    const swarmId = "march";
    // All four start stacked, well to the left and within vision (manhattan 6).
    const goblins = [
      makeWhiteGoblin(10, 4, swarmId),
      makeWhiteGoblin(10, 4, swarmId),
      makeWhiteGoblin(10, 4, swarmId),
      makeWhiteGoblin(10, 4, swarmId),
    ];

    // Simulate enemy ticks with a stationary player (player kiting is not the
    // point here — we want to see whether they line up or surround).
    for (let t = 0; t < 16; t++) {
      updateEnemies(grid, subtypes, goblins, player, { rng: neutralRng });
    }

    const adjacent = goblins.filter(
      (g) => Math.abs(g.y - player.y) + Math.abs(g.x - player.x) === 1
    );
    const sides = new Set(
      adjacent.map((g) => `${g.y - player.y},${g.x - player.x}`)
    );

    // At least three of the four reach the hero (old conga line left ~1), and
    // they hold at least two distinct sides rather than one tile / one file.
    expect(adjacent.length).toBeGreaterThanOrEqual(3);
    expect(sides.size).toBeGreaterThanOrEqual(2);
  });
});
