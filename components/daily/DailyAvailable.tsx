"use client";

import React from "react";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import { go } from "../../lib/navigation";

interface DailyAvailableProps {
  data: DailyChallengeData;
  today: string;
  onGameComplete?: (result: 'won' | 'lost') => void;
}

export default function DailyAvailable({ data, today }: DailyAvailableProps) {
  const handleStartGame = () => {
    // Navigate to the main game with daily challenge mode
    // We'll need to modify the main game to accept daily challenge callbacks
    go('/?daily=true');
  };

  return (
    <div 
      className="min-h-screen py-8 px-4"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto"
      }}
    >
      <div className="max-w-4xl mx-auto rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-100">
          Today&apos;s Dungeon Challenge
        </h1>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Stats Panel */}
          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Your Progress</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Current Streak</span>
                <span className="font-bold text-lg text-blue-300">{data.currentStreak}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Total Games</span>
                <span className="font-semibold text-gray-200">{data.totalGamesPlayed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Games Won</span>
                <span className="font-semibold text-gray-200">{data.totalGamesWon}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Win Rate</span>
                <span className="font-semibold text-gray-200">
                  {data.totalGamesPlayed > 0 
                    ? `${Math.round((data.totalGamesWon / data.totalGamesPlayed) * 100)}%`
                    : '0%'
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Rules Panel */}
          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Daily Challenge Rules</h2>
            <ul className="text-gray-200 space-y-2 text-sm">
              <li>• One attempt per day</li>
              <li>• No replays until tomorrow</li>
              <li>• Build your streak by playing daily</li>
              <li>• Miss a day and your streak resets</li>
            </ul>
          </div>

          {/* Challenge Info */}
          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Today&apos;s Challenge</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📅</span>
                <span className="text-gray-200">{new Date(today).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <span className="text-gray-200">One attempt only</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                <span className="text-gray-200">Build your streak</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">⏰</span>
                <span className="text-gray-200">Resets at midnight</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent History */}
        {data.streakHistory.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Recent History</h2>
            <div className="bg-black/50 rounded-lg p-4 border border-gray-600">
              <div className="flex gap-2 overflow-x-auto">
                {data.streakHistory.slice(-10).map((entry, index) => (
                  <div
                    key={index}
                    className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-semibold ${
                      entry.result === 'won' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    title={`${entry.date}: ${entry.result} (streak: ${entry.streak})`}
                  >
                    {entry.result === 'won' ? '✓' : '✗'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="text-center">
          <div className="mb-6">
            <p className="text-lg text-gray-200 mb-2">
              Ready to take on today&apos;s challenge?
            </p>
            <p className="text-sm text-gray-300">
              Remember: you only get one shot!
            </p>
          </div>
          
          <button
            type="button"
            onClick={handleStartGame}
            className="px-8 py-4 text-xl font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors shadow-lg"
          >
            Start Today&apos;s Challenge
          </button>
        </div>
      </div>
    </div>
  );
}
