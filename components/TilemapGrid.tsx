import React from 'react';
import { TileType } from '../lib/map';
import { Tile } from './Tile';

// Grid configuration constants
const GRID_WIDTH = 25;
const GRID_HEIGHT = 25;

interface TilemapGridProps {
  tilemap: number[][];
  tileTypes: Record<number, TileType>;
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({ tilemap, tileTypes }) => {
  // Ensure the grid is exactly the required size
  const normalizedTilemap = ensureGridSize(tilemap, GRID_WIDTH, GRID_HEIGHT);
  
  return (
    <div 
      className="flex justify-center w-full"
      data-testid="tilemap-grid-wrapper"
    >
      <div 
        className="border border-gray-300 rounded-md p-2 shadow-md max-w-full overflow-auto grid gap-1"
        data-testid="tilemap-grid-container"
        style={{ gridTemplateColumns: `repeat(${GRID_WIDTH}, 1fr)` }}
      >
        {renderTileGrid(normalizedTilemap, tileTypes)}
      </div>
    </div>
  );
};

// Render the grid of tiles
function renderTileGrid(grid: number[][], tileTypes: Record<number, TileType>) {
  return grid.flatMap((row, rowIndex) => 
    row.map((tileId, colIndex) => {
      const tileType = tileTypes[tileId];
      return (
        <div
          key={`${rowIndex}-${colIndex}`}
          data-testid={`tile-${rowIndex}-${colIndex}`}
        >
          <Tile 
            tileId={tileId}
            tileType={tileType}
          />
        </div>
      );
    })
  );
}

// Helper function to ensure grid is exactly the specified size
function ensureGridSize(grid: number[][], targetWidth: number, targetHeight: number): number[][] {
  // Create a new grid with target dimensions
  const newGrid: number[][] = [];
  
  // Fill the grid with existing values or 0 if out of range
  for (let y = 0; y < targetHeight; y++) {
    const row: number[] = [];
    for (let x = 0; x < targetWidth; x++) {
      // Use existing value or default to 0
      row.push(grid[y]?.[x] !== undefined ? grid[y][x] : 0);
    }
    newGrid.push(row);
  }
  
  return newGrid;
}
