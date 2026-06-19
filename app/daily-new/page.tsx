"use client";

import React, { useEffect, useState, useCallback } from "react";
import { go } from "../../lib/navigation";
import { DailyChallengeFlow, DailyChallengeState } from "../../lib/daily_challenge_flow";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import BackgroundAssetLoader from "../../lib/background_asset_loader";
import DailyAvailable from "../../components/daily/DailyAvailable";
import DailyCompleted from "../../components/daily/DailyCompleted";
import GameView from "../../components/GameView";
import BlockingPreloader from "../../components/BlockingPreloader";
import {
  trackPageView,
  markNewPlayer,
  trackTutorialLanded,
} from "../../lib/posthog_analytics";

export default function DailyNewPage() {
  const [assetsReady, setAssetsReady] = useState<boolean>(false);
  const [state, setState] = useState<DailyChallengeState | null>(null);
  const [data, setData] = useState<DailyChallengeData | null>(null);
  const [today, setToday] = useState<string>("");
  const [showGame, setShowGame] = useState<boolean>(false);
  const handleAssetsReady = useCallback(() => {
    setAssetsReady(true);
    // Start loading remaining assets in background after critical ones are done
    BackgroundAssetLoader.getInstance().startBackgroundLoading();
  }, []);

  useEffect(() => {
    // Track page view
    trackPageView('daily_challenge_new');
    
    // Load initial state
    const currentState = DailyChallengeFlow.getCurrentState();
    const stateData = DailyChallengeFlow.getStateData();
    
    setState(currentState);
    setData(stateData.data);
    setToday(stateData.today);
    
    // Check if there's an active game in progress and we should show it directly
    if (currentState === DailyChallengeState.DAILY_AVAILABLE) {
      const hasActiveGame = CurrentGameStorage.hasCurrentGame('daily-new');
      if (hasActiveGame) {
        setShowGame(true);
      }
    }
  }, []);

  // First-run: take the player into the guided run (/new). We deliberately do
  // NOT mark the intro seen here — /new gates on hasSeenIntro and would bounce
  // them otherwise; completing the guided run is what marks it.
  const handleGuideMe = useCallback(() => {
    go("/new");
  }, []);

  // Start today's daily directly. For a brand-new player this is the "skip the
  // guide" path: tag them as an unguided new player and mark the intro seen so
  // the fork doesn't reappear, then drop straight into the run.
  const handleStart = useCallback(() => {
    if (state === DailyChallengeState.FIRST_TIME) {
      markNewPlayer({ enteredViaTutorial: false });
      trackTutorialLanded({ outcome: "skipped", reason: "played_before" });
      const updatedData = DailyChallengeFlow.handleIntroComplete();
      setData(updatedData);
      setState(DailyChallengeState.DAILY_AVAILABLE);
    }
    setShowGame(true);
  }, [state]);

  const handleGameComplete = (result: 'won' | 'lost') => {
    const updatedData = DailyChallengeFlow.handleGameComplete(result);
    setData(updatedData);
    setState(DailyChallengeState.DAILY_COMPLETED);
  };

  // Block on asset preload
  if (!assetsReady) {
    return <BlockingPreloader onReady={handleAssetsReady} />;
  }

  // Loading state for daily flow
  if (state === null || data === null) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{
          backgroundImage: "url(/images/presentational/wall-up-close.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "auto"
        }}
      >
        <div className="text-xl text-gray-200 bg-black/70 rounded-lg p-6 backdrop-blur-sm">Loading...</div>
      </div>
    );
  }

  // An in-progress game takes over regardless of which entry state we came
  // from (fresh first-run skip, returning player, or a resumed save).
  if (showGame) {
    return (
      <GameView
        isDailyChallenge
        storageSlot="daily-new"
        onDailyComplete={(result) => {
          handleGameComplete(result);
          setShowGame(false);
        }}
      />
    );
  }

  // Render appropriate component based on state
  switch (state) {
    case DailyChallengeState.FIRST_TIME:
      // Same Start screen, first-run variant: lead with the guided run.
      return (
        <DailyAvailable
          data={data}
          today={today}
          firstTime
          onGuideMe={handleGuideMe}
          onStart={handleStart}
        />
      );

    case DailyChallengeState.DAILY_AVAILABLE:
      return (
        <DailyAvailable
          data={data}
          today={today}
          onGameComplete={handleGameComplete}
          onStart={handleStart}
        />
      );

    case DailyChallengeState.DAILY_COMPLETED:
      return <DailyCompleted data={data} />;
    
    default:
      return (
        <div 
          className="min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: "url(/images/presentational/wall-up-close.png)",
            backgroundRepeat: "repeat",
            backgroundSize: "auto"
          }}
        >
          <div className="text-xl text-red-300 bg-black/70 rounded-lg p-6 backdrop-blur-sm">Unknown state</div>
        </div>
      );
  }
}
