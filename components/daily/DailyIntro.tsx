"use client";

import React, { useEffect } from "react";
import GameInstructions from "../GameInstructions";
import { trackDailyChallenge } from "../../lib/posthog_analytics";

interface DailyIntroProps {
  onComplete: () => void;
}

export default function DailyIntro({ onComplete }: DailyIntroProps) {
  useEffect(() => {
    trackDailyChallenge('intro_viewed');
  }, []);

  const handleComplete = () => {
    trackDailyChallenge('started');
    onComplete();
  };

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="max-w-4xl mx-auto rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-100">
          Welcome to{" "}
          <div className="text-blue-400 text-4xl font-bold">Torch Boy</div>{" "}
          Daily Dungeon Challenge
        </h1>

        <div
          className="w-36 h-36 mx-auto"
          style={{
            backgroundImage: "url(/images/hero/hero-front-static.png)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        />

        {/* <div className="mt-12 mb-12 text-center">
          <button
            type="button"
            onClick={onComplete}
            className="px-8 py-4 text-xl font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
          >
            Thanks! Im Ready!
          </button>
        </div> */}

        <GameInstructions />

        <div className="mt-12 text-center">
          <button
            type="button"
            onClick={handleComplete}
            className="px-8 py-4 text-xl font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
          >
            I got it, lets play!
          </button>
        </div>
      </div>
    </div>
  );
}
