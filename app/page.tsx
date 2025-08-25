"use client";

import { Suspense, useState } from "react";
import { tileTypes, initializeGameState, initializeGameStateFromMap, generateMap, generateCompleteMap, computeMapId } from "../lib/map";
import { useSearchParams } from "next/navigation";
import { rehydrateEnemies } from "../lib/enemy";
import { TilemapGrid } from "../components/TilemapGrid";

function HomeInner() {
  const [daylight, setDaylight] = useState(process.env.NODE_ENV !== 'test');
  const searchParams = useSearchParams();
  const algorithm = searchParams.get("algorithm") ?? undefined;
  const replay = searchParams.get("replay") === "1";
  const replayExact = searchParams.get("replayExact") === "1";
  const mapIdParam = searchParams.get("map") ?? undefined;
  // Initialize game state (complete map generation handled internally)
  // Tests expect these functions to be called depending on the prop
  // If loading exact state, try localStorage first and avoid regenerating
  let initialState;
  if ((replayExact || mapIdParam) && typeof window !== 'undefined') {
    try {
      const key = mapIdParam ? `initialGame:${mapIdParam}` : 'initialGame';
      const rawExact = window.localStorage.getItem(key);
      if (rawExact) {
        const parsedExact = JSON.parse(rawExact);
        if (parsedExact && parsedExact.mapData && parsedExact.mapData.tiles && parsedExact.mapData.subtypes) {
          // Rehydrate enemies into class instances so methods exist
          if (Array.isArray(parsedExact.enemies)) {
            parsedExact.enemies = rehydrateEnemies(parsedExact.enemies);
          }
          initialState = parsedExact;
        }
      }
    } catch {
      // ignore
    }
  }
  if (!initialState) {
    if (algorithm === "default") {
      generateMap();
    } else {
      generateCompleteMap();
    }
    initialState = initializeGameState();
    // Persist the exact initial game for reproducibility
    if (typeof window !== 'undefined' && initialState && initialState.mapData) {
      try {
        const id = computeMapId(initialState.mapData);
        window.localStorage.setItem('initialGame', JSON.stringify(initialState));
        window.localStorage.setItem(`initialGame:${id}`, JSON.stringify(initialState));
      } catch {
        // ignore storage errors
      }
    }
  } else if (replay && typeof window !== 'undefined') {
    // Legacy replay that only preserves map: derive a fresh state from lastGame.mapData
    try {
      const raw = window.sessionStorage.getItem("lastGame");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.mapData && parsed.mapData.tiles && parsed.mapData.subtypes) {
          initialState = initializeGameStateFromMap(parsed.mapData);
        }
      }
    } catch {
      // ignore bad storage/parse
    }
  }

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
