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
  
  // Determine text color based on background color
  // Use light text for wall tiles (dark backgrounds)
  const textColor = tileType.id === 1 ? '#fff' : '#000';
  
  return (
    <div 
      className="w-10 h-10 flex items-center justify-center text-sm font-medium"
      style={{ 
        backgroundColor: tileType.color,
        color: textColor
      }}
      data-testid={`tile-${tileId}`}
    >
      {displayText}
    </div>
  );
};
