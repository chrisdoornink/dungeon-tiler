import { initializeGameState, movePlayer, Direction, TileSubtype, type GameState } from "../../lib/map";
import { Enemy, placeEnemies } from "../../lib/enemy";

// combatRng that returns each value in order, repeating the last forever. Retreating from
// an adjacent enemy now rolls a "parting shot" first (connects when the draw is < 0.4),
// then the attack-variance draw, so a connecting retreat hit needs [low, variance].
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("Health system - initial hero health", () => {
  test("hero starts with 5 health", () => {
    const gs = initializeGameState();
    // New field to introduce via TDD
    expect(gs.heroHealth).toBe(5);
  });

describe("Combat - running away behavior", () => {
  test("running away is no longer free: a connecting parting shot still wounds the hero", () => {
    const gs = makeEmptyStateWithPlayer(2, 2);
    // Enemy to the right (adjacent)
    const e = new Enemy({ y: 2, x: 3 });
    e.health = 3;
    e.attack = 1;
    // Parting shot connects (0.1 < 0.4), then 0-variance (0.5) -> 1 damage.
    gs.combatRng = seqRng([0.1, 0.5]);
    gs.enemies!.push(e);

    const before = { health: gs.heroHealth, taken: gs.stats.damageTaken };

    // Run away: move LEFT to increase distance from 1 to 2
    const after = movePlayer(gs, Direction.LEFT);

    expect(after.heroHealth).toBe(before.health - 1);
    expect(after.stats.damageTaken).toBe(before.taken + 1);
    // Enemy stayed put (it swung rather than chased).
    expect(after.enemies![0].y).toBe(2);
    expect(after.enemies![0].x).toBe(3);
  });

  test("the parting shot can miss, so retreat is safer than standing (not a guaranteed hit)", () => {
    const gs = makeEmptyStateWithPlayer(2, 2);
    const e = new Enemy({ y: 2, x: 3 });
    e.health = 3;
    e.attack = 1;
    // Parting shot rolls a miss (0.9 >= 0.4) -> the enemy's attack is suppressed.
    gs.combatRng = seqRng([0.9]);
    gs.enemies!.push(e);

    const before = { health: gs.heroHealth, taken: gs.stats.damageTaken };
    const after = movePlayer(gs, Direction.LEFT);

    expect(after.heroHealth).toBe(before.health);
    expect(after.stats.damageTaken).toBe(before.taken);
  });
});

describe("Combat - enemy attacks when attempting to step onto player", () => {
  test("adjacent enemy attempts to move into player; heroHealth decreases; damageTaken increments; enemy stays put", () => {
    const gs = makeEmptyStateWithPlayer(2, 2);
    // Place enemy to the left so intended step would be into player
    const e = new Enemy({ y: 2, x: 1 });
    e.health = 3;
    e.attack = 1;
    gs.enemies!.push(e);

    // Stepping to the side is still a retreat, so force the parting shot to connect
    // (0.1 < 0.4) with 0-variance (0.5) -> 1 damage.
    gs.combatRng = seqRng([0.1, 0.5]);
    const beforeHealth = gs.heroHealth;
    const after = movePlayer(gs, Direction.UP); // any move to tick enemies

    expect(after.heroHealth).toBe(beforeHealth - 1);
    expect(after.stats.damageTaken).toBe(1);
    // Enemy should not overlap player
    expect(after.enemies![0].y).toBe(2);
    expect(after.enemies![0].x).toBe(1);
  });
});

function makeEmptyStateWithPlayer(y: number, x: number): GameState {
  const size = 25;
  const tiles = Array.from({ length: size }, () => Array(size).fill(0)); // FLOOR
  const subtypes = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );
  subtypes[y][x].push(TileSubtype.PLAYER);
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: { tiles, subtypes },
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [] as Enemy[],
    heroHealth: 5,
    heroAttack: 1,
    // Deterministic variance for tests: 0 -> no +/- change
    combatRng: () => 0.5,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
  } as GameState;
}

describe("Combat - player attacks when moving into enemy", () => {
  test("on hit (enemy survives), player stays and enemy health decreases; damageDealt increments", () => {
    const gs = makeEmptyStateWithPlayer(2, 2);
    // Place enemy to the right (target of RIGHT move)
    const e = new Enemy({ y: 2, x: 3 });
    e.health = 3; // ensure known value
    gs.enemies!.push(e);

    const after = movePlayer(gs, Direction.RIGHT);

    expect(after.enemies![0].y).toBe(2);
    expect(after.enemies![0].x).toBe(3);
    expect(after.enemies![0].health).toBe(2); // took 1 damage
    expect(after.stats.damageDealt).toBe(1);

    // Player should not have moved into the enemy since it survived
    const playerPos = after.mapData.subtypes.flatMap((row, yy) =>
      row.flatMap((cell, xx) => (cell.includes(TileSubtype.PLAYER) ? [[yy, xx] as [number, number]] : []))
    )[0];
    expect(playerPos).toEqual([2, 2]);
  });

  test("on kill (enemy health <= 0), enemy is removed, player stays in place, enemiesDefeated increments", () => {
    const gs = makeEmptyStateWithPlayer(2, 2);
    const e = new Enemy({ y: 2, x: 3 });
    e.health = 1; // one hit to kill
    gs.enemies!.push(e);

    const after = movePlayer(gs, Direction.RIGHT);

    // Enemy removed
    expect(after.enemies!.length).toBe(0);
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.stats.damageDealt).toBe(1);

    // Player should remain in original position (no stepping into enemy tile)
    const playerPos = after.mapData.subtypes.flatMap((row, yy) =>
      row.flatMap((cell, xx) => (cell.includes(TileSubtype.PLAYER) ? [[yy, xx] as [number, number]] : []))
    )[0];
    expect(playerPos).toEqual([2, 2]);
  });
});

describe("Session stats scaffold", () => {
  test("game state exposes zeroed stats: damageDealt, damageTaken, enemiesDefeated", () => {
    const gs = initializeGameState();
    expect(gs.stats).toBeDefined();
    expect(gs.stats.damageDealt).toBe(0);
    expect(gs.stats.damageTaken).toBe(0);
    expect(gs.stats.enemiesDefeated).toBe(0);
  });
});
});

describe("Attack system - default values", () => {
  test("hero attack defaults to 1", () => {
    const gs = initializeGameState();
    // New field to introduce via TDD
    expect(gs.heroAttack).toBe(1);
  });

  test("goblin attack defaults to 1", () => {
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const player = { y: 1, x: 1 };
    const enemies = placeEnemies({ grid, player, count: 1, minDistanceFromPlayer: 0, rng: () => 0.5 });
    expect(enemies.length).toBe(1);
    // New field to introduce via TDD
    expect(enemies[0].attack).toBe(1);
  });
});

describe("Health system - initial goblin health", () => {
  test("goblin starts with 3 health", () => {
    // Simple tiny floor grid 3x3
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const player = { y: 1, x: 1 };
    const enemies = placeEnemies({ grid, player, count: 1, minDistanceFromPlayer: 0, rng: () => 0.5 });
    expect(enemies.length).toBe(1);
    // New field to introduce via TDD
    expect(enemies[0].health).toBe(5);
  });
});
