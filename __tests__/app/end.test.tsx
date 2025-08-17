import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EndPage from '../../app/end/page';

describe('End Page', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
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

  it('renders summary from sessionStorage lastGame', () => {
    const payload = {
      completedAt: new Date().toISOString(),
      hasKey: true,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: {
        tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
        subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
      },
    };
    window.sessionStorage.setItem('lastGame', JSON.stringify(payload));

    render(<EndPage />);

    expect(screen.getByText('You escaped the dungeon!')).toBeInTheDocument();
    expect(screen.getByText('Completed at MOCK_DATE')).toBeInTheDocument();
    // Icons-only pickups: 🔑 should be present, 🗝️ absent
    expect(screen.getByText('🔑')).toBeInTheDocument();
    expect(screen.queryByText('🗝️')).not.toBeInTheDocument();
    // No map size rows anymore
    expect(screen.queryByText('Map Size')).not.toBeInTheDocument();
  });
});
