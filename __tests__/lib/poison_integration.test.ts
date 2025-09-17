import { movePlayer, Direction, GameState, performUsePotion, TileSubtype } from '../../lib/map';
import { createEmptyByKind } from '../../lib/enemies/registry';

describe('Poison System Integration', () => {
  let mockGameState: GameState;

  beforeEach(() => {
    mockGameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: {
        tiles: Array(25).fill(null).map(() => Array(25).fill(0)),
        subtypes: Array(25).fill(null).map((_, y) => 
          Array(25).fill(null).map((_, x) => 
            y === 12 && x === 12 ? [TileSubtype.PLAYER] : []
          )
        )
      },
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      potionCount: 1,
      stats: {
        damageDealt: 0,
        damageTaken: 0,
        enemiesDefeated: 0,
        steps: 0,
        byKind: createEmptyByKind()
      },
      conditions: {
        poisoned: {
          active: true,
          stepsSinceLastDamage: 7, // Almost ready for damage
          damagePerInterval: 1,
          stepInterval: 8
        }
      }
    };
  });

  test('poison should deal damage when step interval is reached', () => {
    const result = movePlayer(mockGameState, Direction.UP);
    
    // Should have taken poison damage (step 8)
    expect(result.heroHealth).toBe(4);
    expect(result.conditions?.poisoned?.stepsSinceLastDamage).toBe(0);
    expect(result.stats.steps).toBe(1);
  });

  test('poison should not deal damage before interval', () => {
    if (mockGameState.conditions?.poisoned) {
      mockGameState.conditions.poisoned.stepsSinceLastDamage = 3;
    }
    
    const result = movePlayer(mockGameState, Direction.UP);
    
    // Should not have taken poison damage yet
    expect(result.heroHealth).toBe(5);
    expect(result.conditions?.poisoned?.stepsSinceLastDamage).toBe(4);
  });

  test('using potion should cure poison and heal', () => {
    mockGameState.heroHealth = 3;
    
    const result = performUsePotion(mockGameState);
    
    expect(result.heroHealth).toBe(5); // Healed 2
    expect(result.conditions?.poisoned?.active).toBe(false);
    expect(result.potionCount).toBe(0);
  });

  test('poison should not affect player when not active', () => {
    if (mockGameState.conditions?.poisoned) {
      mockGameState.conditions.poisoned.active = false;
    }
    
    const result = movePlayer(mockGameState, Direction.UP);
    
    expect(result.heroHealth).toBe(5); // No damage
    expect(result.conditions?.poisoned?.stepsSinceLastDamage).toBe(7); // Counter unchanged
  });
});
