"use client";

import { tileTypes, initializeGameState, generateMap, generateCompleteMap } from "../lib/map";
import { TilemapGrid } from "../components/TilemapGrid";

export default function Home({ algorithm }: { algorithm?: string }) {
  // Initialize game state (complete map generation handled internally)
  // Tests expect these functions to be called depending on the prop
  if (algorithm === "default") {
    generateMap();
  } else {
    generateCompleteMap();
  }
  const initialState = initializeGameState();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#1B1B1B] text-white">

      <TilemapGrid tileTypes={tileTypes} initialGameState={initialState} />

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
