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
import { trackPageView } from "../../lib/posthog_analytics";

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

  const refreshBoard = useCallback(() => {
    void fetchEndlessLeaderboard().then((data) => {
      if (data) setBoard(data);
    });
  }, []);

  const handleAssetsReady = useCallback(() => {
    setAssetsReady(true);
    BackgroundAssetLoader.getInstance().startBackgroundLoading();
  }, []);

  useEffect(() => {
    trackPageView("endless");
    setRecords(EndlessStorage.load());
    setPlayerName(getEndlessPlayerName());
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
      <div className="max-w-md w-full bg-black/70 rounded-lg p-8 backdrop-blur-sm text-center flex flex-col gap-5">
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
              <p className="text-gray-400 text-sm">
                World record: <span className="text-amber-300">Floor {board.top[0].floor}</span> by{" "}
                {board.top[0].name}
              </p>
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
              <div className="text-left bg-black/40 rounded-lg p-4">
                <h2 className="text-amber-300 font-bold text-sm mb-2 text-center">
                  All-Time Deepest Descents
                </h2>
                <ol className="text-sm text-gray-200 flex flex-col gap-1">
                  {board.top.map((entry, i) => (
                    <li key={`${entry.playerId}-${i}`} className="flex justify-between gap-2">
                      <span className="truncate">
                        {i + 1}. {entry.name}
                      </span>
                      <span className="text-amber-200 whitespace-nowrap">Floor {entry.floor}</span>
                    </li>
                  ))}
                </ol>
                {board.rank != null && (
                  <p className="text-gray-300 text-sm mt-3 text-center">
                    You: <span className="text-amber-300 font-semibold">#{board.rank}</span> of{" "}
                    {board.totalPlayers} · best Floor {board.bestFloor}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2 items-stretch">
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
    </div>
  );
}
