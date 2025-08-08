import React from 'react';
import { TileType } from '../lib/map';

interface LegendItemProps {
  tile: TileType;
}

export const LegendItem: React.FC<LegendItemProps> = ({ tile }) => {
  const walkabilityLabel = tile.walkable ? "(walkable)" : "(blocked)";
  
  return (
    <div className="flex items-center">
      <div 
        className="w-6 h-6 mr-2"
        style={{ backgroundColor: tile.color }}
      ></div>
      <span>
        {tile.id}: {tile.name} {walkabilityLabel}
      </span>
    </div>
  );
};
