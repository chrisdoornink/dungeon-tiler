import { Enemy, updateEnemies } from "../../lib/enemy";
import { TileSubtype } from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";

// Pink goblin as a ranged skirmisher: at point-blank range it prefers to open
// up distance (so it can laser) and only zaps when it's boxed in. Taking a hit
// does NOT permanently change its behavior — it keeps its full teleport/laser
// kit and simply reacts.

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

describe("pink goblin — point-blank flee-or-zap", () => {
  test("adjacent with room to retreat backs off one tile and does not attack", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 5 };
    const goblin = makePinkGoblin(5, 6); // directly right of player, open space right

    const result = updateEnemies(grid, subtypes, [goblin], player, {
      rng: neutralRng,
    }) as { damage: number; attackingEnemies: unknown[] };

    // Opened up distance instead of trading blows
    expect(Math.abs(goblin.y - 5) + Math.abs(goblin.x - 5)).toBeGreaterThan(1);
    expect(result.damage).toBe(0);
    expect(result.attackingEnemies).toHaveLength(0);
  });

  test("adjacent but fully cornered zaps for close-range damage", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    // Seal the goblin into a one-tile pocket: walls on three sides, the player
    // adjacent on the fourth, so no move can increase the distance.
    const gy = 5, gx = 5;
    grid[gy - 1][gx] = WALL; // up
    grid[gy + 1][gx] = WALL; // down
    grid[gy][gx + 1] = WALL; // right
    const goblin = makePinkGoblin(gy, gx);
    const player = { y: gy, x: gx - 1 }; // directly left, adjacent

    const result = updateEnemies(grid, subtypes, [goblin], player, {
      rng: neutralRng,
    }) as {
      damage: number;
      attackingEnemies: Array<{ kind: string; ranged: boolean }>;
    };

    // Could not increase distance -> stayed put and zapped
    expect(goblin.y).toBe(gy);
    expect(goblin.x).toBe(gx);
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.attackingEnemies).toHaveLength(1);
    expect(result.attackingEnemies[0].kind).toBe("pink-goblin");
  });

  test("still lasers at range with a clear line of sight", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    const player = { y: 5, x: 1 };
    const goblin = makePinkGoblin(5, 5); // distance 4, LOS down the row

    const result = updateEnemies(grid, subtypes, [goblin], player, {
      rng: neutralRng,
    }) as {
      damage: number;
      attackingEnemies: Array<{ kind: string; ranged: boolean }>;
    };

    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.attackingEnemies).toHaveLength(1);
    expect(result.attackingEnemies[0].ranged).toBe(true); // fires a beam
  });

  test("taking a hit does not disable teleporting — a ring is still deployed with no LOS", () => {
    const grid = openGrid();
    const subtypes = emptySubtypes();
    // A wall between goblin and player breaks LOS so the goblin uses its ring.
    for (let y = 0; y < SIZE; y++) grid[y][4] = WALL;
    const player = { y: 5, x: 1 };
    const goblin = makePinkGoblin(5, 8);
    goblin.health = 2; // already damaged by a rock

    updateEnemies(grid, subtypes, [goblin], player, { rng: () => 0.1 });

    // With no LOS it drops a teleport ring rather than being permanently defanged
    const ringOut = subtypes.some((row) =>
      row.some((cell) => cell.includes(TileSubtype.PINK_RING))
    );
    expect(ringOut).toBe(true);
  });
});
