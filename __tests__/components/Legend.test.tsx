import React from 'react';
import { render, screen } from '@testing-library/react';
import { Legend } from '../../components/Legend';
import '@testing-library/jest-dom';

describe('Legend component', () => {
  // Test data
  const mockTileTypes = {
    0: { id: 0, name: 'floor', color: '#ccc', walkable: true },
    1: { id: 1, name: 'wall', color: '#333', walkable: false }
  };

  it('should render the legend title', () => {
    // Arrange
    render(<Legend tileTypes={mockTileTypes} />);
    
    // Assert
    expect(screen.getByText('Legend')).toBeInTheDocument();
  });

  it('should display tile information for each tile type', () => {
    // Arrange
    render(<Legend tileTypes={mockTileTypes} />);
    
    // Assert
    // Check for tile type names and walkability status
    expect(screen.getByText('0: floor (walkable)')).toBeInTheDocument();
    expect(screen.getByText('1: wall (blocked)')).toBeInTheDocument();
  });
});
