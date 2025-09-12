import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '../../app/page';

// Mock the BlockingPreloader to avoid asset loading in tests
jest.mock('../../components/BlockingPreloader', () => {
  return function MockBlockingPreloader({ onReady }: { onReady: () => void }) {
    React.useEffect(() => {
      onReady();
    }, [onReady]);
    return <div>Assets Ready</div>;
  };
});

describe('Home Component (daily alias)', () => {
  it('renders the Daily page content', async () => {
    render(<Home />);
    // Intro and Available both contain this common heading
    const heading = await screen.findByText(/Daily Dungeon Challenge/i);
    expect(heading).toBeInTheDocument();
  });

  it('mounts without triggering map generation logic', () => {
    // Rendering should not depend on map generation here because Home re-exports /daily
    expect(() => render(<Home />)).not.toThrow();
  });
});
