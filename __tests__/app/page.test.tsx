import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '../../app/page';

describe('Home Component (daily alias)', () => {
  it('renders the Daily page content', async () => {
    render(<Home />);
    // Intro or Available both contain this heading
    const rulesHeading = await screen.findByText(/Daily Challenge Rules/i);
    expect(rulesHeading).toBeInTheDocument();
  });

  it('mounts without triggering map generation logic', () => {
    // Rendering should not depend on map generation here because Home re-exports /daily
    expect(() => render(<Home />)).not.toThrow();
  });
});
