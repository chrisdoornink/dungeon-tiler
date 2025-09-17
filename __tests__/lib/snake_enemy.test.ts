import { EnemyRegistry } from '../../lib/enemies/registry';

describe('Snake Enemy', () => {
  test('snake enemy should be registered with correct stats', () => {
    const snake = EnemyRegistry['snake'];
    
    expect(snake).toBeDefined();
    expect(snake.kind).toBe('snake');
    expect(snake.displayName).toBe('Snake');
    expect(snake.base.health).toBe(2);
    expect(snake.base.attack).toBe(1);
  });

  test('snake should have coiled and moving assets', () => {
    const snake = EnemyRegistry['snake'];
    
    expect(snake.assets.front).toBe('/images/enemies/snake-coiled-right.png'); // coiled when not moving
    expect(snake.assets.left).toBe('/images/enemies/snake-moving-left.png'); // moving asset
    expect(snake.assets.right).toBe('/images/enemies/snake-coiled-right.png'); // coiled when not moving
  });

  test('snake should have correct spawn configuration', () => {
    const snake = EnemyRegistry['snake'];
    
    // 33% of rooms should have snakes, with 50% starting in pots
    expect(snake.desiredMinCount).toBe(0);
    expect(snake.desiredMaxCount).toBe(1);
  });

  test('snake should take normal melee damage', () => {
    const snake = EnemyRegistry['snake'];
    
    const damage = snake.calcMeleeDamage({
      heroAttack: 1,
      swordBonus: 1,
      variance: 0
    });
    
    expect(damage).toBe(2); // 1 + 1 + 0
  });
});
