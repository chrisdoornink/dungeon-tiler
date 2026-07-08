"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { getOrCreateUserId, trackPageView } from "../../lib/posthog_analytics";

type Phase = "start" | "playing" | "gameover";

const backgroundStyle: React.CSSProperties = {
  backgroundImage: "url(/images/presentational/wall-up-close.png)",
  backgroundRepeat: "repeat",
  backgroundSize: "auto",
};

export default function EndlessPage() {
  const [assetsReady, setAssetsReady] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>("start");
  const [records, setRecords] = useState<EndlessData | null>(null);
  const [endedAsNewBest, setEndedAsNewBest] = useState<boolean>(false);
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [nameSaved, setNameSaved] = useState<boolean>(false);
  // Remount key so "Descend Again" always starts a fresh run
  const [runId, setRunId] = useState<number>(0);
  // Full-leaderboard panel (top 50) — fetched lazily when opened.
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
    BackgroundAssetLoader.getInstance().startBackgroundLoading();
  }, []);

  useEffect(() => {
    trackPageView("endless");
    setRecords(EndlessStorage.load());
    const savedName = getEndlessPlayerName();
    setPlayerName(savedName);
    // If a name is already on file, the field starts in its saved/locked state.
    setNameSaved(!!savedName);
    setMyShortId(getOrCreateUserId().slice(0, 8));
    refreshBoard();
    // Resume an in-progress run directly
    if (CurrentGameStorage.hasCurrentGame("endless")) {
      setPhase("playing");
    }
  }, [refreshBoard]);

  const handleSaveName = useCallback(() => {
    const trimmed = playerName.trim().slice(0, 16);
    if (!trimmed) return;
    setNameSaved(true);
    void saveEndlessPlayerName(trimmed).then(refreshBoard);
  }, [playerName, refreshBoard]);

  const handleStart = useCallback(() => {
    setRunId((n) => n + 1);
    setPhase("playing");
  }, []);

  const handleRunOver = useCallback(() => {
    const prevBest = records?.bestFloor ?? 0;
    const data = EndlessStorage.load();
    setRecords(data);
    setEndedAsNewBest(!!data?.lastRun && data.lastRun.floor > prevBest);
    setPhase("gameover");
    // The run was submitted before this callback fired; fetch fresh standings.
    refreshBoard();
  }, [records, refreshBoard]);

  if (!assetsReady) {
    return <BlockingPreloader onReady={handleAssetsReady} />;
  }

  if (phase === "playing") {
    return (
      <GameView
        key={runId}
        storageSlot="endless"
        onDailyComplete={handleRunOver}
      />
    );
  }

  const lastRun = records?.lastRun;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 text-white"
      style={backgroundStyle}
    >
      <div className="max-w-md sm:max-w-xl w-full bg-black/70 rounded-lg p-5 sm:p-8 backdrop-blur-sm text-center flex flex-col gap-5">
        {phase === "start" ? (
          <>
            <h1 className="text-2xl font-bold text-amber-300">Endless Mode</h1>
            <p className="text-gray-300">
              Descend as far as you can. Every floor is deadlier than the last,
              and there is no way out — only down.
            </p>
            {records && (
              <p className="text-gray-200">
                Best: <span className="font-bold text-amber-300">Floor {records.bestFloor}</span>
                <span className="text-gray-400 text-sm"> · {records.totalRuns} run{records.totalRuns === 1 ? "" : "s"}</span>
              </p>
            )}
            {board && board.top.length > 0 && (
              <div className="text-left bg-black/40 rounded-lg p-3 sm:p-4 flex flex-col gap-3">
                <h2 className="text-amber-300 font-bold text-sm text-center">
                  All-Time Deepest Descents
                </h2>
                <EndlessLeaderboard
                  entries={board.top.slice(0, 5)}
                  highlightPlayerId={myShortId}
                />
                <button
                  onClick={openPanel}
                  className="text-amber-300 hover:text-amber-200 text-sm underline underline-offset-2 self-center"
                >
                  View full leaderboard
                </button>
              </div>
            )}
            <button
              onClick={handleStart}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Descend
            </button>
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
              records && (
                <p className="text-gray-400">
                  Best: Floor {records.bestFloor}
                </p>
              )
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
        <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm">
          Back to Torch Boy
        </Link>
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
