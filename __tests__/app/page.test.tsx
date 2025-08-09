import React from 'react';
import { render } from '@testing-library/react';
import Home from '../../app/page';
import * as mapModule from '../../lib/map';

// Mock the map module
jest.mock('../../lib/map', () => ({
  ...jest.requireActual('../../lib/map'),
  generateMap: jest.fn(),
  generateCompleteMap: jest.fn(),
  initializeGameState: jest.fn(),
  findPlayerPosition: jest.fn(),
  movePlayer: jest.fn(),
  TileSubtype: {
    NONE: 0,
    EXIT: 1,
    DOOR: 2,
    KEY: 3,
    LOCK: 4,
    PLAYER: 5
  },
  Direction: {
    UP: 0,
    RIGHT: 1,
    DOWN: 2,
    LEFT: 3
  },
  tileTypes: {
    0: { id: 0, name: 'Floor', color: 'gray' },
    1: { id: 1, name: 'Wall', color: 'brown' }
  }
}));

describe('Home Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation returns a small test grid
    const mockGrid = Array(25).fill(0).map(() => Array(25).fill(0));
    const mockSubtypes = Array(25).fill(0).map(() => Array(25).fill(0));
    
    // Place a player in the mock data
    mockSubtypes[12][12] = mapModule.TileSubtype.PLAYER;
    
    // Mock return values
    (mapModule.generateMap as jest.Mock).mockReturnValue(mockGrid);
    (mapModule.generateCompleteMap as jest.Mock).mockReturnValue({
      tiles: mockGrid,
      subtypes: mockSubtypes
    });
    
    // Mock game state initialization
    (mapModule.initializeGameState as jest.Mock).mockReturnValue({
      hasKey: false,
      mapData: {
        tiles: mockGrid,
        subtypes: mockSubtypes
      }
    });
    
    // Mock player position finding
    (mapModule.findPlayerPosition as jest.Mock).mockReturnValue([12, 12]);
    
    // Mock player movement
    (mapModule.movePlayer as jest.Mock).mockImplementation((gameState) => {
      return gameState; // Simply return same state in tests
    });
  });
  
  it('should use generateCompleteMap by default', () => {
    render(<Home />);
    expect(mapModule.generateCompleteMap).toHaveBeenCalled();
    expect(mapModule.generateMap).not.toHaveBeenCalled();
  });

  it('should use generateMap when algorithm is set to default', () => {
    render(<Home algorithm="default" />);
    expect(mapModule.generateMap).toHaveBeenCalled();
    expect(mapModule.generateCompleteMap).not.toHaveBeenCalled();
  });
});
