import React from 'react';
import { render } from '@testing-library/react';
import Home from '../../app/page';
import * as mapModule from '../../lib/map';

// Mock the map module
jest.mock('../../lib/map', () => ({
  ...jest.requireActual('../../lib/map'),
  generateMap: jest.fn(),
  generateMapCenterOut: jest.fn(),
  tileTypes: {
    0: { name: 'Floor', color: 'gray' },
    1: { name: 'Wall', color: 'brown' }
  }
}));

describe('Home Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation returns a small test grid
    const mockGrid = Array(25).fill(0).map(() => Array(25).fill(0));
    (mapModule.generateMap as jest.Mock).mockReturnValue(mockGrid);
    (mapModule.generateMapCenterOut as jest.Mock).mockReturnValue(mockGrid);
  });
  
  it('should use generateMapCenterOut by default', () => {
    render(<Home />);
    expect(mapModule.generateMapCenterOut).toHaveBeenCalled();
    expect(mapModule.generateMap).not.toHaveBeenCalled();
  });

  it('should use generateMap when algorithm is set to default', () => {
    render(<Home algorithm="default" />);
    expect(mapModule.generateMap).toHaveBeenCalled();
    expect(mapModule.generateMapCenterOut).not.toHaveBeenCalled();
  });
});
