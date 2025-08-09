import React from 'react';
import { render, screen } from '@testing-library/react';
import { Tile } from '../../components/Tile';
import '@testing-library/jest-dom';

describe('Tile component', () => {
  it('should render the tile with correct background color', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} />);
    
    const tile = screen.getByTestId('tile-0');
    expect(tile).toBeInTheDocument();
    expect(tile).toHaveStyle('background-color: #ccc');
  });

  it('should display the tile ID', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(<Tile tileId={1} tileType={mockTileType} />);
    
    const tile = screen.getByTestId('tile-1');
    expect(tile).toHaveTextContent('1');
  });

  it('should display tile ID and subtype when subtype is provided', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} subtype={1} />);
    
    const tile = screen.getByTestId('tile-0');
    expect(tile).toHaveTextContent('0:1');
  });

  it('should display only tile ID when subtype is 0', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(<Tile tileId={1} tileType={mockTileType} subtype={0} />);
    
    const tile = screen.getByTestId('tile-1');
    expect(tile).toHaveTextContent('1');
  });
});
