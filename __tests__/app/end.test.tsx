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
    expect(screen.getByText('Current Streak')).toBeInTheDocument();
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

  describe('Layout and Box Adjustments', () => {
    const mockGameData = {
      completedAt: new Date().toISOString(),
      hasKey: true,
      hasExitKey: true,
      hasSword: true,
      hasShield: true,
      streak: 5,
      heroHealth: 3,
      outcome: 'win' as const,
      stats: { 
        damageDealt: 15, 
        damageTaken: 2, 
        enemiesDefeated: 3, 
        steps: 45,
        byKind: { goblin: 2, ghost: 1, 'stone-exciter': 0 }
      },
      mapData: {
        tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
        subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
      },
    };

    beforeEach(() => {
      window.localStorage.setItem('lastGame', JSON.stringify(mockGameData));
    });

    it('should have Game Statistics Box as the main centered larger container', () => {
      render(<EndPage />);
      
      // Look for the main game statistics container
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      expect(gameStatsBox).toBeInTheDocument();
      expect(gameStatsBox).toHaveClass('max-w-2xl'); // Larger than default max-w-md
    });

    it('should have Share Results button inside the Game Statistics box', () => {
      render(<EndPage />);
      
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      const shareButton = screen.getByRole('button', { name: /share/i });
      
      // Share button should be a child of the game statistics box
      expect(gameStatsBox).toContainElement(shareButton);
    });

    it('should not display "Updated Stats" title anywhere', () => {
      render(<EndPage />);
      
      // Should not find any "Updated Stats" text
      expect(screen.queryByText(/updated stats/i)).not.toBeInTheDocument();
    });

    it('should display individual stats as a simple list below Game Statistics box', () => {
      render(<EndPage />);
      
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      const individualStatsList = screen.getByTestId('individual-stats-list');
      
      // Individual stats should be outside and below the game statistics box
      expect(gameStatsBox).not.toContainElement(individualStatsList);
      
      // Should contain streak, total games, etc. as simple list items
      expect(individualStatsList).toBeInTheDocument();
    });

    it('should have proper layout hierarchy: Game Stats Box (centered, larger) > Individual Stats List (below)', () => {
      render(<EndPage />);
      
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      const individualStatsList = screen.getByTestId('individual-stats-list');
      
      // Game stats box should be larger
      expect(gameStatsBox).toHaveClass('max-w-2xl');
      
      // Individual stats should be positioned after game stats in DOM
      const gameStatsPosition = Array.from(document.body.querySelectorAll('*')).indexOf(gameStatsBox);
      const individualStatsPosition = Array.from(document.body.querySelectorAll('*')).indexOf(individualStatsList);
      
      expect(individualStatsPosition).toBeGreaterThan(gameStatsPosition);
    });
  });
});
