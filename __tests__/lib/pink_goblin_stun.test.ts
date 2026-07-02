import { Enemy, updateEnemies } from "../../lib/enemy";
import { TileSubtype } from "../../lib/map";
import { FLOOR } from "../../lib/map/constants";

// Stunned pink goblin: taking a hit (health drop between ticks) permanently
// disables teleporting. From then on it melees when adjacent and otherwise
// keeps backing away from the hero one tile per turn.

const SIZE = 12;

function openGrid(): number[][] {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(FLOOR));
}

function emptySubtypes(): number[][][] {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );
}

function makePinkGoblin(y: number, x: number): Enemy {
  const e = new Enemy({ y, x });
  e.kind = "pink-goblin";
  return e;
}

const neutralRng = () => 0.5;

describe("pink goblin — stunned mode after taking a hit", () => {
  test("a health drop since last tick flags stunned and backs it off one tile", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 2 };
    const goblin = makePinkGoblin(5, 5); // LOS down the row, distance 3
    goblin.health = 2;
    goblin.behaviorMemory.aware = true;
    goblin.behaviorMemory.lastHealth = 4; // snapshot from before the rock hit

    updateEnemies(grid, subtypes, [goblin], player, { rng: neutralRng });

    expect(goblin.behaviorMemory.stunned).toBe(true);
    // Backed away along the row (player is left, so it retreats right).
    expect(goblin.y).toBe(5);
    expect(goblin.x).toBe(6);
  });

  test("stunned goblin removes its deployed ring and never teleports", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 2 };
    const goblin = makePinkGoblin(5, 6);
    goblin.health = 2;
    goblin.behaviorMemory.aware = true;
    goblin.behaviorMemory.stunned = true;
    // A ring it had deployed before getting hit
    goblin.behaviorMemory.ringY = 2;
    goblin.behaviorMemory.ringX = 9;
    goblin.behaviorMemory.ringOrigSubs = [];
    subtypes[2][9] = [TileSubtype.PINK_RING];

    // Several ticks: the ring disappears and every move is a single step.
    for (let i = 0; i < 5; i++) {
      const [prevY, prevX] = [goblin.y, goblin.x];
      updateEnemies(grid, subtypes, [goblin], player, { rng: neutralRng });
      const stepSize =
        Math.abs(goblin.y - prevY) + Math.abs(goblin.x - prevX);
      expect(stepSize).toBeLessThanOrEqual(1); // no teleport
    }

    expect(subtypes[2][9]).not.toContain(TileSubtype.PINK_RING);
    expect(goblin.behaviorMemory.ringY).toBeUndefined();
    expect(goblin.behaviorMemory.ringX).toBeUndefined();
    // Retreated from (5,6) away from the player at (5,2)
    expect(goblin.x).toBeGreaterThan(6);
  });

  test("stunned goblin still melees when the hero is adjacent", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 5 };
    const goblin = makePinkGoblin(5, 6); // directly right of player
    goblin.health = 2;
    goblin.behaviorMemory.aware = true;
    goblin.behaviorMemory.stunned = true;

    const result = updateEnemies(grid, subtypes, [goblin], player, {
      rng: neutralRng,
    }) as {
      damage: number;
      attackingEnemies: Array<{ kind: string; ranged: boolean }>;
    };

    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.attackingEnemies).toHaveLength(1);
    expect(result.attackingEnemies[0].kind).toBe("pink-goblin");
    expect(result.attackingEnemies[0].ranged).toBe(false);
  });

  test("cornered stunned goblin sidesteps along the wall instead of freezing", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    // Player left of the goblin, goblin against the right wall
    const player = { y: 5, x: 8 };
    const goblin = makePinkGoblin(5, 11);
    goblin.health = 2;
    goblin.behaviorMemory.aware = true;
    goblin.behaviorMemory.stunned = true;

    updateEnemies(grid, subtypes, [goblin], player, { rng: neutralRng });

    // Away axis (x) is blocked by the wall, so it falls back to a y sidestep.
    expect(goblin.x).toBe(11);
    expect(Math.abs(goblin.y - 5)).toBe(1);
  });
});
