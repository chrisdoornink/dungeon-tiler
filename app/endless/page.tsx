"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import GameView from "../../components/GameView";
import BlockingPreloader from "../../components/BlockingPreloader";
import BackgroundAssetLoader from "../../lib/background_asset_loader";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import { EndlessStorage, type EndlessData } from "../../lib/endless_storage";
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
  // Remount key so "Descend Again" always starts a fresh run
  const [runId, setRunId] = useState<number>(0);

  const handleAssetsReady = useCallback(() => {
    setAssetsReady(true);
    BackgroundAssetLoader.getInstance().startBackgroundLoading();
  }, []);

  useEffect(() => {
    trackPageView("endless");
    setRecords(EndlessStorage.load());
    // Resume an in-progress run directly
    if (CurrentGameStorage.hasCurrentGame("endless")) {
      setPhase("playing");
    }
  }, []);

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
  }, [records]);

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
            <p className="text-gray-400 text-sm">
              You begin in total darkness with an unlit torch. Fire goblins
              carry the only moving lights — strike one to steal its flame, or
              find a wall torch. Beware the wisps that come to snuff it out,
              and keep to the shadows until you find your steel.
            </p>
            {records && (
              <p className="text-gray-200">
                Best: <span className="font-bold text-amber-300">Floor {records.bestFloor}</span>
                <span className="text-gray-400 text-sm"> · {records.totalRuns} run{records.totalRuns === 1 ? "" : "s"}</span>
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
