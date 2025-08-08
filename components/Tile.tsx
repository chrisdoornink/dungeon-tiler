import React from 'react';
import { TileType } from '../lib/map';

interface TileProps {
  tileId: number;
  tileType: TileType;
  rowIndex: number;
  colIndex: number;
}

export const Tile: React.FC<TileProps> = ({ tileId, tileType, rowIndex, colIndex }) => {
  return (
    <div 
      key={`${rowIndex}-${colIndex}`}
      className="w-10 h-10 flex items-center justify-center text-sm font-medium"
      style={{ backgroundColor: tileType.color }}
    >
      {tileId}
    </div>
  );
};
