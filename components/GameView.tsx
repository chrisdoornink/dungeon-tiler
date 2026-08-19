"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { generateMap, generateCompleteMap, initializeGameState, initializeGameStateForMultiTier, initializeGameStateForEndless, initializeGameStateFromMap, SWITCH_GATE_START_DATE, type GameState, tileTypes } from "../lib/map";
import { rehydrateEnemies, type PlainEnemy } from "../lib/enemy";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../lib/rng";
import { DateUtils } from "../lib/date_utils";
import { CurrentGameStorage } from "../lib/current_game_storage";
import { trackGameStart } from "../lib/analytics";
import { computeMapId } from "../lib/map";
import { assetUrl } from "../lib/asset_url";
import { TilemapGrid } from "./TilemapGrid";

export interface GameViewProps {
  algorithm?: string;
  replay?: boolean;
  replayExact?: boolean;
  mapId?: string;
  isDailyChallenge?: boolean;
  forceDaylightDefault?: boolean;
  onDailyComplete?: (result: "won" | "lost") => void;
  storageSlot?: "default" | "daily-new" | "daily-preview" | "story" | "endless";
  /**
   * Date-override for the /daily-preview test route: when set (YYYY-MM-DD), the daily is
   * generated and advanced for THIS date instead of today, so any past/future day's full run
   * (enemies, darkness, floor cascade) can be replayed. Only ever passed by /daily-preview,
   * which also isolates storage (daily-preview slot) and suppresses /stats analytics.
   */
  dailyDateOverride?: string;
}

/**
 * Header title: "Torch Boy — Floor 2/3" in the multi-floor daily, "Torch Boy — Floor 7"
 * in endless (no cap worth advertising), and the floor word becomes "Pink Realm" while
 * the hero is warped into the secret realm. Inside a boss arena the floor keeps its
 * number and gains a skull: "Torch Boy — Floor 3/3 💀" — deliberately no boss name,
 * since the internal boss names aren't surfaced to players.
 */
export function heroLocationTitle({
  floor,
  maxFloors,
  isEndless,
  inPinkRealm,
  inBossRoom,
}: {
  floor?: number;
  maxFloors: number;
  isEndless: boolean;
  inPinkRealm?: boolean;
  inBossRoom?: boolean;
}): string {
  const isMultiFloor = maxFloors > 1;
  if (!floor || (!isEndless && !isMultiFloor)) return "Torch Boy";
  // Boss arena wins over the realm word: you are standing in the arena, and the skull
  // is the whole signal. (Unreachable together today — arenas are entered from the
  // floor-3 dungeon, not the realm — but the precedence keeps the string sane.)
  const place = inPinkRealm && !inBossRoom ? "Pink Realm" : "Floor";
  const boss = inBossRoom ? " 💀" : "";
  const where = isEndless ? `${floor}` : `${floor}/${maxFloors}`;
  return `Torch Boy — ${place} ${where}${boss}`;
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
  dailyDateOverride,
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
    const slot = storageSlot ?? (isDailyChallenge ? 'daily-new' : 'default');

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
        // /daily-preview replays a chosen date; the live daily always uses today.
        const localToday = dailyDateOverride ?? DateUtils.getTodayString();
        const seed = hashStringToSeed(localToday);
        const rng = mulberry32(seed);
        state = withPatchedMathRandom(rng, () => {
          // Preserve existing test expectations by optionally invoking generators
          if (algorithm === "default") {
            generateMap();
          } else if (algorithm === "complete") {
            generateCompleteMap();
          }
          if (slot === 'daily-new' || slot === 'daily-preview') {
            // Multi-tier daily mode uses its own initializer with floor-based generation.
            // Switch gates are date-gated: this is one of only two callers that knows which
            // day's map it is building, so the version check has to live here rather than
            // inside the generator. See SWITCH_GATE_START_DATE.
            return initializeGameStateForMultiTier(1, {
              switchGates: localToday >= SWITCH_GATE_START_DATE,
            });
          }
          const gs = initializeGameState();
          return gs;
        });
        if (state) {
          state.mode = 'daily';
          state.allowCheckpoints = false;
        }
      } else if (slot === 'endless') {
        // Endless mode: per-run random seed baked into the state (not the daily seed)
        state = initializeGameStateForEndless();
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
  }, [algorithm, replayExact, mapId, isDailyChallenge, storageSlot, dailyDateOverride]);

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

  // Track the hero's location (floor + pink realm + boss arena) for the title area
  const [heroLocation, setHeroLocation] = useState<{
    floor?: number;
    inPinkRealm: boolean;
    inBossRoom: boolean;
  }>({
    floor: finalInitialState?.currentFloor,
    inPinkRealm: !!finalInitialState?.inPinkRealm,
    inBossRoom: !!finalInitialState?.inBossRoom,
  });

  const title = heroLocationTitle({
    floor: heroLocation.floor,
    maxFloors: finalInitialState?.maxFloors ?? 1,
    isEndless: storageSlot === "endless",
    inPinkRealm: heroLocation.inPinkRealm,
    inBossRoom: heroLocation.inBossRoom,
  });

  // Fire analytics for game start once we have an initial state
  useEffect(() => {
    try {
      if (!finalInitialState || !finalInitialState.mapData) return;
      // /daily-preview is a local test run — never let it emit analytics that /stats reads.
      if (dailyDateOverride) return;
      const mode = storageSlot === "endless" ? "endless" : isDailyChallenge ? "daily" : "normal";
      const mapId = computeMapId(finalInitialState.mapData);
      const dateSeed = isDailyChallenge ? DateUtils.getTodayString() : undefined;
      trackGameStart({ mode, mapId, dateSeed, algorithm });
    } catch {}
  }, [finalInitialState, isDailyChallenge, algorithm, storageSlot, dailyDateOverride]);

  return (
    <div
      className="min-h-screen flex flex-row items-start justify-center p-4 max-[600px]:p-2 gap-4 text-white relative"
      style={{
        backgroundImage: `url(${assetUrl("/images/presentational/wall-up-close.png")})`,
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
      <div className="flex flex-col items-center relative z-10">
        <h1 className="text-1xl font-bold text-center mb-4 max-[600px]:mb-1 text-gray-400">
          {title}
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
          dailyDateOverride={dailyDateOverride}
          onLocationChange={setHeroLocation}
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
