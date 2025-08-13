"use client";

import { generateMap, generateCompleteMap, tileTypes, MapData, initializeGameState } from "../lib/map";
import { TilemapGrid } from "../components/TilemapGrid";

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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#1B1B1B] text-white">

      <TilemapGrid 
        tileTypes={tileTypes}
        initialGameState={algorithm === "complete" ? initializeGameState() : {
          hasKey: false,
          hasExitKey: false,
          showFullMap: false,
          win: false,
          playerDirection: 0, // Direction.DOWN
          mapData: {
            tiles: tilemap,
            subtypes: mapData?.subtypes || []
          }
        }}
      />

      <div className="mt-4 mb-4">
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0"
        >
          Generate New Map
        </button>
      </div>
    </div>
  );
}
