import { advanceToNextFloor } from '../../lib/map/game-state';
import type { GameState } from '../../lib/map/game-state';

// Minimal valid GameState for testing advanceToNextFloor
function makeMinimalState(overrides: Partial<GameState> = {}): GameState {
  const size = 15;
  const tiles = Array.from({ length: size }, () => Array(size).fill(0));
  const subtypes = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );
  // Place player at (1,1)
  subtypes[1][1] = [10]; // TileSubtype.PLAYER = 10

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: true,
    showFullMap: false,
    win: false,
    playerDirection: 2,
    heroHealth: 5,
    heroAttack: 2,
    enemies: [],
    mapData: { tiles, subtypes },
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 50 },
    currentFloor: 3,
    maxFloors: 10,
    floorChestAllocation: {},
    portalLocation: { roomId: '__base__', position: [5, 5] },
    hasSnakeMedallion: true,
    ...overrides,
  } as GameState;
}

describe('advanceToNextFloor', () => {
  test('portalLocation is reset to undefined on floor advance', () => {
    const state = makeMinimalState({
      portalLocation: { roomId: '__base__', position: [5, 5] },
    });

    const nextState = advanceToNextFloor(state, 12345);

    expect(nextState.portalLocation).toBeUndefined();
  });

  test('currentFloor is incremented', () => {
    const state = makeMinimalState({ currentFloor: 3 });

    const nextState = advanceToNextFloor(state, 12345);

    expect(nextState.currentFloor).toBe(4);
  });

  test('hasExitKey is reset for new floor', () => {
    const state = makeMinimalState({ hasExitKey: true });

    const nextState = advanceToNextFloor(state, 12345);

    expect(nextState.hasExitKey).toBe(false);
  });

  test('inventory items (sword, shield, medallion) are preserved', () => {
    const state = makeMinimalState({
      hasSword: true,
      hasShield: true,
      hasSnakeMedallion: true,
    });

    const nextState = advanceToNextFloor(state, 12345);

    expect(nextState.hasSword).toBe(true);
    expect(nextState.hasShield).toBe(true);
    expect(nextState.hasSnakeMedallion).toBe(true);
  });

  test('heroHealth is preserved', () => {
    const state = makeMinimalState({ heroHealth: 3 });

    const nextState = advanceToNextFloor(state, 12345);

    expect(nextState.heroHealth).toBe(3);
  });
});
