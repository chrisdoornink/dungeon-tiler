import React from 'react';
import { TileType } from '../lib/map';

interface LegendProps {
  tileTypes: Record<number, TileType>;
}

export const Legend: React.FC<LegendProps> = ({ tileTypes }) => {
  return (
    <div className="mt-6 p-4 border border-gray-300 rounded-md">
      <h2 className="text-xl font-semibold mb-2">Legend</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.values(tileTypes).map(tile => (
          <div key={tile.id} className="flex items-center">
            <div 
              className="w-6 h-6 mr-2"
              style={{ backgroundColor: tile.color }}
            ></div>
            <span>{tile.id}: {tile.name} {tile.walkable ? "(walkable)" : "(blocked)"}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
