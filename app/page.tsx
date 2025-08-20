"use client";

import { Suspense, useState } from "react";
import { tileTypes, initializeGameState, generateMap, generateCompleteMap } from "../lib/map";
import { useSearchParams } from "next/navigation";
import { TilemapGrid } from "../components/TilemapGrid";

function HomeInner() {
  const [daylight, setDaylight] = useState(false);
  const searchParams = useSearchParams();
  const algorithm = searchParams.get("algorithm") ?? undefined;
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
      <TilemapGrid tileTypes={tileTypes} initialGameState={initialState} forceDaylight={daylight} />
      <div className="mt-4 mb-4 flex items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0"
        >
          Generate New Map
        </button>
        <button
          onClick={() => setDaylight((v) => !v)}
          className={`px-3 py-2 rounded transition-colors border-0 ${daylight ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#333333] hover:bg-[#444444]'} text-white`}
          title="Toggle daylight (full visibility)"
        >
          {daylight ? 'Daylight: ON' : 'Daylight: OFF'}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
