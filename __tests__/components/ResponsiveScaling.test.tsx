import React from 'react';
import { render, screen } from '@testing-library/react';
const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));
import { TilemapGrid } from '../../components/TilemapGrid';

const mockTileTypes = {
  0: { id: 0, name: 'floor', color: '#ccc', walkable: true },
  1: { id: 1, name: 'wall', color: '#333', walkable: false },
};

const makeOpen = (n = 25) => Array.from({ length: n }, () => Array(n).fill(0));
const makeSubs = (n = 25) => Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));

describe('Responsive scaling wrapper', () => {
  it('renders a game-scale wrapper and keeps MobileControls outside of it', () => {
    const tiles = makeOpen(25);
    const subtypes = makeSubs(25);
    subtypes[12][12] = [5]; // TileSubtype.PLAYER numeric match to avoid import

    render(
      <TilemapGrid tilemap={tiles} tileTypes={mockTileTypes} subtypes={subtypes} />
    );

    const scaleWrapper = screen.getByTestId('game-scale');
    const controls = screen.getByTestId('mobile-controls');

    // Both should share the same parent (root wrapper), meaning controls are not nested in scale wrapper
    expect(scaleWrapper.parentElement).toBe(controls.parentElement);
  });
});
