import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DailyCompleted from '../../components/daily/DailyCompleted';
import { DailyChallengeData } from '../../lib/daily_challenge_storage';

// Mock analytics
jest.mock('../../lib/posthog_analytics', () => ({
  trackDailyChallenge: jest.fn(),
}));

describe('DailyCompleted level display and grouped enemies', () => {
  const mockData: DailyChallengeData = {
    hasSeenIntro: true,
    currentStreak: 0,
    totalGamesPlayed: 5,
    totalGamesWon: 2,
    lastPlayedDate: '2026-02-17',
    todayCompleted: true,
    todayResult: 'lost',
    streakHistory: [],
  };

  afterEach(() => {
    window.localStorage.clear();
  });

  test('displays "Reached Level X" when currentFloor is present', () => {
    const lastGame = {
      completedAt: new Date().toISOString(),
      hasKey: false,
      hasExitKey: false,
      hasSword: true,
      hasShield: false,
      heroHealth: 0,
      outcome: 'dead',
      currentFloor: 5,
      stats: {
        damageDealt: 10,
        damageTaken: 5,
        enemiesDefeated: 3,
        steps: 100,
        byKind: { 'fire-goblin': 2, 'water-goblin': 1 },
      },
      mapData: {
        tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
        subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
      },
    };
    window.localStorage.setItem('lastGame', JSON.stringify(lastGame));

    render(<DailyCompleted data={mockData} />);

    // Should show level in the header area
    const levelTexts = screen.getAllByText('Level 5');
    expect(levelTexts.length).toBeGreaterThanOrEqual(1);
  });

  test('does not display level when currentFloor is absent', () => {
    const lastGame = {
      completedAt: new Date().toISOString(),
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      heroHealth: 0,
      outcome: 'dead',
      stats: {
        damageDealt: 0,
        damageTaken: 5,
        enemiesDefeated: 0,
        steps: 10,
        byKind: {},
      },
      mapData: {
        tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
        subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
      },
    };
    window.localStorage.setItem('lastGame', JSON.stringify(lastGame));

    render(<DailyCompleted data={mockData} />);

    expect(screen.queryByText(/Reached Level/)).not.toBeInTheDocument();
    // Also no "Level" in the stats box (only "Level" text comes from currentFloor)
    expect(screen.queryByText(/^Level \d+$/)).not.toBeInTheDocument();
  });

  test('enemy kills are displayed as grouped icons with x{count} format', () => {
    const lastGame = {
      completedAt: new Date().toISOString(),
      hasKey: false,
      hasExitKey: false,
      hasSword: true,
      hasShield: true,
      heroHealth: 0,
      outcome: 'dead',
      currentFloor: 3,
      stats: {
        damageDealt: 20,
        damageTaken: 10,
        enemiesDefeated: 7,
        steps: 200,
        byKind: { 'fire-goblin': 4, 'water-goblin': 3 },
      },
      mapData: {
        tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
        subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
      },
    };
    window.localStorage.setItem('lastGame', JSON.stringify(lastGame));

    render(<DailyCompleted data={mockData} />);

    // Should show "x4" and "x3" for grouped counts
    expect(screen.getByText('x4')).toBeInTheDocument();
    expect(screen.getByText('x3')).toBeInTheDocument();
  });
});
