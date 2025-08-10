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
      mapData: {
        tiles: Array(5).fill(0).map(() => Array(7).fill(0)),
        subtypes: Array(5).fill(0).map(() => Array(7).fill(0).map(() => [] as number[])),
      },
    };
    window.sessionStorage.setItem('lastGame', JSON.stringify(payload));

    render(<EndPage />);

    expect(screen.getByText('You escaped the dungeon!')).toBeInTheDocument();
    expect(screen.getByText('Completed at MOCK_DATE')).toBeInTheDocument();
    expect(screen.getByText('Had Key')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Had Exit Key')).toBeInTheDocument();
    // One of the "No" entries should be present for exit key
    expect(screen.getAllByText('No').length).toBeGreaterThan(0);
    expect(screen.getByText('Map Size')).toBeInTheDocument();
    expect(screen.getByText('7 x 5')).toBeInTheDocument();
  });
});
