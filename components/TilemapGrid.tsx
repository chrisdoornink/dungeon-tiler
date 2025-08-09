import React, { useState, useEffect } from 'react';
import { TileType, GameState, Direction, movePlayer, initializeGameState, findPlayerPosition, TileSubtype } from '../lib/map';
import { Tile } from './Tile';

// Grid configuration constants
const GRID_WIDTH = 25;
const GRID_HEIGHT = 25;

interface TilemapGridProps {
  tilemap?: number[][];
  tileTypes: Record<number, TileType>;
  subtypes?: number[][];
  initialGameState?: GameState;
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({ tilemap, tileTypes, subtypes, initialGameState }) => {
  // Initialize game state
  const [gameState, setGameState] = useState<GameState>(() => {
    if (initialGameState) {
      return initialGameState;
    } else if (tilemap) {
      // Create a new game state with the provided tilemap and subtypes
      return {
        hasKey: false,
        mapData: {
          tiles: tilemap,
          subtypes: subtypes || Array(GRID_HEIGHT).fill(0).map(() => Array(GRID_WIDTH).fill(0))
        }
      };
    } else {
      // If no tilemap provided, generate a new game state
      return initializeGameState();
    }
  });

  // Track inventory
  const [inventory, setInventory] = useState<number[]>([]);

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      let direction: Direction | null = null;
      
      switch (event.key) {
        case 'ArrowUp':
          direction = Direction.UP;
          break;
        case 'ArrowRight':
          direction = Direction.RIGHT;
          break;
        case 'ArrowDown':
          direction = Direction.DOWN;
          break;
        case 'ArrowLeft':
          direction = Direction.LEFT;
          break;
      }
      
      if (direction !== null) {
        // Get current subtype at player position before moving
        const playerPosition = findPlayerPosition(gameState.mapData);
        const newGameState = movePlayer(gameState, direction);
        
        // Check if player picked up a key or other item
        if (playerPosition) {
          const [oldY, oldX] = playerPosition;
          const newPosition = findPlayerPosition(newGameState.mapData);
          
          if (newPosition) {
            const [newY, newX] = newPosition;
            
            // If position changed and player had a key now, they must have picked it up
            if ((newY !== oldY || newX !== oldX) && newGameState.hasKey && !gameState.hasKey) {
              // Add key to inventory
              setInventory(prev => [...prev, TileSubtype.KEY]);
            }
          }
        }
        
        setGameState(newGameState);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameState]);
  
  return (
    <div className="flex flex-col items-center w-full">
      <div 
        className="flex justify-center w-full"
        data-testid="tilemap-grid-wrapper"
      >
        <div 
          className="border border-gray-300 rounded-md p-2 shadow-md max-w-full overflow-auto grid gap-1"
          data-testid="tilemap-grid-container"
          style={{ gridTemplateColumns: `repeat(${GRID_WIDTH}, 1fr)` }}
          tabIndex={0} // Make div focusable for keyboard events
        >
          {renderTileGrid(gameState.mapData.tiles, tileTypes, gameState.mapData.subtypes)}
        </div>
      </div>
      
      {inventory.length > 0 && (
        <div className="mt-4 p-3 border border-gray-300 rounded-md">
          <h3 className="font-medium mb-2">Inventory:</h3>
          <div className="flex gap-2">
            {inventory.map((item, index) => (
              <div 
                key={index}
                className="p-2 bg-yellow-100 border border-yellow-400 rounded-md"
              >
                {item === TileSubtype.KEY ? 'Key 🔑' : `Item ${item}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Render the grid of tiles
function renderTileGrid(grid: number[][], tileTypes: Record<number, TileType>, subtypes: number[][] | undefined) {
  return grid.flatMap((row, rowIndex) => 
    row.map((tileId, colIndex) => {
      const tileType = tileTypes[tileId];
      const subtype = subtypes && subtypes[rowIndex] ? subtypes[rowIndex][colIndex] : 0;
      return (
        <div key={`${rowIndex}-${colIndex}`}>
          <Tile 
            tileId={tileId}
            tileType={tileType}
            subtype={subtype}
          />
        </div>
      );
    })
  );
}

// Function removed since we're now using GameState
