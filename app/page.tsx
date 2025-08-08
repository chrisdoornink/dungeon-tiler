"use client";

import { generateMap, tileTypes } from "../lib/map";
import { TilemapGrid } from "../components/TilemapGrid";
import { Legend } from "../components/Legend";

export default function Home() {
  // Generate the tilemap
  const tilemap = generateMap();
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">Dungeon Tilemap</h1>
      
      <TilemapGrid tilemap={tilemap} tileTypes={tileTypes} />
      
      <Legend tileTypes={tileTypes} />
    </div>
  );
}
