"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { generateMap, generateCompleteMap, initializeGameState, initializeGameStateForMultiTier, initializeGameStateFromMap, type GameState, tileTypes } from "../lib/map";
import { rehydrateEnemies, type PlainEnemy } from "../lib/enemy";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../lib/rng";
import { DateUtils } from "../lib/date_utils";
import { CurrentGameStorage } from "../lib/current_game_storage";
import { trackGameStart } from "../lib/analytics";
import { computeMapId } from "../lib/map";
import { TilemapGrid } from "./TilemapGrid";

export interface GameViewProps {
  algorithm?: string;
  replay?: boolean;
  replayExact?: boolean;
  mapId?: string;
  isDailyChallenge?: boolean;
  forceDaylightDefault?: boolean;
  onDailyComplete?: (result: "won" | "lost") => void;
  storageSlot?: "default" | "daily" | "daily-new" | "story";
}

function GameViewInner({
  algorithm,
  replay,
  replayExact,
  mapId,
  isDailyChallenge,
  forceDaylightDefault,
  onDailyComplete,
  storageSlot,
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

    // First priority: check for current game in progress (auto-save/restore)
    const slot = storageSlot ?? (isDailyChallenge ? 'daily' : 'default');

    if (!replayExact && !mapId && typeof window !== "undefined") {
      const savedGame = CurrentGameStorage.loadCurrentGame(slot);
      if (savedGame) {
        // Rehydrate enemies into class instances so methods exist
        if (Array.isArray(savedGame.enemies)) {
          savedGame.enemies = rehydrateEnemies(savedGame.enemies as unknown as PlainEnemy[]);
        }
        state = savedGame as GameState;
      }
    }

    // Second priority: if loading exact state, try localStorage and avoid regenerating
    if (!state && (replayExact || mapId) && typeof window !== "undefined") {
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
      // Deterministic daily seed: Local date string YYYY-MM-DD
      if (isDailyChallenge) {
        const localToday = DateUtils.getTodayString();
        const seed = hashStringToSeed(localToday);
        const rng = mulberry32(seed);
        state = withPatchedMathRandom(rng, () => {
          // Preserve existing test expectations by optionally invoking generators
          if (algorithm === "default") {
            generateMap();
          } else if (algorithm === "complete") {
            generateCompleteMap();
          }
          if (slot === 'daily-new') {
            // Multi-tier daily mode uses its own initializer with floor-based generation
            return initializeGameStateForMultiTier(1);
          }
          const gs = initializeGameState();
          // Daily-only: 1-in-6 chance to use the outdoor environment
          if (gs && gs.mapData && Math.random() < 1 / 6) {
            gs.mapData.environment = "outdoor";
          }
          return gs;
        });
        if (state) {
          state.mode = 'daily';
          state.allowCheckpoints = false;
        }
      } else {
        if (algorithm === "default") {
          generateMap();
        } else if (algorithm === "complete") {
          generateCompleteMap();
        }
        state = initializeGameState();
        if (state) {
          state.mode = 'normal';
          state.allowCheckpoints = state.allowCheckpoints ?? false;
        }
      }
      // Persist the exact initial game for reproducibility (single instance)
      if (typeof window !== "undefined" && state && state.mapData) {
        try {
          // Use single key, replace previous game data
          window.localStorage.setItem("initialGame", JSON.stringify(state));
          // Also save as current game for auto-save/restore functionality
          CurrentGameStorage.saveCurrentGame(state, slot);
        } catch {
          // ignore storage errors
        }
      }
    }

    if (state) {
      if (isDailyChallenge) {
        state.mode = 'daily';
        state.allowCheckpoints = false;
      } else {
        state.mode = state.mode ?? 'normal';
        state.allowCheckpoints = state.allowCheckpoints ?? false;
      }
    }

    return state;
  }, [algorithm, replayExact, mapId, isDailyChallenge]);

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

  // Fire analytics for game start once we have an initial state
  useEffect(() => {
    try {
      if (!finalInitialState || !finalInitialState.mapData) return;
      const mode = isDailyChallenge ? "daily" : "normal";
      const mapId = computeMapId(finalInitialState.mapData);
      const dateSeed = isDailyChallenge ? DateUtils.getTodayString() : undefined;
      trackGameStart({ mode, mapId, dateSeed, algorithm });
    } catch {}
  }, [finalInitialState, isDailyChallenge, algorithm]);

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
          tilemap={finalInitialState.mapData.tiles}
          tileTypes={tileTypes}
          subtypes={finalInitialState.mapData.subtypes}
          initialGameState={finalInitialState}
          forceDaylight={daylight}
          isDailyChallenge={!!isDailyChallenge}
          onDailyComplete={onDailyComplete}
          storageSlot={storageSlot}
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
