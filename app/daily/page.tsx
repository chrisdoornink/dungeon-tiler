"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DailyChallengeFlow, DailyChallengeState } from "../../lib/daily_challenge_flow";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import DailyIntro from "../../components/daily/DailyIntro";
import DailyAvailable from "../../components/daily/DailyAvailable";
import DailyCompleted from "../../components/daily/DailyCompleted";
import GameView from "../../components/GameView";
import BlockingPreloader from "../../components/BlockingPreloader";
import { trackPageView } from "../../lib/posthog_analytics";

export default function DailyChallengePage() {
  const [assetsReady, setAssetsReady] = useState<boolean>(false);
  const [state, setState] = useState<DailyChallengeState | null>(null);
  const [data, setData] = useState<DailyChallengeData | null>(null);
  const [today, setToday] = useState<string>("");
  const [showGame, setShowGame] = useState<boolean>(false);
  const handleAssetsReady = useCallback(() => setAssetsReady(true), []);

  useEffect(() => {
    // Track page view
    trackPageView('daily_challenge');
    
    // Load initial state
    const currentState = DailyChallengeFlow.getCurrentState();
    const stateData = DailyChallengeFlow.getStateData();
    
    setState(currentState);
    setData(stateData.data);
    setToday(stateData.today);
  }, []);

  const handleIntroComplete = () => {
    const updatedData = DailyChallengeFlow.handleIntroComplete();
    setData(updatedData);
    setState(DailyChallengeState.DAILY_AVAILABLE);
  };

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

  // Render appropriate component based on state
  switch (state) {
    case DailyChallengeState.FIRST_TIME:
      return <DailyIntro onComplete={handleIntroComplete} />;
    
    case DailyChallengeState.DAILY_AVAILABLE:
      if (showGame) {
        return (
          <GameView
            isDailyChallenge
            onDailyComplete={(result) => {
              handleGameComplete(result);
              setShowGame(false);
            }}
          />
        );
      }
      return (
        <DailyAvailable
          data={data}
          today={today}
          onGameComplete={handleGameComplete}
          onStart={() => setShowGame(true)}
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
