"use client";

import { generateMap, tileTypes } from "../lib/map";

export default function Home() {
  // Generate the tilemap
  const tilemap = generateMap();
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">Dungeon Tilemap</h1>
      
      {/* Tilemap container */}
      <div className="border border-gray-300 rounded-md p-2 shadow-md">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tilemap[0].length}, 1fr)` }}>
          {tilemap.map((row, rowIndex) => (
            row.map((tileId, colIndex) => {
              const tileType = tileTypes[tileId];
              return (
                <div 
                  key={`${rowIndex}-${colIndex}`}
                  className="w-10 h-10 flex items-center justify-center text-sm font-medium"
                  style={{ backgroundColor: tileType.color }}
                >
                  {tileId}
                </div>
              );
            })
          ))}
        </div>
      </div>
      
      {/* Legend */}
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
    </div>
  );
}
