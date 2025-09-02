"use client";

import React from "react";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";

interface DailyCompletedProps {
  data: DailyChallengeData;
}

export default function DailyCompleted({ data }: DailyCompletedProps) {
  const todayResult = data.todayResult;
  const isWin = todayResult === 'won';
  
  const getTimeUntilMidnight = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const diff = tomorrow.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours, minutes };
  };

  const { hours, minutes } = getTimeUntilMidnight();

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
        {/* Result Header */}
        <div className="text-center mb-8">
          <div className={`text-6xl mb-4 ${isWin ? 'text-green-500' : 'text-red-500'}`}>
            {isWin ? '🎉' : '💀'}
          </div>
          <h1 className={`text-3xl font-bold text-center mb-8 ${isWin ? 'text-green-300' : 'text-red-300'}`}>
            {isWin ? 'Victory!' : 'Defeat!'}
          </h1>
          <p className="text-lg text-gray-200">
            {isWin 
              ? 'You successfully escaped the dungeon!' 
              : 'The dungeon claimed another victim...'}
          </p>
        </div>

        {/* Stats Update */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Updated Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Current Streak:</span>
                <span className={`text-2xl font-bold ${isWin ? 'text-green-300' : 'text-red-300'}`}>
                  {data.currentStreak}
                  {isWin && data.currentStreak > 1 && (
                    <span className="text-sm text-green-400 ml-1">🔥</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Total Games:</span>
                <span className="text-lg font-semibold text-gray-200">{data.totalGamesPlayed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Games Won:</span>
                <span className="text-lg font-semibold text-green-300">{data.totalGamesWon}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Win Rate:</span>
                <span className="text-lg font-semibold text-purple-300">
                  {Math.round((data.totalGamesWon / data.totalGamesPlayed) * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Next Challenge</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⏰</span>
                <span className="text-gray-200">
                  {hours}h {minutes}m until reset
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📅</span>
                <span className="text-gray-200">
                  {new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <span className="text-gray-200">Fresh dungeon awaits</span>
              </div>
            </div>
          </div>
        </div>

        {/* Streak Celebration */}
        {isWin && data.currentStreak > 1 && (
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg p-6 mb-8 text-white">
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-2">
                🔥 {data.currentStreak} Day Streak! 🔥
              </h3>
              <p className="text-lg">
                {data.currentStreak < 5 
                  ? "You're on fire! Keep it going!"
                  : data.currentStreak < 10
                  ? "Incredible dedication! You're a dungeon master!"
                  : "Legendary! You've achieved dungeon mastery!"}
              </p>
            </div>
          </div>
        )}

        {/* Recent History */}
        {data.streakHistory.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Your Journey</h2>
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

        {/* Motivational Message */}
        <div className="text-center mb-8">
          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <p className="text-lg text-gray-200 italic">
              {isWin 
                ? data.currentStreak === 1
                  ? "Great start! Come back tomorrow to build your streak."
                  : `Amazing ${data.currentStreak}-day streak! The dungeon fears you.`
                : "Every defeat teaches valuable lessons. Study the dungeon's secrets and return stronger tomorrow."}
            </p>
          </div>
        </div>

        {/* Final Motivational Message */}
        <div className="text-center rounded-lg p-6 border border-gray-600">
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            {isWin ? 'Well Done, Adventurer!' : 'The Adventure Continues...'}
          </h3>
          <p className="text-gray-200 mb-4">
            {isWin 
              ? 'Your courage and skill have served you well today. Rest now, for tomorrow brings new challenges.'
              : 'Every defeat teaches valuable lessons. Study the dungeon&apos;s secrets and return stronger tomorrow.'}
          </p>
        </div>
        <p className="text-sm text-gray-300">
          Return tomorrow for a new dungeon challenge!
        </p>
      </div>
    </div>
  );
}
