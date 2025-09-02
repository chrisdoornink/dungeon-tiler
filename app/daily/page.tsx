"use client";

import React, { useEffect, useState } from "react";
import { DailyChallengeFlow, DailyChallengeState } from "../../lib/daily_challenge_flow";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import DailyIntro from "../../components/daily/DailyIntro";
import DailyAvailable from "../../components/daily/DailyAvailable";
import DailyCompleted from "../../components/daily/DailyCompleted";

export default function DailyChallengePage() {
  const [state, setState] = useState<DailyChallengeState | null>(null);
  const [data, setData] = useState<DailyChallengeData | null>(null);
  const [today, setToday] = useState<string>("");

  useEffect(() => {
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

  // Loading state
  if (state === null || data === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  // Render appropriate component based on state
  switch (state) {
    case DailyChallengeState.FIRST_TIME:
      return <DailyIntro onComplete={handleIntroComplete} />;
    
    case DailyChallengeState.DAILY_AVAILABLE:
      return <DailyAvailable data={data} today={today} onGameComplete={handleGameComplete} />;
    
    case DailyChallengeState.DAILY_COMPLETED:
      return <DailyCompleted data={data} today={today} />;
    
    default:
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-xl text-red-600">Unknown state</div>
        </div>
      );
  }
}
