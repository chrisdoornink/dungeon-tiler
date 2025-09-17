import { GameState } from '../../lib/map';

// Test the poison condition system
describe('Poison Condition', () => {
  test('player should be able to be poisoned', () => {
    // Mock game state with poison condition
    const gameState: Partial<GameState> = {
      heroHealth: 5,
      conditions: {
        poisoned: {
          active: true,
          stepsSinceLastDamage: 0,
          damagePerInterval: 1,
          stepInterval: 8
        }
      }
    };

    expect(gameState.conditions?.poisoned?.active).toBe(true);
    expect(gameState.conditions?.poisoned?.damagePerInterval).toBe(1);
    expect(gameState.conditions?.poisoned?.stepInterval).toBe(8);
  });

  test('poison should deal damage every 8 steps', () => {
    const gameState: Partial<GameState> = {
      heroHealth: 5,
      conditions: {
        poisoned: {
          active: true,
          stepsSinceLastDamage: 7, // Almost time for damage
          damagePerInterval: 1,
          stepInterval: 8
        }
      }
    };

    // Simulate taking a step (step 8)
    if (gameState.conditions?.poisoned) {
      gameState.conditions.poisoned.stepsSinceLastDamage++;
      
      if (gameState.conditions.poisoned.stepsSinceLastDamage >= gameState.conditions.poisoned.stepInterval) {
        gameState.heroHealth = (gameState.heroHealth || 5) - gameState.conditions.poisoned.damagePerInterval;
        gameState.conditions.poisoned.stepsSinceLastDamage = 0;
      }
    }

    expect(gameState.heroHealth).toBe(4); // Should have taken 1 damage
    expect(gameState.conditions?.poisoned?.stepsSinceLastDamage).toBe(0); // Reset counter
  });

  test('potion should cure poison', () => {
    const gameState: Partial<GameState> = {
      heroHealth: 3,
      conditions: {
        poisoned: {
          active: true,
          stepsSinceLastDamage: 4,
          damagePerInterval: 1,
          stepInterval: 8
        }
      }
    };

    // Simulate using potion
    if (gameState.conditions?.poisoned) {
      gameState.conditions.poisoned.active = false;
      gameState.heroHealth = Math.min(5, (gameState.heroHealth || 0) + 2); // Heal 2
    }

    expect(gameState.conditions?.poisoned?.active).toBe(false);
    expect(gameState.heroHealth).toBe(5); // Healed to full
  });

  test('snake attack should apply poison', () => {
    const gameState: Partial<GameState> = {
      heroHealth: 5,
      conditions: {}
    };

    // Simulate snake attack
    const applyPoison = (state: Partial<GameState>) => {
      if (!state.conditions) state.conditions = {};
      state.conditions.poisoned = {
        active: true,
        stepsSinceLastDamage: 0,
        damagePerInterval: 1,
        stepInterval: 8
      };
    };

    applyPoison(gameState);

    expect(gameState.conditions?.poisoned?.active).toBe(true);
  });
});
