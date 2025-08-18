import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { TilemapGrid } from '../../components/TilemapGrid';
import { Direction, TileSubtype, type GameState } from '../../lib/map';
import { Enemy } from '../../lib/enemy';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function makeBaseState(y: number, x: number): GameState {
  const size = 25;
  const tiles = Array.from({ length: size }, () => Array(size).fill(0));
  const subtypes = Array.from({ length: size }, () => Array.from({ length: size }, () => [] as number[]));
  subtypes[y][x] = [TileSubtype.PLAYER];
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: { tiles, subtypes },
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    // Deterministic RNG for combat variance
    combatRng: () => 0.9, // maps to +1 for hero attacks, +2 for enemy variance per enemy.ts
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
  } as GameState;
}

function withEnemy(state: GameState, enemyY: number, enemyX: number): GameState {
  const enemies: Enemy[] = [new Enemy({ y: enemyY, x: enemyX })];
  return { ...state, enemies } as GameState;
}

describe('Floating combat damage numbers', () => {
  it('shows a red floating number over the enemy when hero lands a hit (and kills with sword)', async () => {
    jest.useFakeTimers();
    // Player at (1,1), enemy at (1,2). Give sword so damage is lethal in one hit
    const base = makeBaseState(1, 1);
    const state: GameState = { ...withEnemy(base, 1, 2), hasSword: true };

    render(<TilemapGrid tileTypes={{}} initialGameState={state} />);

    // Move right into the enemy to attack
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    // Expect a floating damage over the enemy tile position (1,2)
    const floats = await screen.findAllByTestId('floating-damage');
    const float = floats.find((el) => el.getAttribute('data-target') === 'enemy')!;
    expect(float).toBeInTheDocument();
    expect(float).toHaveAttribute('data-target', 'enemy');
    expect(float).toHaveAttribute('data-y', '1');
    expect(float).toHaveAttribute('data-x', '2');
    // UI shows actual health removed; enemy had 3 HP, so 3
    expect(float).toHaveAttribute('data-amount', '3');
    expect(float).toHaveAttribute('data-color', 'red');

    // Effect should disappear after a short time
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(screen.queryByTestId('floating-damage')).toBeNull();

    jest.useRealTimers();
  });

  it('shows a green floating number over the hero when enemies hit the hero on their turn', async () => {
    jest.useFakeTimers();
    // Player at (5,5), enemy adjacent at (5,6). Do not move into enemy; move up to trigger enemy attack phase.
    const base = makeBaseState(5, 5);
    const state: GameState = withEnemy(base, 5, 6);

    render(<TilemapGrid tileTypes={{}} initialGameState={state} />);

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });

    // Expect a floating damage over the hero tile position (5,5)
    const float = await screen.findByTestId('floating-damage');
    expect(float).toBeInTheDocument();
    expect(float).toHaveAttribute('data-target', 'hero');
    expect(float).toHaveAttribute('data-y', '5');
    expect(float).toHaveAttribute('data-x', '5');
    // enemy base(1) + variance(+2 from 0.9 per enemy.ts) - defense(0) = 3
    expect(float).toHaveAttribute('data-amount', '3');
    expect(float).toHaveAttribute('data-color', 'green');

    // Effect should disappear after a short time
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(screen.queryByTestId('floating-damage')).toBeNull();

    jest.useRealTimers();
  });
});
