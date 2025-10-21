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

  describe('inventory display', () => {
    it('shows full inventory with text when 2 or fewer items', () => {
      const size = 25;
      const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
      const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
      subtypes[12][12] = [TileSubtype.PLAYER];

      const initialGameState: GameState = {
        hasKey: true,
        hasExitKey: false,
        mapData: { tiles, subtypes },
        showFullMap: false,
        win: false,
        playerDirection: Direction.DOWN,
        heroHealth: 5,
        heroAttack: 1,
        rockCount: 5,
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

      // Should show text labels in non-compact mode
      expect(screen.getByText('Key')).toBeInTheDocument();
      expect(screen.getByText(/Rock x5/)).toBeInTheDocument();
    });

    it('shows compact inventory with badges when more than 2 items', () => {
      const size = 25;
      const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
      const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
      subtypes[12][12] = [TileSubtype.PLAYER];

      const initialGameState: GameState = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        mapData: { tiles, subtypes },
        showFullMap: false,
        win: false,
        playerDirection: Direction.DOWN,
        heroHealth: 5,
        heroAttack: 1,
        rockCount: 13,
        foodCount: 4,
        potionCount: 1,
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

      // In compact mode, text labels should not be visible (except in tooltips)
      expect(screen.queryByText('Key')).not.toBeInTheDocument();
      expect(screen.queryByText('Exit Key')).not.toBeInTheDocument();
      expect(screen.queryByText('Sword')).not.toBeInTheDocument();
      
      // Count badges should be visible for items with quantities
      expect(screen.getByText('13')).toBeInTheDocument(); // rock count
      expect(screen.getByText('4')).toBeInTheDocument(); // food count
      expect(screen.getByText('1')).toBeInTheDocument(); // potion count
    });

    it('switches from normal to compact mode when crossing threshold', () => {
      const size = 25;
      const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
      const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
      const r = 10, c = 10;
      subtypes[r][c] = [TileSubtype.PLAYER];
      subtypes[r][c+1] = [TileSubtype.ROCK];
      subtypes[r][c+2] = [TileSubtype.ROCK];

      const initialGameState: GameState = {
        hasKey: true,
        hasExitKey: true,
        mapData: { tiles, subtypes },
        showFullMap: false,
        win: false,
        playerDirection: Direction.RIGHT,
        heroHealth: 5,
        heroAttack: 1,
        rockCount: 0,
        stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      };

      const { rerender } = render(
        <TilemapGrid
          tilemap={tiles}
          tileTypes={mockTileTypes}
          subtypes={subtypes}
          initialGameState={initialGameState}
        />
      );

      // With 2 items, should show text labels
      expect(screen.getByText('Key')).toBeInTheDocument();
      expect(screen.getByText('Exit Key')).toBeInTheDocument();

      // Pick up rocks to get 3rd item
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // After picking up rock, should switch to compact mode
      expect(screen.queryByText('Key')).not.toBeInTheDocument();
      expect(screen.queryByText('Exit Key')).not.toBeInTheDocument();
    });

    it('displays inventory items with proper tooltips in compact mode', () => {
      const size = 25;
      const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
      const subtypes = Array(size).fill(0).map(() => Array(size).fill(0).map(() => [] as number[]));
      subtypes[12][12] = [TileSubtype.PLAYER];

      const initialGameState: GameState = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: true,
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

      // Check tooltips exist for items
      const keyItem = screen.getByTitle('Key');
      expect(keyItem).toBeInTheDocument();
      
      const exitKeyItem = screen.getByTitle('Exit Key');
      expect(exitKeyItem).toBeInTheDocument();
      
      const swordItem = screen.getByTitle('Sword');
      expect(swordItem).toBeInTheDocument();
      
      const shieldItem = screen.getByTitle('Shield');
      expect(shieldItem).toBeInTheDocument();
    });
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
      expect(text.textContent ?? '').toMatch(/There will be much excitement when they hear you've returned\./);

      // Advance to line 3 and skip
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Enter' });
      act(() => {
        jest.runAllTimers();
      });
      expect(text.textContent ?? '').toMatch(/It was a long climb/);

      // Finalize: advance until overlay closes (guard against timing/typewriter state)
      for (let i = 0; i < 6; i++) {
        if (!screen.queryByTestId('dialogue-overlay')) break;
        fireEvent.keyDown(window, { key: 'Enter' });
        act(() => {
          jest.runAllTimers();
        });
      }
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
            payload: { dialogueId: 'caretaker-lysa-intro' },
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

      // Advance through lines until the choices appear (cap iterations to avoid infinite loop)
      let listbox: HTMLElement | null = null;
      for (let i = 0; i < 12; i++) {
        listbox = screen.queryByRole('listbox', { name: 'Responses' });
        if (listbox) break;
        fireEvent.keyDown(window, { key: 'Enter' });
        act(() => {
          jest.runAllTimers();
        });
      }

      expect(listbox).toBeTruthy();
      const options = within(listbox as HTMLElement).getAllByRole('button');
      expect(options.length).toBeGreaterThan(0);
      // Option labels changed; ensure at least one expected prompt is present
      expect(options.map(o => o.textContent || '').join(' ')).toMatch(/Where should I go\?|What is this place\?|I'll go check on the boy/);

      // Select the default (first) option
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
      // Response text should match one of the new caretaker responses
      expect(text.textContent ?? '').toMatch(/Just outside of this sanctum|This is the sanctum|Thank you! I'll be here when you return/);
    });
  });
});
