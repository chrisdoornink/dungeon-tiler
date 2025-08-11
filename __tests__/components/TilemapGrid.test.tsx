import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));
import { TilemapGrid } from '../../components/TilemapGrid';
import { TileSubtype, GameState } from '../../lib/map';
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

  it('persists lastGame and redirects to /end when win becomes true after opening exit', () => {
    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
    const r = 10, c = 10;
    // Layout: Player at (r,c), EXITKEY at (r,c+1) on floor, EXIT at (r,c+2) as wall
    subtypes[r][c] = [TileSubtype.PLAYER];
    subtypes[r][c+1] = [TileSubtype.EXITKEY];
    tiles[r][c+2] = 1; // wall
    subtypes[r][c+2] = [TileSubtype.EXIT];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
    };

    render(
      <TilemapGrid
        tilemap={tiles}
        tileTypes={mockTileTypes}
        subtypes={subtypes}
        initialGameState={initialGameState}
      />
    );

    // Move right to pick up exit key
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    // Move right again to open exit and step onto it
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    // Assert sessionStorage contains lastGame payload
    const raw = window.sessionStorage.getItem('lastGame');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveProperty('completedAt');
    expect(parsed).toMatchObject({ hasKey: false, hasExitKey: false });
    expect(parsed.mapData).toBeTruthy();

    // Assert redirect
    expect(pushMock).toHaveBeenCalledWith('/end');
  });

  it('does NOT redirect or persist when win remains false after a normal move', () => {
    // Arrange: 25x25 floor map with PLAYER at (10,10); no EXIT interaction
    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
    subtypes[10][10] = [TileSubtype.PLAYER];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
    };

    // Clear prior mocks/payloads
    pushMock.mockClear();
    window.sessionStorage.removeItem('lastGame');

    render(
      <TilemapGrid
        tilemap={tiles}
        tileTypes={mockTileTypes}
        subtypes={subtypes}
        initialGameState={initialGameState}
      />
    );

    // Act: move right onto a normal floor tile (no win condition)
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    // Assert: no redirect and no persisted payload
    expect(pushMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('lastGame')).toBeNull();
  });

  it('should render circular FOV with fading tiers', () => {
    // Arrange: 25x25 floor map with PLAYER at center
    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
    const c = Math.floor(size / 2); // 12
    subtypes[c][c] = [TileSubtype.PLAYER];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
    };

    render(
      <TilemapGrid
        tilemap={tiles}
        tileTypes={mockTileTypes}
        subtypes={subtypes}
        initialGameState={initialGameState}
      />
    );

    const width = 25;
    const idx = (r: number, col: number) => r * width + col;
    const allTiles = screen.getAllByTestId(/^tile-/);

    // Distances from center (Euclidean):
    // d=2 → (c, c+2) should be tier-3 (fully visible)
    expect(allTiles[idx(c, c + 2)]).toHaveClass('fov-tier-3');
    expect(allTiles[idx(c, c + 2)]).not.toHaveClass('bg-gray-900');

    // d=5 → (c+3, c+4) should be tier-2 (mid opacity)
    expect(allTiles[idx(c + 3, c + 4)]).toHaveClass('fov-tier-2');

    // d=6 → (c+6, c) should be tier-1 (low opacity)
    expect(allTiles[idx(c + 6, c)]).toHaveClass('fov-tier-1');

    // d=7 → (c+7, c) should be invisible (tier-0 / black)
    expect(allTiles[idx(c + 7, c)]).toHaveClass('bg-gray-900');
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

  it('should auto-disable full map visibility after 3 seconds', () => {
    jest.useFakeTimers();

    // Arrange: create a 25x25 all-floor map with player at center
    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
    const center = Math.floor(size / 2);
    subtypes[center][center] = [TileSubtype.PLAYER];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: true,
      win: false,
    };

    // Act: render with showFullMap = true
    render(<TilemapGrid tilemap={tiles} tileTypes={mockTileTypes} subtypes={subtypes} initialGameState={initialGameState} />);

    // The first tile corresponds to position (0,0) which should be visible initially (full map)
    const tilesEls = screen.getAllByTestId(/^tile-/);
    const firstTile = tilesEls[0];
    expect(firstTile).not.toHaveClass('bg-gray-900');

    // Advance timers by 3 seconds to expire the lightswitch effect
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    // After timer, far tiles should become invisible (outside player radius)
    const tilesAfter = screen.getAllByTestId(/^tile-/);
    const firstTileAfter = tilesAfter[0];
    expect(firstTileAfter).toHaveClass('bg-gray-900');

    jest.useRealTimers();
  });
});
