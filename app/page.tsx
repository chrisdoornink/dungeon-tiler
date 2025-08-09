"use client";

import { generateMap, generateCompleteMap, tileTypes, MapData, initializeGameState } from "../lib/map";
import { TilemapGrid } from "../components/TilemapGrid";
import { Legend } from "../components/Legend";

interface HomeProps {
  algorithm?: "default" | "complete";
}

export default function Home({ algorithm = "complete" }: HomeProps) {
  // Generate the tilemap based on selected algorithm
  let mapData: MapData | null = null;
  let tilemap: number[][];
  
  if (algorithm === "complete") {
    mapData = generateCompleteMap();
    tilemap = mapData.tiles;
  } else {
    tilemap = generateMap();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">Dungeon Tilemap</h1>

      <TilemapGrid 
        tileTypes={tileTypes}
        initialGameState={algorithm === "complete" ? initializeGameState() : {
          hasKey: false,
          mapData: {
            tiles: tilemap,
            subtypes: mapData?.subtypes || []
          }
        }}
      />

      <div className="mt-4 mb-4">
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Generate New Map
        </button>
      </div>

      <Legend tileTypes={tileTypes} />
    </div>
  );
}
