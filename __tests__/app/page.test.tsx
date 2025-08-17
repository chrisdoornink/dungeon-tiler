import React from 'react';
import { render } from '@testing-library/react';
import Home from '../../app/page';
const useSearchParamsMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => useSearchParamsMock(),
}));
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
    // default: no algorithm query param
    useSearchParamsMock.mockReturnValue({ get: () => null });
    
    // Default mock implementation returns a small test grid
    const mockGrid = Array(25).fill(0).map(() => Array(25).fill(0));
    const mockSubtypes = Array(25).fill(0).map(() => 
      Array(25).fill(0).map(() => [] as number[])
    );
    
    // Place a player in the mock data
    mockSubtypes[12][12] = [mapModule.TileSubtype.PLAYER];
    
    // Mock return values
    (mapModule.generateMap as jest.Mock).mockReturnValue(mockGrid);
    (mapModule.generateCompleteMap as jest.Mock).mockReturnValue({
      tiles: mockGrid,
      subtypes: mockSubtypes
    });
    
    // Mock game state initialization
    (mapModule.initializeGameState as jest.Mock).mockReturnValue({
      hasKey: false,
      hasExitKey: false,
      mapData: {
        tiles: mockGrid,
        subtypes: mockSubtypes
      },
      showFullMap: false,
      win: false,
      playerDirection: 2,
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0 },
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
    useSearchParamsMock.mockReturnValue({ get: (k: string) => (k === 'algorithm' ? 'default' : null) });
    render(<Home />);
    expect(mapModule.generateMap).toHaveBeenCalled();
    expect(mapModule.generateCompleteMap).not.toHaveBeenCalled();
  });
});
