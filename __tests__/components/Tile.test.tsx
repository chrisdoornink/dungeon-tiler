import React from 'react';
import { render, screen } from '@testing-library/react';
import { Tile } from '../../components/Tile';
import '@testing-library/jest-dom';

describe('Tile component', () => {
  // First test: Tile should display its tileId
  it('should display the tile ID', () => {
    // Arrange - Set up the test data
    const mockProps = {
      tileId: 1,
      tileType: {
        id: 1,
        name: 'wall',
        color: '#333',
        walkable: false
      },
      rowIndex: 0,
      colIndex: 0
    };
    
    // Act - Render the component with the test data
    render(<Tile {...mockProps} />);
    
    // Assert - Check that the tile ID is displayed
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
