import React from 'react';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import '@testing-library/jest-dom';
import EndPage from '../../app/end/page';
import * as nav from '../../lib/navigation';
jest.mock('../../lib/navigation', () => ({ go: jest.fn() }));

describe('End Page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('MOCK_DATE');
  });

  afterEach(() => {
    (Date.prototype.toLocaleString as jest.Mock).mockRestore?.();
  });

  it('shows fallback when no last game is present', () => {
    render(<EndPage />);
    expect(screen.getByText('No game data found')).toBeInTheDocument();
    expect(
      screen.getByText('Play a game to see your results here.')
    ).toBeInTheDocument();
  });

  it('renders summary from localStorage lastGame', () => {
    const payload = {
      completedAt: new Date().toISOString(),
      hasKey: true,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      streak: 3,
      mapData: {
        tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
        subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
      },
    };
    window.localStorage.setItem('lastGame', JSON.stringify(payload));

    render(<EndPage />);

    expect(screen.getByText('You escaped the dungeon!')).toBeInTheDocument();
    expect(screen.getByText('Completed at MOCK_DATE')).toBeInTheDocument();
    // Icons-only pickups: 🔑 should be present (may appear more than once now with inventory section), 🗝️ absent
    const keyIcons = screen.getAllByText('🔑');
    expect(keyIcons.length).toBeGreaterThan(0);
    expect(screen.queryByText('🗝️')).not.toBeInTheDocument();
    // No map size rows anymore
    expect(screen.queryByText('Map Size')).not.toBeInTheDocument();
    // Streak shown
    expect(screen.getByText('Streak')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // Play again button present
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });

  it('Play Again preserves streak in localStorage and navigates home', () => {
    const payload = {
      completedAt: new Date().toISOString(),
      hasKey: true,
      hasExitKey: true,
      hasSword: true,
      hasShield: false,
      streak: 4,
      mapData: {
        tiles: Array(3).fill(0).map(() => Array(3).fill(0)),
        subtypes: Array(3).fill(0).map(() => Array(3).fill(0).map(() => [] as number[])),
      },
      outcome: 'win' as const,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    };
    window.localStorage.setItem('lastGame', JSON.stringify(payload));

    (nav.go as jest.Mock).mockImplementation(() => {});

    render(<EndPage />);

    const btn = screen.getByRole('button', { name: /play again/i });
    fireEvent.click(btn);

    expect(nav.go).toHaveBeenCalledWith('/');

    const raw = window.localStorage.getItem('lastGame');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.streak).toBe(4);

    // Restore
    (nav.go as jest.Mock).mockReset();
  });
});
