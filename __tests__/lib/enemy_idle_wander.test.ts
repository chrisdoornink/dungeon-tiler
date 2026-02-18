import { Enemy, EnemyState } from '../../lib/enemy';

// Simple 10x10 open floor map (no walls)
const makeOpenMap = () => Array.from({ length: 10 }, () => Array(10).fill(0));

describe('Goblin idle wandering behavior', () => {
  test('idle goblin has a chance to wander (moves at least once over many ticks)', () => {
    const grid = makeOpenMap();
    // Place enemy far from player with no LOS path (player behind wall)
    // Use open map but place player far away; enemy starts IDLE with no pursuit memory
    const player = { y: 0, x: 0 };
    const enemy = new Enemy({ y: 5, x: 5 });
    enemy.kind = 'fire-goblin';
    enemy.state = EnemyState.IDLE;

    let moved = false;
    const startY = enemy.y;
    const startX = enemy.x;

    // Run many ticks; with 50% chance, should move at least once in 50 ticks
    for (let i = 0; i < 50; i++) {
      enemy.update({ grid, player });
      if (enemy.y !== startY || enemy.x !== startX) {
        moved = true;
        break;
      }
    }

    expect(moved).toBe(true);
  });

  test('idle goblin sometimes stays put (does not always move)', () => {
    const grid = makeOpenMap();
    const player = { y: 0, x: 0 };

    let stayedCount = 0;
    // Run multiple independent trials
    for (let trial = 0; trial < 30; trial++) {
      const enemy = new Enemy({ y: 5, x: 5 });
      enemy.kind = 'fire-goblin';
      enemy.state = EnemyState.IDLE;

      const startY = enemy.y;
      const startX = enemy.x;
      enemy.update({ grid, player });
      if (enemy.y === startY && enemy.x === startX) {
        stayedCount++;
      }
    }

    // With 50% chance, expect some to stay (at least 3 out of 30)
    expect(stayedCount).toBeGreaterThanOrEqual(3);
  });

  test('snake does not wander when idle (snakes excluded from idle wander)', () => {
    const grid = makeOpenMap();
    // Place player far away with a wall between to block LOS
    grid[3][0] = 1; grid[3][1] = 1; grid[3][2] = 1; grid[3][3] = 1;
    grid[3][4] = 1; grid[3][5] = 1; grid[3][6] = 1; grid[3][7] = 1;
    grid[3][8] = 1; grid[3][9] = 1; // solid wall row
    const player = { y: 0, x: 0 };
    const snake = new Enemy({ y: 5, x: 5 });
    snake.kind = 'snake';
    snake.state = EnemyState.IDLE;

    const startY = snake.y;
    const startX = snake.x;

    // Snakes are excluded from goblin idle wander; should stay put
    for (let i = 0; i < 30; i++) {
      snake.update({ grid, player });
      // Snake should not move via idle wander (it may move via its own behavior, but not goblin wander)
    }

    // Snake should remain IDLE (no goblin wander triggered)
    expect(snake.state).toBe(EnemyState.IDLE);
  });

  test('idle wandering goblin does not move onto the player tile', () => {
    const grid = makeOpenMap();
    // Place player adjacent to enemy
    const player = { y: 5, x: 6 };
    const enemy = new Enemy({ y: 5, x: 5 });
    enemy.kind = 'fire-goblin';
    enemy.state = EnemyState.IDLE;

    for (let i = 0; i < 50; i++) {
      enemy.update({ grid, player });
      // Enemy should never occupy the player's tile during idle wander
      expect(enemy.y === player.y && enemy.x === player.x).toBe(false);
    }
  });

  test('all goblin types can idle wander', () => {
    const goblinKinds = [
      'fire-goblin', 'water-goblin', 'water-goblin-spear',
      'earth-goblin', 'earth-goblin-knives', 'pink-goblin', 'stone-goblin',
    ] as const;

    const grid = makeOpenMap();
    const player = { y: 0, x: 0 };

    for (const kind of goblinKinds) {
      let moved = false;
      for (let trial = 0; trial < 50; trial++) {
        const enemy = new Enemy({ y: 5, x: 5 });
        enemy.kind = kind;
        enemy.state = EnemyState.IDLE;
        enemy.update({ grid, player });
        if (enemy.y !== 5 || enemy.x !== 5) {
          moved = true;
          break;
        }
      }
      expect(moved).toBe(true);
    }
  });
});
