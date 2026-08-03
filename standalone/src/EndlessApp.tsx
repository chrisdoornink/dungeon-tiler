/**
 * The portal build's shell: the SAME start / game-over screens as /endless on the live
 * site, not the Phase-0 spike card this replaced.
 *
 * Kept as a port rather than importing app/endless/page.tsx directly because that file is a
 * Next.js route module ("use client" + next/link + the route's own back-navigation), and the
 * portal has no router to go back to. The structure, copy and Tailwind classes are
 * deliberately identical so the two surfaces stay recognisably one game; the deltas are all
 * portal concerns, each marked PORTAL below.
 */
import React, { useCallback, useEffect, useState } from "react";
import GameView from "../../components/GameView";
import BlockingPreloader from "../../components/BlockingPreloader";
import BackgroundAssetLoader from "../../lib/background_asset_loader";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import { EndlessStorage, type EndlessData } from "../../lib/endless_storage";
import {
  fetchEndlessLeaderboard,
  getEndlessPlayerName,
  saveEndlessPlayerName,
  type LeaderboardData,
} from "../../lib/endless_leaderboard";
import { EndlessLeaderboard } from "../../components/endless/EndlessLeaderboard";
import { LeaderboardPanel } from "../../components/endless/LeaderboardPanel";
import { deathCauseMessage } from "../../lib/death_message";
import { getOrCreateUserId } from "../../lib/posthog_analytics";
import { assetUrl } from "../../lib/asset_url";
import { setAdBreakHandler } from "../../lib/ad_break";
import {
  gameplayStart,
  gameplayStop,
  happytime,
  loadingStop,
  maybeFloorAdBreak,
} from "./crazygames";

type Phase = "start" | "playing" | "gameover";

const backgroundStyle: React.CSSProperties = {
  // PORTAL: through assetUrl() — the bundle is served from a CDN subpath, so a bare
  // "/images/..." would 404. Same rule as every other shared asset path.
  backgroundImage: `url(${assetUrl("/images/presentational/wall-up-close.png")})`,
  backgroundRepeat: "repeat",
  backgroundSize: "auto",
};

