import React from 'react';
import { TileType } from '../lib/map';

interface TileProps {
  tileId: number;
  tileType: TileType;
  subtype?: number;
}

export const Tile: React.FC<TileProps> = ({ tileId, tileType, subtype = 0 }) => {
  // Display format: show subtype only if it's not 0
  const displayText = subtype > 0 ? `${tileId}:${subtype}` : `${tileId}`;
  
  return (
    <div 
      className="w-10 h-10 flex items-center justify-center text-sm font-medium"
      style={{ backgroundColor: tileType.color }}
      data-testid={`tile-${tileId}`}
    >
      {displayText}
    </div>
  );
};
