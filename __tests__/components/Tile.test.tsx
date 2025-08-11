import React from 'react';
import { render, screen } from '@testing-library/react';
import { Tile } from '../../components/Tile';
import '@testing-library/jest-dom';
import { TileSubtype } from '../../lib/map';

describe('Tile component', () => {
  it('should render the tile with correct background color', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} />);
    
    const tile = screen.getByTestId('tile-0');
    expect(tile).toBeInTheDocument();
    expect(tile).toHaveStyle('background-color: #c8c8c8');
  });

  it('adds an exaggerated bottom border and base shadow on walls when there is a floor below (forced perspective)', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(
      <Tile
        tileId={1}
        tileType={mockTileType}
        isVisible={true}
        neighbors={{ top: 1, right: 1, bottom: 0, left: 1 }}
      />
    );
    const tile = screen.getByTestId('tile-1');
    expect(tile).toBeInTheDocument();
    expect(tile.className).toContain('border-b-8');
    expect(screen.getByTestId('wall-base-shadow')).toBeInTheDocument();
  });

  it('does not add thicker bottom border when the tile below is also a wall (no perspective needed)', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(
      <Tile
        tileId={1}
        tileType={mockTileType}
        isVisible={true}
        neighbors={{ top: 1, right: 1, bottom: 1, left: 1 }}
      />
    );
    const tile = screen.getByTestId('tile-1');
    expect(tile).toBeInTheDocument();
    expect(tile.className).not.toContain('border-b-8');
    expect(screen.queryByTestId('wall-base-shadow')).toBeNull();
  });

  it('should not display content for tile with no subtype', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(<Tile tileId={1} tileType={mockTileType} />);
    
    const tile = screen.getByTestId('tile-1');
    expect(tile).not.toHaveTextContent(/\d/);
  });

  it('should display subtype name when subtype is provided', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} subtype={[1]} />);
    
    const tile = screen.getByTestId('tile-0');
    expect(tile).toHaveTextContent('EXIT');
  });

  it('should not display content when subtype is empty array', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(<Tile tileId={1} tileType={mockTileType} subtype={[]} />);
    
    const tile = screen.getByTestId('tile-1');
    expect(tile).not.toHaveTextContent(/\d/);
  });
});
