"use client";

import React from "react";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";

interface DailyCompletedProps {
  data: DailyChallengeData;
  today: string;
}

export default function DailyCompleted({ data, today }: DailyCompletedProps) {
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8">
        {/* Result Header */}
        <div className="text-center mb-8">
          <div className={`text-6xl mb-4 ${isWin ? 'text-green-500' : 'text-red-500'}`}>
            {isWin ? '🎉' : '💀'}
          </div>
          <h1 className={`text-3xl font-bold mb-4 ${isWin ? 'text-green-700' : 'text-red-700'}`}>
            {isWin ? 'Victory!' : 'Defeat!'}
          </h1>
          <p className="text-lg text-gray-600">
            {isWin 
              ? 'You successfully escaped the dungeon!' 
              : 'The dungeon claimed another victim...'}
          </p>
        </div>

        {/* Stats Update */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Updated Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Current Streak:</span>
                <span className={`text-2xl font-bold ${isWin ? 'text-green-600' : 'text-red-600'}`}>
                  {data.currentStreak}
                  {isWin && data.currentStreak > 1 && (
                    <span className="text-sm text-green-500 ml-1">🔥</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Games:</span>
                <span className="text-lg font-semibold text-gray-800">{data.totalGamesPlayed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Games Won:</span>
                <span className="text-lg font-semibold text-green-600">{data.totalGamesWon}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Win Rate:</span>
                <span className="text-lg font-semibold text-purple-600">
                  {Math.round((data.totalGamesWon / data.totalGamesPlayed) * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Next Challenge</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⏰</span>
                <span className="text-gray-700">
                  {hours}h {minutes}m until reset
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📅</span>
                <span className="text-gray-700">
                  {new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <span className="text-gray-700">Fresh dungeon awaits</span>
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
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Your Journey</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex gap-2 overflow-x-auto">
                {data.streakHistory.slice(-10).map((entry, index) => (
                  <div
                    key={index}
                    className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-semibold ${
                      entry.result === 'won' ? 'bg-green-500' : 'bg-red-500'
                    } ${entry.date === today ? 'ring-4 ring-blue-400' : ''}`}
                    title={`${entry.date}: ${entry.result} (streak: ${entry.streak})`}
                  >
                    {entry.result === 'won' ? '✓' : '✗'}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-2 text-center">
                Today&apos;s result is highlighted
              </p>
            </div>
          </div>
        )}

        {/* Motivational Message */}
        <div className="text-center bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            {isWin ? 'Well Done, Adventurer!' : 'The Adventure Continues...'}
          </h3>
          <p className="text-gray-600 mb-4">
            {isWin 
              ? 'Your courage and skill have served you well today. Rest now, for tomorrow brings new challenges.'
              : 'Every defeat teaches valuable lessons. Study the dungeon&apos;s secrets and return stronger tomorrow.'}
          </p>
          <p className="text-sm text-gray-500">
            Return tomorrow for a new dungeon challenge!
          </p>
        </div>
      </div>
    </div>
  );
}
