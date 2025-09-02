"use client";

import React from "react";
import GameInstructions from "../GameInstructions";

interface DailyIntroProps {
  onComplete: () => void;
}

export default function DailyIntro({ onComplete }: DailyIntroProps) {
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
          Welcome to the Daily Dungeon Challenge
        </h1>

        <div className="mt-12 mb-12 text-center">
          <button
            type="button"
            onClick={onComplete}
            className="px-8 py-4 text-xl font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
          >
            Begin Your Daily Challenge
          </button>
        </div>

        <GameInstructions />

        <div className="bg-black/50 border-l-4 border-blue-400 p-4 my-6 rounded">
          <h3 className="text-lg font-semibold text-blue-300 mb-2">
            Daily Challenge Rules
          </h3>
          <ul className="text-blue-200 space-y-1">
            <li>
              • You get <strong>one attempt per day</strong>
            </li>
            <li>• Build your streak by winning consecutive days</li>
            <li>• Losing a game resets your streak</li>
            <li>• Return tomorrow for a new challenge!</li>
          </ul>
        </div>

        <div className="mt-12 text-center">
          <button
            type="button"
            onClick={onComplete}
            className="px-8 py-4 text-xl font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
          >
            Begin Your Daily Challenge
          </button>
        </div>
      </div>
    </div>
  );
}
