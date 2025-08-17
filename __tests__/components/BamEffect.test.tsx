import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { TilemapGrid } from '../../components/TilemapGrid';
import { Direction, TileSubtype, type GameState } from '../../lib/map';
import { Enemy } from '../../lib/enemy';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function makeState(y: number, x: number, enemyY: number, enemyX: number): GameState {
  const size = 25; // match game grid size expectations
  const tiles = Array.from({ length: size }, () => Array(size).fill(0));
  const subtypes = Array.from({ length: size }, () => Array.from({ length: size }, () => [] as number[]));
  subtypes[y][x] = [TileSubtype.PLAYER];
  const enemies: Enemy[] = [new Enemy({ y: enemyY, x: enemyX })];
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: { tiles, subtypes },
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies,
    heroHealth: 5,
    heroAttack: 1,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0 },
  };
}

describe('Bam effect UI', () => {
  it('shows a bam overlay halfway between hero and enemy on combat', async () => {
    jest.useFakeTimers();
    const state = makeState(1, 1, 1, 2); // player at (1,1), enemy to the right at (1,2)

    render(<TilemapGrid tileTypes={{}} initialGameState={state} />);

    // Simulate right arrow key to initiate combat
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    // Bam effect should appear
    const bam = await screen.findByTestId('bam-effect');
    expect(bam).toBeInTheDocument();

    // Should encode midpoint between (1,1) and (1,2) as grid coords (y,x)
    expect(bam).toHaveAttribute('data-bam-y', '1');
    expect(bam).toHaveAttribute('data-bam-x', '1.5');

    // It should disappear after a short duration
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId('bam-effect')).toBeNull();

    jest.useRealTimers();
  });
});
