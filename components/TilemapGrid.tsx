import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TileType,
  GameState,
  Direction,
  movePlayer,
  TileSubtype,
} from "../lib/map";
import { Tile } from "./Tile";
import styles from "./TilemapGrid.module.css";

// Grid configuration constants
const GRID_WIDTH = 25;
const GRID_HEIGHT = 25;

interface TilemapGridProps {
  tilemap?: number[][];
  tileTypes: Record<number, TileType>;
  subtypes?: number[][][];
  initialGameState?: GameState;
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({
  tilemap,
  tileTypes,
  subtypes,
  initialGameState,
}) => {
  const router = useRouter();

  // Initialize game state
  const [gameState, setGameState] = useState<GameState>(() => {
    if (initialGameState) {
      return initialGameState;
    } else if (tilemap) {
      // Create a new game state with the provided tilemap and subtypes
      return {
        hasKey: false,
        hasExitKey: false,
        mapData: {
          tiles: tilemap,
          subtypes:
            subtypes ||
            Array(GRID_HEIGHT)
              .fill(0)
              .map(() =>
                Array(GRID_WIDTH)
                  .fill(0)
                  .map(() => [])
              ),
        },
        showFullMap: false,
        win: false,
        playerDirection: Direction.DOWN, // Default to facing down/front
      };
    } else {
      throw new Error("Either initialGameState or tilemap must be provided");
    }
  });

  // Find player position in the grid
  const [playerPosition, setPlayerPosition] = useState<[number, number] | null>(null);
  // Add state to track if player is currently moving
  const [isMoving, setIsMoving] = useState<boolean>(false);
  // Store the previous game state for smooth transitions
  const [prevGameState, setPrevGameState] = useState<GameState | null>(null);
  
  useEffect(() => {
    // Find player position whenever gameState changes
    if (gameState.mapData.subtypes) {
      // If we have a previous state and the player has moved
      if (prevGameState && !isMoving) {
        // Set moving flag to true
        setIsMoving(true);
        
        // Delay updating the player position to match the grid transition
        setTimeout(() => {
          // Find new player position
          for (let y = 0; y < gameState.mapData.subtypes.length; y++) {
            for (let x = 0; x < gameState.mapData.subtypes[y].length; x++) {
              if (gameState.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) {
                setPlayerPosition([y, x]);
                // Reset moving flag
                setIsMoving(false);
                return;
              }
            }
          }
          setPlayerPosition(null);
          setIsMoving(false);
        }, 150); // Half of the CSS transition time for a smooth effect
      } else if (!prevGameState) {
        // Initial load - set position immediately
        for (let y = 0; y < gameState.mapData.subtypes.length; y++) {
          for (let x = 0; x < gameState.mapData.subtypes[y].length; x++) {
            if (gameState.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) {
              setPlayerPosition([y, x]);
              return;
            }
          }
        }
        setPlayerPosition(null);
      }
      
      // Update previous game state
      setPrevGameState(gameState);
    }
  }, [gameState, prevGameState, isMoving]);

  // Inventory is derived from gameState flags (hasKey, hasExitKey)

  // Auto-disable full map visibility after 3 seconds
  useEffect(() => {
    if (gameState.showFullMap) {
      // Auto-disable after 3 seconds
      const timer = setTimeout(() => {
        setGameState((prev) => ({ ...prev, showFullMap: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.showFullMap]);

  // Redirect to end page and persist game snapshot on win
  useEffect(() => {
    if (gameState.win) {
      try {
        const payload = {
          completedAt: new Date().toISOString(),
          hasKey: gameState.hasKey,
          hasExitKey: gameState.hasExitKey,
          mapData: gameState.mapData,
        };
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("lastGame", JSON.stringify(payload));
        }
      } catch {
        // no-op – storage may be unavailable in some environments
      }
      router.push("/end");
    }
  }, [
    gameState.win,
    gameState.hasKey,
    gameState.hasExitKey,
    gameState.mapData,
    router,
  ]);

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      let direction: Direction | null = null;

      switch (event.key) {
        case "ArrowUp":
          direction = Direction.UP;
          break;
        case "ArrowRight":
          direction = Direction.RIGHT;
          break;
        case "ArrowDown":
          direction = Direction.DOWN;
          break;
        case "ArrowLeft":
          direction = Direction.LEFT;
          break;
      }

      if (direction !== null) {
        const newGameState = movePlayer(gameState, direction);

        setGameState(newGameState);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [gameState]);

  return (
    <div className="relative" data-testid="tilemap-grid-wrapper">
      {/* Fixed inventory at top right */}
      {(gameState.hasKey ||
        gameState.hasExitKey ||
        gameState.hasSword ||
        gameState.hasShield) && (
        <div className="absolute top-2 right-2 z-10 p-2 bg-[#1B1B1B] rounded-md shadow-md" style={{ maxWidth: '200px' }}>
          <h3 className="text-xs font-medium mb-1 text-white">Inventory:</h3>
          <div className="flex flex-wrap gap-1">
            {gameState.hasKey && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Key 🔑
              </div>
            )}
            {gameState.hasExitKey && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Exit Key 🗝️
              </div>
            )}
            {gameState.hasSword && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Sword 🗡️
              </div>
            )}
            {gameState.hasShield && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Shield 🛡️
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Centered map container */}
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <div 
          className={styles.viewportContainer}
          data-testid="tilemap-grid-container" 
          style={{
            gridTemplateColumns: process.env.NODE_ENV === 'test' ? 'repeat(25, 1fr)' : undefined
          }}
        >
          <div
            className={styles.mapContainer}
            style={{ transform: playerPosition ? `translate(${calculateMapTransform(playerPosition)})` : 'none' }}
          >
            <div
              className={styles.gridContainer}
              style={{
                gridTemplateRows: `repeat(${GRID_HEIGHT}, 40px)`,
                gridTemplateColumns: `repeat(${GRID_WIDTH}, 40px)`,
              }}
              tabIndex={0} // Make div focusable for keyboard events
            >
              {renderTileGrid(
                gameState.mapData.tiles,
                tileTypes,
                gameState.mapData.subtypes,
                gameState.showFullMap,
                gameState.playerDirection
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Calculate visibility based on player position
function calculateVisibility(
  grid: number[][],
  playerPosition: [number, number] | null,
  showFullMap: boolean = false
): number[][] {
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  // If showFullMap is true or no player, everything is visible
  if (showFullMap || !playerPosition) {
    return Array(gridHeight)
      .fill(0)
      .map(() => Array(gridWidth).fill(3));
  }

  // Create a grid of false values (not visible)
  const visibility: number[][] = Array(gridHeight)
    .fill(0)
    .map(() => Array(gridWidth).fill(0));

  const [playerY, playerX] = playerPosition;

  // Full-visibility radius
  const fullRadius = 4;

  // Set visibility for all tiles in range
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      // Use Euclidean distance for circular FOV
      const dy = y - playerY;
      const dx = x - playerX;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Tiered visibility:
      // 3: d <= 4 (full)
      // 2: 4 < d <= 5 (mid)
      // 1: 5 < d <= 6 (low)
      // 0: d > 6 (invisible)
      let tier = 0;
      if (d <= fullRadius) tier = 3;
      else if (d <= fullRadius + 1) tier = 2;
      else if (d <= fullRadius + 2) tier = 1;
      else tier = 0;

      visibility[y][x] = tier;
    }
  }

  return visibility;
}

// Render the grid of tiles
function renderTileGrid(
  grid: number[][],
  tileTypes: Record<number, TileType>,
  subtypes: number[][][] | undefined,
  showFullMap: boolean = false,
  playerDirection: Direction = Direction.DOWN
) {
  // Find player position in the grid
  let playerPosition: [number, number] | null = null;

  if (subtypes) {
    for (let y = 0; y < subtypes.length; y++) {
      for (let x = 0; x < subtypes[y].length; x++) {
        if (subtypes[y][x].includes(TileSubtype.PLAYER)) {
          playerPosition = [y, x];
          break;
        }
      }
      if (playerPosition) break;
    }
  }

  // Calculate visibility for each tile
  const visibility = calculateVisibility(grid, playerPosition, showFullMap);

  // Function to safely get a tile ID at specific coordinates
  const getTileAt = (row: number, col: number): number | null => {
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
      return null; // Out of bounds
    }
    return grid[row][col];
  };

  const tiles = grid.flatMap((row, rowIndex) =>
    row.map((tileId, colIndex) => {
      const tileType = tileTypes[tileId];
      const subtype =
        subtypes && subtypes[rowIndex] ? subtypes[rowIndex][colIndex] : [];
      const tier = visibility[rowIndex][colIndex];
      const isVisible = tier > 0;

      // Get neighboring tiles
      const neighbors = {
        top: getTileAt(rowIndex - 1, colIndex),
        right: getTileAt(rowIndex, colIndex + 1),
        bottom: getTileAt(rowIndex + 1, colIndex),
        left: getTileAt(rowIndex, colIndex - 1),
      };

      // Check if this is the player tile to pass the playerDirection prop
      const isPlayerTile = subtype && subtype.includes(TileSubtype.PLAYER);
      
      return (
        <div key={`${rowIndex}-${colIndex}`} className={`relative ${styles.tileWrapper}`}>
          <Tile
            tileId={tileId}
            tileType={tileType}
            subtype={subtype}
            isVisible={isVisible}
            visibilityTier={tier}
            neighbors={neighbors}
            playerDirection={isPlayerTile ? playerDirection : undefined}
          />
        </div>
      );
    })
  );

  // Add a smooth radial gradient overlay centered on the player for continuous fade
  if (playerPosition && !showFullMap) {
    const [py, px] = playerPosition; // grid coords
    const tileSize = 40; // px (w-10/h-10)
    const centerX = (px + 0.5) * tileSize;
    const centerY = (py + 0.5) * tileSize;
    // Stronger, darker fade pulled slightly inward
    const r0 = 3.8 * tileSize; // inner safe
    const r1 = 4.4 * tileSize; // begin fade
    const r2 = 5.0 * tileSize; // mid fade
    const r3 = 5.6 * tileSize; // stronger fade
    const r4 = 6.2 * tileSize; // near dark
    const r5 = 7.0 * tileSize; // full dark

    // Warm torch glow radii (expanded for more dramatic effect)
    const t0 = 2.5 * tileSize; // bright core (larger)
    const t1 = 3.8 * tileSize; // warm mid (expanded)
    const t2 = 5.2 * tileSize; // outer falloff (expanded)
    const t3 = 6.5 * tileSize; // outer glow
    const t4 = 7.5 * tileSize; // transparent edge (much larger)

    const torchGradient = `radial-gradient(circle at ${centerX}px ${centerY}px,
      var(--torch-core) ${t0}px,
      var(--torch-mid) ${t1}px,
      var(--torch-falloff) ${t2}px,
      var(--torch-outer) ${t3}px,
      rgba(0,0,0,0) ${t4}px
    )`;

    const gradient = `radial-gradient(circle at ${centerX}px ${centerY}px,
      rgba(26,26,26,0) ${r0}px,
      rgba(26,26,26,0.25) ${r1}px,
      rgba(26,26,26,0.50) ${r2}px,
      rgba(26,26,26,0.75) ${r3}px,
      rgba(26,26,26,0.90) ${r4}px,
      rgba(26,26,26,1) ${r5}px
    )`;

    // Push the warm torch glow first (lower z), then the dark vignette (higher z)
    tiles.push(
      <div
        key="torch-glow"
        className={`${styles.torchGlow}`}
        style={{ backgroundImage: torchGradient, zIndex: 9000 }}
      />
    );

    tiles.push(
      <div
        key="fov-radial-overlay"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: gradient, zIndex: 10000 }}
      />
    );
  }

  return tiles;
}

// Function removed since we're now using GameState

// Calculate the transform to center the map on the player
function calculateMapTransform(playerPosition: [number, number]): string {
  if (!playerPosition) return '0px, 0px';
  
  const tileSize = 40; // px
  const viewportWidth = 600; // px (from CSS)
  const viewportHeight = 600; // px (from CSS)
  
  // Calculate the center position of the player in pixels
  const playerX = (playerPosition[1] + 0.5) * tileSize;
  const playerY = (playerPosition[0] + 0.5) * tileSize;
  
  // Calculate the transform to center the player in the viewport
  const translateX = (viewportWidth / 2) - playerX;
  const translateY = (viewportHeight / 2) - playerY;
  
  return `${translateX}px, ${translateY}px`;
}
