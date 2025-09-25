import React from 'react';
import { render, screen, act, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));
import { TilemapGrid } from '../../components/TilemapGrid';
import { TileSubtype, GameState, Direction } from '../../lib/map';
import { NPC } from '../../lib/npc';
import '@testing-library/jest-dom';

describe('TilemapGrid component', () => {
  const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  afterAll(() => {
    infoSpy.mockRestore();
  });

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

  it('shows diagonals at tier-1 visibility when the hero torch is snuffed', () => {
    // Arrange: 25x25 floor with PLAYER at center and torch unlit
    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
    const c = Math.floor(size / 2);
    subtypes[c][c] = [TileSubtype.PLAYER];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      heroTorchLit: false,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
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

    // Center tile uses the snuffed core styling when the torch is out
    expect(allTiles[idx(c, c)]).toHaveClass('fov-tier-snuff-core');
    // Orthogonal neighbors are still faintly visible via snuffed ring styling
    expect(allTiles[idx(c, c + 1)]).toHaveClass('fov-tier-snuff-ring');
    // Diagonal neighbors also get the snuffed ring styling
    expect(allTiles[idx(c + 1, c + 1)]).toHaveClass('fov-tier-snuff-ring');
    // A tile two steps away should remain black
    expect(allTiles[idx(c + 2, c + 2)]).toHaveClass('bg-gray-900');
  });

  it('defaults to daylight (full visibility) when NODE_ENV is not test', () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      // Force environment to production for this test
      (process.env as unknown as { NODE_ENV: string }).NODE_ENV = 'production';

      const size = 25;
      const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
      const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
      subtypes[2][2] = [TileSubtype.PLAYER];

      render(
        <TilemapGrid
          tilemap={tiles}
          tileTypes={mockTileTypes}
          subtypes={subtypes}
        />
      );

      const allTiles = screen.getAllByTestId(/^tile-/);
      // Pick a far-away tile; in daylight it should not be black
      const far = allTiles[0]; // (0,0)
      expect(far).not.toHaveClass('bg-gray-900');
    } finally {
      (process.env as unknown as { NODE_ENV: string }).NODE_ENV = prevEnv as string;
    }
  });

  it('increments streak on consecutive wins', () => {
    // Arrange: simulate prior lastGame with streak: 2
    window.localStorage.setItem('lastGame', JSON.stringify({ streak: 2 }));

    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
    const r = 10, c = 10;
    // Player -> ExitKey -> Exit
    subtypes[r][c] = [TileSubtype.PLAYER];
    subtypes[r][c+1] = [TileSubtype.EXITKEY];
    tiles[r][c+2] = 1; // wall for EXIT
    subtypes[r][c+2] = [TileSubtype.EXIT];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    };

    // Act
    render(
      <TilemapGrid
        tilemap={tiles}
        tileTypes={mockTileTypes}
        subtypes={subtypes}
        initialGameState={initialGameState}
      />
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // pick up exit key
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // open and exit -> win

    // Assert new streak increased by at least 1 (StrictMode may double-invoke effects)
    const raw = window.localStorage.getItem('lastGame');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.outcome).toBe('win');
    expect(parsed.streak).toBeGreaterThanOrEqual(3);
  });

  it('resets streak to 0 on death', () => {
    // Arrange: prior streak exists
    window.localStorage.setItem('lastGame', JSON.stringify({ streak: 5 }));

    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
    subtypes[12][12] = [TileSubtype.PLAYER];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
      heroHealth: 0, // triggers death effect immediately
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    };

    // Act
    render(
      <TilemapGrid
        tilemap={tiles}
        tileTypes={mockTileTypes}
        subtypes={subtypes}
        initialGameState={initialGameState}
      />
    );

    // Assert localStorage has streak reset
    const raw = window.localStorage.getItem('lastGame');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.outcome).toBe('dead');
    expect(parsed.streak).toBe(0);
  });

    // moved tiles length assertion above

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
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
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

    // Assert localStorage contains lastGame payload
    const raw = window.localStorage.getItem('lastGame');
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
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    };

    // Clear prior mocks/payloads
    pushMock.mockClear();
    window.localStorage.removeItem('lastGame');

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
    expect(window.localStorage.getItem('lastGame')).toBeNull();
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
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
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
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
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

  describe('dialogue overlay', () => {
    const makeBaseState = (): {
      tiles: number[][];
      subtypes: number[][][];
      npc: NPC;
      gameState: GameState;
    } => {
      const size = 7;
      const tiles = Array(size)
        .fill(0)
        .map(() => Array(size).fill(0));
      const subtypes = Array(size)
        .fill(0)
        .map(() => Array(size).fill(0).map(() => [] as number[]));
      const heroY = 3;
      const heroX = 3;
      subtypes[heroY][heroX] = [TileSubtype.PLAYER];

      const npc = new NPC({
        id: 'npc-test',
        name: 'Elder Rowan',
        sprite: '/images/npcs/boy-3.png',
        y: heroY,
        x: heroX + 1,
        facing: Direction.LEFT,
        canMove: false,
        interactionHooks: [
          {
            id: 'elder-rowan-greet',
            type: 'dialogue',
            payload: { dialogueId: 'elder-rowan-intro' },
          },
        ],
      });

      const gameState: GameState = {
        hasKey: false,
        hasExitKey: false,
        mapData: { tiles, subtypes },
        showFullMap: false,
        win: false,
        playerDirection: Direction.RIGHT,
        heroHealth: 5,
        heroAttack: 1,
        stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
        npcs: [npc],
        npcInteractionQueue: [npc.createInteractionEvent('action')],
      };

      return { tiles, subtypes, npc, gameState };
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows dialogue overlay when queue contains a dialogue event', () => {
      jest.useFakeTimers();
      const { tiles, subtypes, gameState } = makeBaseState();
      render(
        <TilemapGrid
          tilemap={tiles}
          tileTypes={mockTileTypes}
          subtypes={subtypes}
          initialGameState={gameState}
        />
      );

      act(() => {
        jest.runOnlyPendingTimers();
      });

      const overlay = screen.getByTestId('dialogue-overlay');
      expect(overlay).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });

      const text = screen.getByTestId('dialogue-text');
      expect(text.textContent ?? '').toMatch(/By the stones—you're alive/);
    });

    it('advances dialogue lines and closes on Enter', () => {
      jest.useFakeTimers();
      const { tiles, subtypes, gameState } = makeBaseState();
      render(
        <TilemapGrid
          tilemap={tiles}
          tileTypes={mockTileTypes}
          subtypes={subtypes}
          initialGameState={gameState}
        />
      );

      act(() => {
        jest.runOnlyPendingTimers();
      });

      const text = screen.getByTestId('dialogue-text');

      // First Enter skips to full line
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });
      expect(text.textContent ?? '').toMatch(/By the stones—you're alive/);

      // Second Enter advances to line 2, third skips it fully
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });
      expect(text.textContent ?? '').toMatch(/Word will fly through town/);

      // Advance to line 3 and skip
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });
      expect(text.textContent ?? '').toMatch(/It was a long climb/);

      // Final Enter closes overlay
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runOnlyPendingTimers();
      });

      expect(screen.queryByTestId('dialogue-overlay')).not.toBeInTheDocument();
    });

    it('supports branching dialogue choices', () => {
      jest.useFakeTimers();
      const size = 7;
      const tiles = Array(size)
        .fill(0)
        .map(() => Array(size).fill(0));
      const subtypes = Array(size)
        .fill(0)
        .map(() => Array(size).fill(0).map(() => [] as number[]));
      const heroY = 3;
      const heroX = 3;
      subtypes[heroY][heroX] = [TileSubtype.PLAYER];

      const npc = new NPC({
        id: 'npc-caretaker',
        name: 'Caretaker Lysa',
        sprite: '/images/npcs/girl-1.png',
        y: heroY,
        x: heroX + 1,
        facing: Direction.LEFT,
        canMove: false,
        interactionHooks: [
          {
            id: 'caretaker-lysa',
            type: 'dialogue',
            payload: { dialogueId: 'caretaker-lysa-overview' },
          },
        ],
      });

      const gameState: GameState = {
        hasKey: false,
        hasExitKey: false,
        mapData: { tiles, subtypes },
        showFullMap: false,
        win: false,
        playerDirection: Direction.RIGHT,
        heroHealth: 5,
        heroAttack: 1,
        stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
        npcs: [npc],
        npcInteractionQueue: [npc.createInteractionEvent('action')],
      };

      render(
        <TilemapGrid
          tilemap={tiles}
          tileTypes={mockTileTypes}
          subtypes={subtypes}
          initialGameState={gameState}
        />
      );

      act(() => {
        jest.runOnlyPendingTimers();
      });

      // Advance through the preamble lines to reach the choice prompt
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });

      const listbox = screen.getByRole('listbox', { name: 'Responses' });
      const options = within(listbox).getAllByRole('button');
      expect(options[0].textContent).toContain('Promise to stay cautious');

      // Select the second option using keyboard navigation
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      fireEvent.keyDown(window, { key: 'Enter' });

      act(() => {
        jest.runAllTimers();
      });

      // Skip the typewriter animation for the response line
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });

      const text = screen.getByTestId('dialogue-text');
      expect(text.textContent ?? '').toMatch(/Tell me what to watch for/);
    });
  });
});
