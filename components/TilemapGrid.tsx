import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TileType,
  GameState,
  Direction,
  movePlayer,
  initializeGameState,
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
      };
    } else {
      // If no tilemap provided, generate a new game state
      return initializeGameState();
    }
  });

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
    <div className="flex flex-col items-center w-full">
      <div
        className="flex justify-center w-full"
        data-testid="tilemap-grid-wrapper"
      >
        <div
          className="relative border border-gray-300 rounded-md p-2 shadow-md max-w-full overflow-auto grid gap-0"
          data-testid="tilemap-grid-container"
          style={{ gridTemplateColumns: `repeat(${GRID_WIDTH}, 1fr)` }}
          tabIndex={0} // Make div focusable for keyboard events
        >
          {renderTileGrid(
            gameState.mapData.tiles,
            tileTypes,
            gameState.mapData.subtypes,
            gameState.showFullMap
          )}
        </div>
      </div>

      {(gameState.hasKey ||
        gameState.hasExitKey ||
        gameState.hasSword ||
        gameState.hasShield) && (
        <div className="mt-4 p-3 border border-gray-300 rounded-md">
          <h3 className="font-medium mb-2">Inventory:</h3>
          <div className="flex gap-2">
            {gameState.hasKey && (
              <div className="p-2 bg-yellow-100 border border-yellow-400 rounded-md">
                Key 🔑
              </div>
            )}
            {gameState.hasExitKey && (
              <div className="p-2 bg-indigo-100 border border-indigo-400 rounded-md">
                Exit Key 🗝️
              </div>
            )}
            {gameState.hasSword && (
              <div className="p-2 bg-red-100 border border-red-400 rounded-md">
                Sword 🗡️
              </div>
            )}
            {gameState.hasShield && (
              <div className="p-2 bg-blue-100 border border-blue-400 rounded-md">
                Shield 🛡️
              </div>
            )}
          </div>
        </div>
      )}
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
  showFullMap: boolean = false
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

      return (
        <div key={`${rowIndex}-${colIndex}`} className="relative">
          <Tile
            tileId={tileId}
            tileType={tileType}
            subtype={subtype}
            isVisible={isVisible}
            visibilityTier={tier}
            neighbors={neighbors}
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
