"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import {
  tileTypes,
  initializeGameState,
  initializeGameStateFromMap,
  generateMap,
  generateCompleteMap,
  type GameState,
} from "../lib/map";
import { rehydrateEnemies } from "../lib/enemy";
import { TilemapGrid } from "./TilemapGrid";

export interface GameViewProps {
  algorithm?: string;
  replay?: boolean;
  replayExact?: boolean;
  mapId?: string;
  isDailyChallenge?: boolean;
  forceDaylightDefault?: boolean;
  onDailyComplete?: (result: "won" | "lost") => void;
}

function GameViewInner({
  algorithm,
  replay,
  replayExact,
  mapId,
  isDailyChallenge,
  forceDaylightDefault,
  onDailyComplete,
}: GameViewProps) {
  const [daylight] = useState(
    typeof forceDaylightDefault === "boolean"
      ? forceDaylightDefault
      : process.env.NODE_ENV !== "test"
  );

  // Initialize game state (complete map generation handled internally)
  // Tests expect these functions to be called depending on the prop
  // Use useMemo to prevent re-initialization on every render
  const initialState = useMemo(() => {
    let state: GameState | undefined;

    // If loading exact state, try localStorage first and avoid regenerating
    if ((replayExact || mapId) && typeof window !== "undefined") {
      try {
        // For map-specific loading, try the map-specific key first, then fallback to generic
        const keys = mapId
          ? [`initialGame:${mapId}`, "initialGame"]
          : ["initialGame"];
        for (const key of keys) {
          const rawExact = window.localStorage.getItem(key);
          if (rawExact) {
            const parsedExact = JSON.parse(rawExact);
            if (
              parsedExact &&
              parsedExact.mapData &&
              parsedExact.mapData.tiles &&
              parsedExact.mapData.subtypes
            ) {
              // Rehydrate enemies into class instances so methods exist
              if (Array.isArray(parsedExact.enemies)) {
                parsedExact.enemies = rehydrateEnemies(parsedExact.enemies);
              }
              state = parsedExact as GameState;
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
      } else if (algorithm === "complete") {
        generateCompleteMap();
      }
      state = initializeGameState();
      // Persist the exact initial game for reproducibility (single instance)
      if (typeof window !== "undefined" && state && state.mapData) {
        try {
          // Use single key, replace previous game data
          window.localStorage.setItem("initialGame", JSON.stringify(state));
        } catch {
          // ignore storage errors
        }
      }
    }

    return state;
  }, [algorithm, replayExact, mapId]);

  // Legacy replay that only preserves map: derive a fresh state from lastGame.mapData
  const [replayState, setReplayState] = useState<GameState | undefined>();
  useEffect(() => {
    if (replay && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("lastGame");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            parsed.mapData &&
            parsed.mapData.tiles &&
            parsed.mapData.subtypes
          ) {
            setReplayState(initializeGameStateFromMap(parsed.mapData));
          }
        }
      } catch {
        // ignore
      }
    }
  }, [replay]);

  const finalInitialState = replayState || initialState;

  return (
    <div
      className="min-h-screen flex flex-row items-start justify-center p-4 gap-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
      <div className="flex flex-col items-center relative z-10">
        <h1 className="text-1xl font-bold text-center mb-8 text-gray-400">
          Torch Boy
        </h1>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={finalInitialState}
          forceDaylight={daylight}
          isDailyChallenge={!!isDailyChallenge}
          onDailyComplete={onDailyComplete}
        />
      </div>
    </div>
  );
}

export default function GameView(props: GameViewProps) {
  return (
    <Suspense fallback={null}>
      <GameViewInner {...props} />
    </Suspense>
  );
}
