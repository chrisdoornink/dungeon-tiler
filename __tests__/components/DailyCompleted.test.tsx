import React from 'react';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import '@testing-library/jest-dom';
import DailyCompleted from '../../components/daily/DailyCompleted';
import { DailyChallengeData } from '../../lib/daily_challenge_storage';

// Mock analytics
jest.mock('../../lib/posthog_analytics', () => ({
  trackDailyChallenge: jest.fn(),
}));

describe('DailyCompleted Layout and Box Adjustments', () => {
  const mockWinData: DailyChallengeData = {
    hasSeenIntro: true,
    currentStreak: 5,
    totalGamesPlayed: 10,
    totalGamesWon: 7,
    lastPlayedDate: '2024-01-15',
    todayCompleted: true,
    todayResult: 'won',
    streakHistory: [
      { date: '2024-01-15', result: 'won', streak: 5 }
    ]
  };

  const mockLossData: DailyChallengeData = {
    ...mockWinData,
    todayResult: 'lost',
    currentStreak: 0,
  };

  const mockLastGame = {
    completedAt: new Date().toISOString(),
    hasKey: true,
    hasExitKey: true,
    hasSword: true,
    hasShield: true,
    heroHealth: 3,
    outcome: 'win' as const,
    stats: { 
      damageDealt: 15, 
      damageTaken: 2, 
      enemiesDefeated: 3, 
      steps: 45,
      byKind: { 'fire-goblin': 2, ghost: 1, 'stone-goblin': 0 }
    },
    mapData: {
      tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
      subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
    },
  };

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('lastGame', JSON.stringify(mockLastGame));
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('Layout Requirements', () => {
    it('should have Game Statistics Box as the main centered larger container', () => {
      render(<DailyCompleted data={mockWinData} />);
      
      // Look for the main game statistics container
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      expect(gameStatsBox).toBeInTheDocument();
      expect(gameStatsBox).toHaveClass('max-w-2xl'); // Larger than default
    });

    it('should have Share Results button inside the Game Statistics box', () => {
      render(<DailyCompleted data={mockWinData} />);
      
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      const shareButton = screen.getByRole('button', { name: /share results/i });
      
      // Share button should be a child of the game statistics box
      expect(gameStatsBox).toContainElement(shareButton);
    });

    it('should not display "Updated Stats" title anywhere', () => {
      render(<DailyCompleted data={mockWinData} />);
      
      // Should not find any "Updated Stats" text
      expect(screen.queryByText(/updated stats/i)).not.toBeInTheDocument();
    });

    it('should display individual stats as a simple list below Game Statistics box', () => {
      render(<DailyCompleted data={mockWinData} />);
      
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      const individualStatsList = screen.getByTestId('individual-stats-list');
      
      // Individual stats should be outside and below the game statistics box
      expect(gameStatsBox).not.toContainElement(individualStatsList);
      
      // Should contain streak, total games, etc. as simple list items
      expect(individualStatsList).toBeInTheDocument();
    });

    it('should have proper layout hierarchy: Game Stats Box (centered, larger) > Individual Stats List (below)', () => {
      render(<DailyCompleted data={mockWinData} />);
      
      const gameStatsBox = screen.getByTestId('game-statistics-box');
      const individualStatsList = screen.getByTestId('individual-stats-list');
      
      // Game stats box should be larger
      expect(gameStatsBox).toHaveClass('max-w-2xl');
      
      // Individual stats should be positioned after game stats in DOM
      const gameStatsPosition = Array.from(document.body.querySelectorAll('*')).indexOf(gameStatsBox);
      const individualStatsPosition = Array.from(document.body.querySelectorAll('*')).indexOf(individualStatsList);
      
      expect(individualStatsPosition).toBeGreaterThan(gameStatsPosition);
    });

    it('should replace emojis with proper assets in victory/defeat display', () => {
      render(<DailyCompleted data={mockWinData} />);
      
      // Should not find emoji characters for victory/defeat
      expect(screen.queryByText('🎉')).not.toBeInTheDocument();
      expect(screen.queryByText('💀')).not.toBeInTheDocument();
      
      // Should find proper asset-based victory display
      const victoryAsset = screen.getByTestId('victory-asset');
      expect(victoryAsset).toBeInTheDocument();
    });

    it('should replace emojis with proper assets in defeat display', () => {
      render(<DailyCompleted data={mockLossData} />);
      
      // Should not find emoji characters for victory/defeat
      expect(screen.queryByText('🎉')).not.toBeInTheDocument();
      expect(screen.queryByText('💀')).not.toBeInTheDocument();
      
      // Should find proper asset-based defeat display
      const defeatAsset = screen.getByTestId('defeat-asset');
      expect(defeatAsset).toBeInTheDocument();
    });
  });
});