export default function EndlessApp() {
  const [assetsReady, setAssetsReady] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>("start");
  const [records, setRecords] = useState<EndlessData | null>(null);
  const [endedAsNewBest, setEndedAsNewBest] = useState<boolean>(false);
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [nameSaved, setNameSaved] = useState<boolean>(false);
  // Remount key so "Descend Again" always starts a fresh run
  const [runId, setRunId] = useState<number>(0);
  const [panelOpen, setPanelOpen] = useState<boolean>(false);
  const [fullBoard, setFullBoard] = useState<LeaderboardData | null>(null);
  const [panelLoading, setPanelLoading] = useState<boolean>(false);
  const [myShortId, setMyShortId] = useState<string>("");

  const refreshBoard = useCallback(() => {
    void fetchEndlessLeaderboard().then((data) => {
      if (data) setBoard(data);
    });
  }, []);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    setPanelLoading(true);
    void fetchEndlessLeaderboard(50).then((data) => {
      if (data) setFullBoard(data);
      setPanelLoading(false);
    });
  }, []);

  const handleAssetsReady = useCallback(() => {
    setAssetsReady(true);
    // PORTAL: the SDK's loading phase ends when the game is ready to be played.
    loadingStop();
    BackgroundAssetLoader.getInstance().startBackgroundLoading();
  }, []);

  useEffect(() => {
    setRecords(EndlessStorage.load());
    const savedName = getEndlessPlayerName();
    setPlayerName(savedName);
    setNameSaved(!!savedName);
    setMyShortId(getOrCreateUserId().slice(0, 8));
    refreshBoard();
    // Resume an in-progress run directly, same as the live site.
    //
    // This is NOT optional polish — it is load-bearing. GameView always rehydrates the
    // saved run for its storage slot on mount (see its initialState useMemo), and the slot
    // is only cleared when a run actually ends. Skip this check and a mid-run reload shows
    // the start screen, then "Descend" silently drops the player back into the old run:
    // strictly worse than either resuming or starting clean. It is also the kinder
    // behavior in an iframe, where a stray refresh shouldn't cost a deep run.
    if (CurrentGameStorage.hasCurrentGame("endless")) {
      setPhase("playing");
      gameplayStart(); // PORTAL: resuming counts as gameplay starting
    }
  }, [refreshBoard]);

  /**
   * PORTAL: register the midgame ad break. This is the ONLY place an ad is wired in; the
   * shared engine just asks whether a handler exists (lib/ad_break.ts), so the Next app is
   * untouched. Registered once for the session and torn down on unmount.
   */
  useEffect(() => {
    setAdBreakHandler(async () => {
      await maybeFloorAdBreak();
    });
    return () => setAdBreakHandler(null);
  }, []);

  const handleSaveName = useCallback(() => {
    const trimmed = playerName.trim().slice(0, 16);
    if (!trimmed) return;
    setNameSaved(true);
    void saveEndlessPlayerName(trimmed).then(refreshBoard);
  }, [playerName, refreshBoard]);

  const handleStart = useCallback(() => {
    setRunId((n) => n + 1);
    setPhase("playing");
    gameplayStart(); // PORTAL: lifecycle — real gameplay begins now
  }, []);

  const handleRunOver = useCallback(() => {
    gameplayStop(); // PORTAL: lifecycle — leaving gameplay for the results screen
    const prevBest = records?.bestFloor ?? 0;
    const data = EndlessStorage.load();
    setRecords(data);
    const isNewBest = !!data?.lastRun && data.lastRun.floor > prevBest;
    setEndedAsNewBest(isNewBest);
    // PORTAL: "reaching a highscore" is one of their own examples for happytime().
    if (isNewBest) happytime();
    setPhase("gameover");
    refreshBoard();
  }, [records, refreshBoard]);

  if (!assetsReady) {
    return <BlockingPreloader onReady={handleAssetsReady} />;
  }

  if (phase === "playing") {
    return <GameView key={runId} storageSlot="endless" onDailyComplete={handleRunOver} />;
  }

  const lastRun = records?.lastRun;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 text-white"
      style={backgroundStyle}
    >
      <div className="max-w-md sm:max-w-xl w-full bg-black/70 rounded-lg p-5 sm:p-8 backdrop-blur-sm text-center flex flex-col gap-5">
        {phase === "start" ? (
          /* A TITLE SCREEN, mirroring the daily's DailyAvailable: the game's name, the
             hero, Start. Deliberately no mode description and no "Endless Mode" heading —
             this is the first thing every portal player sees, and copy explaining what
             endless mode is reads as a manual rather than a game. The leaderboard moves
             behind a High Scores button for the same reason: nothing on this screen but
             the name, the hero, and the way in. */
          <>
            <header>
              <h1 className="text-3xl sm:text-4xl font-bold text-blue-400">Torch Boy</h1>
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mt-4"
                style={{
                  backgroundImage: `url(${assetUrl("/images/hero/hero-front-static.png")})`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              />
            </header>

            <button
              onClick={handleStart}
              className="px-10 py-4 text-lg sm:text-xl font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-lg self-center"
            >
              Start
            </button>

            <button
              onClick={openPanel}
              className="text-gray-300 hover:text-white text-sm underline underline-offset-4 self-center"
            >
              High Scores
            </button>

            {records && records.totalRuns > 0 && (
              <div className="bg-black/50 rounded-lg p-4 border border-gray-600 text-left">
                <div className="space-y-2.5 text-xs sm:text-base">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Best</span>
                    <span className="font-bold text-blue-300">
                      Floor {records.bestFloor}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Runs</span>
                    <span className="font-semibold text-gray-200">
                      {records.totalRuns}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-red-400">The Dungeon Claims You</h1>
            {lastRun?.deathCause && (
              <p className="text-gray-300">{deathCauseMessage(lastRun.deathCause)}</p>
            )}
            {lastRun && (
              <p className="text-xl text-gray-100">
                You reached <span className="font-bold text-amber-300">Floor {lastRun.floor}</span>
              </p>
            )}
            {endedAsNewBest ? (
              <p className="text-amber-300 font-semibold">New best!</p>
            ) : (
              records && <p className="text-gray-400">Best: Floor {records.bestFloor}</p>
            )}
            {lastRun && (
              <p className="text-gray-400 text-sm">
                {lastRun.enemiesDefeated} enemies defeated · {lastRun.steps} steps
              </p>
            )}
            {board && board.top.length > 0 && (
              <div className="text-left bg-black/40 rounded-lg p-3 sm:p-4 flex flex-col gap-3">
                <h2 className="text-amber-300 font-bold text-sm text-center">
                  All-Time Deepest Descents
                </h2>
                <EndlessLeaderboard
                  entries={board.top.slice(0, 10)}
                  highlightPlayerId={myShortId}
                />
                {board.rank != null && (
                  <p className="text-gray-300 text-sm text-center">
                    You: <span className="text-amber-300 font-semibold">#{board.rank}</span> of{" "}
                    {board.totalPlayers} · best Floor {board.bestFloor}
                  </p>
                )}
                <button
                  onClick={openPanel}
                  className="text-amber-300 hover:text-amber-200 text-sm underline underline-offset-2 self-center"
                >
                  View full leaderboard
                </button>
              </div>
            )}
            <div className="flex flex-col gap-2 items-stretch">
              {board && board.rank == null ? (
                <p className="text-gray-400 text-xs">
                  Add a name to save this run to the leaderboard.
                </p>
              ) : (
                nameSaved && (
                  <p className="text-gray-400 text-xs">
                    Saved as this name. Edit it to change how you appear.
                  </p>
                )
              )}
              <input
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  setNameSaved(false);
                }}
                placeholder="Name on the board"
                maxLength={16}
                className="bg-black/50 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleSaveName}
                disabled={!playerName.trim() || nameSaved}
                className="text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 py-2 px-3 rounded transition-colors"
              >
                {nameSaved ? "Saved" : "Save Name"}
              </button>
            </div>
            <button
              onClick={handleStart}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Descend Again
            </button>
          </>
        )}
        {/* PORTAL: no "Back to Torch Boy" link. The game is the whole page inside the
            portal's iframe — there is no site to return to, and navigating a player out of
            a portal frame is exactly what portals don't want. */}
      </div>
      {panelOpen && (
        <LeaderboardPanel
          board={fullBoard}
          loading={panelLoading}
          highlightPlayerId={myShortId}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
