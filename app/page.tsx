"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { tileTypes, initializeGameState, initializeGameStateFromMap, generateMap, generateCompleteMap, computeMapId, type GameState } from "../lib/map";
import { useSearchParams } from "next/navigation";
import { rehydrateEnemies } from "../lib/enemy";
import { TilemapGrid } from "../components/TilemapGrid";
import { deleteSavedMap, loadSavedMaps, upsertSavedMap, type SavedMapEntry } from "../lib/saved_maps";

function HomeInner() {
  const [daylight, setDaylight] = useState(process.env.NODE_ENV !== 'test');
  const searchParams = useSearchParams();
  const algorithm = searchParams.get("algorithm") ?? undefined;
  const replay = searchParams.get("replay") === "1";
  const replayExact = searchParams.get("replayExact") === "1";
  const mapIdParam = searchParams.get("map") ?? undefined;
  const isDailyChallenge = searchParams.get("daily") === "true";
  
  // Initialize game state (complete map generation handled internally)
  // Tests expect these functions to be called depending on the prop
  // Use useMemo to prevent re-initialization on every render
  const initialState = useMemo(() => {
    let state: GameState | undefined;
    
    // If loading exact state, try localStorage first and avoid regenerating
    if ((replayExact || mapIdParam) && typeof window !== 'undefined') {
      try {
        // For map-specific loading, try the map-specific key first, then fallback to generic
        const keys = mapIdParam ? [`initialGame:${mapIdParam}`, 'initialGame'] : ['initialGame'];
        for (const key of keys) {
          const rawExact = window.localStorage.getItem(key);
          if (rawExact) {
            const parsedExact = JSON.parse(rawExact);
            if (parsedExact && parsedExact.mapData && parsedExact.mapData.tiles && parsedExact.mapData.subtypes) {
              // Rehydrate enemies into class instances so methods exist
              if (Array.isArray(parsedExact.enemies)) {
                parsedExact.enemies = rehydrateEnemies(parsedExact.enemies);
              }
              state = parsedExact;
              break;
            }
          }
        }
      } catch {
        // ignore
      }
    }
    
    if (!state) {
      if (algorithm === "default") {
        generateMap();
      } else {
        generateCompleteMap();
      }
      state = initializeGameState();
      // Persist the exact initial game for reproducibility (single instance)
      if (typeof window !== 'undefined' && state && state.mapData) {
        try {
          // Use single key, replace previous game data
          window.localStorage.setItem('initialGame', JSON.stringify(state));
        } catch {
          // ignore storage errors
        }
      }
    }
    
    return state;
  }, [algorithm, replayExact, mapIdParam]);

  // Handle legacy replay logic - this modifies the initial state after creation
  const [replayState, setReplayState] = useState<GameState | undefined>();
  useEffect(() => {
    if (replay && typeof window !== 'undefined') {
      // Legacy replay that only preserves map: derive a fresh state from lastGame.mapData
      try {
        const raw = window.sessionStorage.getItem("lastGame");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.mapData && parsed.mapData.tiles && parsed.mapData.subtypes) {
            setReplayState(initializeGameStateFromMap(parsed.mapData));
          }
        }
      } catch {
        // ignore bad storage/parse
      }
    }
  }, [replay]);

  // Use replay state if available, otherwise use initial state
  const finalInitialState = replayState || initialState;

  // Saved maps UI state
  const [savedMaps, setSavedMaps] = useState<SavedMapEntry[]>([]);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const currentMapId = useMemo(() => {
    try {
      return finalInitialState?.mapData ? computeMapId(finalInitialState.mapData) : undefined;
    } catch {
      return undefined;
    }
  }, [finalInitialState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSavedMaps(loadSavedMaps());
  }, []);

  function handleSave() {
    if (!finalInitialState || !currentMapId) return;
    const entry: SavedMapEntry = {
      id: currentMapId,
      rating,
      title: title || undefined,
      notes: notes || undefined,
      savedAt: new Date().toISOString(),
      initialGameState: finalInitialState,
    };
    upsertSavedMap(entry);
    setSavedMaps(loadSavedMaps());
  }

  function handleLoad(id: string) {
    window.location.href = `/?map=${encodeURIComponent(id)}`;
  }

  function handleDelete(id: string) {
    deleteSavedMap(id);
    setSavedMaps(loadSavedMaps());
  }

  return (
    <div 
      className="min-h-screen flex flex-row items-start justify-center p-4 gap-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto"
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
      <div className="flex flex-col items-center relative z-10">
        <TilemapGrid tileTypes={tileTypes} initialGameState={finalInitialState} forceDaylight={daylight} isDailyChallenge={isDailyChallenge} />
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

      {/* Sidebar: Saved Maps */}
      <aside className="w-[380px] max-w-[90vw] bg-[#222] rounded p-3 sticky top-4 self-start">
        <div className="mb-3">
          <div className="text-sm text-gray-300">Current map ID</div>
          <div className="font-mono text-xs break-all text-gray-200">{currentMapId ?? '—'}</div>
        </div>

        <div className="mb-3 border-t border-[#333] pt-3">
          <div className="text-sm mb-2">Save this map</div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-300">Rating</label>
            <select
              className="bg-[#333] text-white text-sm rounded px-2 py-1 border-0"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full mb-2 bg-[#333] text-white text-sm rounded px-2 py-1 border-0 outline-none"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={3}
            className="w-full mb-2 bg-[#333] text-white text-sm rounded px-2 py-1 border-0 outline-none resize-y"
          />
          <button
            onClick={handleSave}
            disabled={!currentMapId}
            className={`px-3 py-2 rounded transition-colors border-0 ${currentMapId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#333] text-gray-400 cursor-not-allowed'}`}
            title={currentMapId ? 'Save current map with rating' : 'No map loaded'}
          >
            Save Map
          </button>
        </div>

        <div className="border-t border-[#333] pt-3">
          <div className="text-sm mb-2">Saved maps ({savedMaps.length})</div>
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-auto pr-1">
            {savedMaps.map((m) => (
              <div key={m.id} className="bg-[#1a1a1a] rounded p-2">
                <div className="text-xs text-gray-300">{new Date(m.savedAt).toLocaleString()}</div>
                <div className="text-sm font-semibold">{m.title || 'Untitled'} <span className="text-xs text-gray-400">(⭐ {m.rating}/5)</span></div>
                <div className="font-mono text-[10px] break-all text-gray-400 mb-1">{m.id}</div>
                {m.notes ? (<div className="text-xs text-gray-300 mb-1 whitespace-pre-wrap">{m.notes}</div>) : null}
                <div className="flex items-center gap-2 mt-1">
                  <button className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded border-0" onClick={() => handleLoad(m.id)}>Load</button>
                  <button className="px-2 py-1 bg-[#444] hover:bg-[#555] text-white text-xs rounded border-0" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/?map=${encodeURIComponent(m.id)}`)}>Copy Link</button>
                  <button className="ml-auto px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded border-0" onClick={() => handleDelete(m.id)}>Delete</button>
                </div>
              </div>
            ))}
            {savedMaps.length === 0 ? (
              <div className="text-xs text-gray-400">No saved maps yet. Save the current map with a rating to build your curated list.</div>
            ) : null}
          </div>
        </div>
      </aside>
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
