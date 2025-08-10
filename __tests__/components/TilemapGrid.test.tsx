import React from 'react';
import { render, screen } from '@testing-library/react';
import { TilemapGrid } from '../../components/TilemapGrid';
import '@testing-library/jest-dom';

describe('TilemapGrid component', () => {
  // Mock data for testing
  const mockTileTypes = {
    0: { id: 0, name: 'floor', color: '#ccc', walkable: true },
    1: { id: 1, name: 'wall', color: '#333', walkable: false },
  };
  
  // Create a mock tilemap with the required 25x25 dimensions
  const createMockTilemap = (width: number, height: number): number[][] => {
    return Array(height).fill(0).map(() => Array(width).fill(0));
  };
  
  // Create mock subtypes with the required 25x25 dimensions as arrays
  const createMockSubtypes = (width: number, height: number): number[][][] => {
    return Array(height).fill(0).map(() => Array(width).fill(0).map(() => []));
  };

  it('should render a 25x25 grid', () => {
    // Arrange - Create a 25x25 tilemap
    const mockTilemap = createMockTilemap(25, 25);
    
    // Create subtypes
    const mockSubtypes = createMockSubtypes(25, 25);
    
    // Act - Render the component
    render(<TilemapGrid tilemap={mockTilemap} tileTypes={mockTileTypes} subtypes={mockSubtypes} />);
    
    // Assert - Verify the grid has 25x25=625 cells
    const gridContainer = screen.getByTestId('tilemap-grid-container');
    expect(gridContainer).toHaveStyle({
      gridTemplateColumns: 'repeat(25, 1fr)',
    });
    
    // Should have 625 tiles (25x25)
    const tiles = screen.getAllByTestId(/^tile-/);
    expect(tiles).toHaveLength(25 * 25);
  });

  it('should be centered on the page', () => {
    // Arrange
    const mockTilemap = createMockTilemap(25, 25);
    
    // Create subtypes
    const mockSubtypes = createMockSubtypes(25, 25);
    
    // Act
    render(<TilemapGrid tilemap={mockTilemap} tileTypes={mockTileTypes} subtypes={mockSubtypes} />);
    
    // Assert
    const gridWrapper = screen.getByTestId('tilemap-grid-wrapper');
    expect(gridWrapper).toHaveClass('flex justify-center');
  });

  it('should be responsive and fully visible', () => {
    // Arrange
    const mockTilemap = createMockTilemap(25, 25);
    
    // Create subtypes
    const mockSubtypes = createMockSubtypes(25, 25);
    
    // Act
    render(<TilemapGrid tilemap={mockTilemap} tileTypes={mockTileTypes} subtypes={mockSubtypes} />);
    
    // Assert - Check for responsive classes and overflow handling
    const gridContainer = screen.getByTestId('tilemap-grid-container');
    expect(gridContainer).toHaveClass('max-w-full overflow-auto');
  });
});
