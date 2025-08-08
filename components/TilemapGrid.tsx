import React from 'react';
import { TileType } from '../lib/map';
import { Tile } from './Tile';

interface TilemapGridProps {
  tilemap: number[][];
  tileTypes: Record<number, TileType>;
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({ tilemap, tileTypes }) => {
  return (
    <div className="border border-gray-300 rounded-md p-2 shadow-md">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tilemap[0].length}, 1fr)` }}>
        {tilemap.map((row, rowIndex) => (
          row.map((tileId, colIndex) => {
            const tileType = tileTypes[tileId];
            return (
              <Tile 
                key={`${rowIndex}-${colIndex}`}
                tileId={tileId}
                tileType={tileType}
                rowIndex={rowIndex}
                colIndex={colIndex}
              />
            );
          })
        ))}
      </div>
    </div>
  );
};
