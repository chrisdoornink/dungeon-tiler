import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tile } from '../../components/Tile';
import { TileSubtype } from '../../lib/map';

/**
 * Expectations for wall torch rendering:
 * - Renders a torch element with data-testid="wall-torch"
 * - Has a data-duration-ms attribute randomized between 200 and 300 inclusive
 * - Lives on a wall tile (tileId=1) and is visible
 */

describe('Wall Torch rendering', () => {
  it('renders a wall torch as a static sprite without animation attributes', () => {
    const mockWall = { id: 1, name: 'wall', color: '#333', walkable: false };

    render(
      <Tile
        tileId={1}
        tileType={mockWall}
        isVisible={true}
        neighbors={{ top: 1, right: 0, bottom: 0, left: 1 }}
        subtype={[TileSubtype.WALL_TORCH] as unknown as number[]}
      />
    );

    const torch = screen.getByTestId('wall-torch');
    expect(torch).toBeInTheDocument();
    // No animation metadata should be present
    expect(torch.getAttribute('data-duration-ms')).toBeNull();
    expect(torch.getAttribute('data-frame')).toBeNull();
  });
});
