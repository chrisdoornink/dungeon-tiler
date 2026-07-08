import { Enemy, updateEnemies } from "../../lib/enemy";
import { canSee } from "../../lib/line_of_sight";
import { FLOOR, WALL } from "../../lib/map/constants";

// Regression: the pink goblin fires a ranged beam BEFORE the hero's pending move is
// applied. It used to gate line-of-sight on the tile the hero was leaving, so it could
// laser a hero who was stepping around a corner out of sight. It must instead aim at
// the hero's predicted end-of-turn tile (`playerNext`).

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
  e.behaviorMemory.aware = true;
  return e;
}

const neutralRng = () => 0.5;

describe("pink goblin — line of sight is checked at the hero's post-move tile", () => {
  // Shared corner geometry: goblin at (1,1), hero currently at (1,5) with a clear
  // sightline down row 1, and a single wall at (2,4). Stepping down to (2,5) hides
  // the hero behind that wall.
  const goblinPos = { y: 1, x: 1 };
  const heroNow = { y: 1, x: 5 };
  const heroAroundCorner = { y: 2, x: 5 };

  function cornerGrid(): number[][] {
    const grid = openGrid();
    grid[2][4] = WALL;
    return grid;
  }

  test("precondition: LOS is clear to the current tile but blocked around the corner", () => {
    const grid = cornerGrid();
    expect(canSee(grid, [goblinPos.y, goblinPos.x], [heroNow.y, heroNow.x])).toBe(
      true
    );
    expect(
      canSee(grid, [goblinPos.y, goblinPos.x], [heroAroundCorner.y, heroAroundCorner.x])
    ).toBe(false);
  });

  test("does not fire when the hero is stepping out of sight around the corner", () => {
    const grid = cornerGrid();
    const subtypes = emptySubtypes();
    const goblin = makePinkGoblin(goblinPos.y, goblinPos.x);

    const result = updateEnemies(grid, subtypes, [goblin], heroNow, {
      rng: neutralRng,
      playerNext: heroAroundCorner,
    }) as { damage: number; attackingEnemies: unknown[] };

    expect(result.damage).toBe(0);
    expect(result.attackingEnemies).toHaveLength(0);
  });

  test("still fires when the hero's move keeps them in the open", () => {
    const grid = cornerGrid();
    const subtypes = emptySubtypes();
    const goblin = makePinkGoblin(goblinPos.y, goblinPos.x);

    // Hero steps along the open row (stays in LOS): playerNext still visible.
    const result = updateEnemies(grid, subtypes, [goblin], heroNow, {
      rng: neutralRng,
      playerNext: { y: 1, x: 4 },
    }) as {
      damage: number;
      attackingEnemies: Array<{ kind: string; ranged: boolean }>;
    };

    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.attackingEnemies).toHaveLength(1);
    expect(result.attackingEnemies[0].ranged).toBe(true);
  });

  test("falls back to the current tile when no prediction is supplied", () => {
    const grid = cornerGrid();
    const subtypes = emptySubtypes();
    const goblin = makePinkGoblin(goblinPos.y, goblinPos.x);

    // No playerNext -> behaves as before, aiming at the hero's current tile.
    const result = updateEnemies(grid, subtypes, [goblin], heroNow, {
      rng: neutralRng,
    }) as {
      damage: number;
      attackingEnemies: Array<{ kind: string; ranged: boolean }>;
    };

    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.attackingEnemies).toHaveLength(1);
    expect(result.attackingEnemies[0].ranged).toBe(true);
  });
});
