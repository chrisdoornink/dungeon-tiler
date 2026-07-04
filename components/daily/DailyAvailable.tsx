"use client";

import React from "react";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import SiteFooter from "../SiteFooter";

interface DailyAvailableProps {
  data: DailyChallengeData;
  today: string;
  onGameComplete?: (result: "won" | "lost") => void;
  onStart?: () => void;
  /**
   * First-run variant: rendered for players with no prior local storage. Same
   * Start screen, but it leads with a guided first run instead of dropping
   * straight into the daily. The progress panel is hidden (nothing to show).
   */
  firstTime?: boolean;
  /** First-run only: take the player into the guided run (`/new`). */
  onGuideMe?: () => void;
}

export default function DailyAvailable({
  data,
  onStart,
  firstTime = false,
  onGuideMe,
}: DailyAvailableProps) {
  const handleStartGame = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("dailyMode", "true");
      }
    } catch {
      // ignore storage failures
    }
    onStart?.();
  };

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="min-h-screen flex flex-col px-4 py-5 sm:py-8"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col justify-center gap-6 sm:gap-8">
        {/* Header */}
        <header className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-400">
            Torch Boy
          </h1>
          <div
            className="w-14 h-14 sm:w-20 sm:h-20 mx-auto my-3 sm:my-4"
            style={{
              backgroundImage: "url(/images/hero/hero-front-static.png)",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          />
          <h2 className="text-base sm:text-xl font-bold text-gray-100 leading-snug">
            Daily Dungeon Challenge
          </h2>
          <p className="text-xs sm:text-sm text-gray-300 mt-2">{today}</p>
        </header>

        {firstTime ? (
          /* First-run fork: lead with the guided run, offer a skip for
             players who already know the ropes. The pb clearance keeps the
             skip link from colliding with the fixed bottom-left help/feedback
             buttons on short phone screens. */
          <div className="text-center pb-24">
            <p className="text-base sm:text-lg text-gray-200 mb-2 leading-snug">
              First time in the dungeon?
            </p>
            <p className="text-[11px] sm:text-sm text-gray-400 mb-6 leading-relaxed">
              Your first run is a guided one — we&apos;ll walk you through
              moving, fighting, and grabbing loot, then hand you the rest of
              today&apos;s challenge.
            </p>

            <button
              type="button"
              onClick={onGuideMe}
              className="px-8 py-4 text-lg sm:text-xl font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
            >
              Guide Me
            </button>

            <div className="mt-5">
              <button
                type="button"
                onClick={handleStartGame}
                className="text-[11px] sm:text-sm text-gray-400 underline underline-offset-4 hover:text-gray-200 transition-colors leading-relaxed"
              >
                I&apos;ve played before — skip the guide
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Call to Action */}
            <div className="text-center">
              <p className="text-sm sm:text-lg text-gray-200 mb-4 sm:mb-6 leading-snug">
                Ready to take on today&apos;s challenge?
              </p>

              <button
                type="button"
                onClick={handleStartGame}
                className="px-10 py-4 text-lg sm:text-xl font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
              >
                Start
              </button>
            </div>

            {/* Stats Panel */}
            <div className="bg-black/50 rounded-lg p-4 sm:p-6 border border-gray-600">
              <h2 className="text-sm sm:text-lg font-semibold text-gray-100 mb-3 sm:mb-4">
                Your Progress
              </h2>
              <div className="space-y-2.5 sm:space-y-3 text-xs sm:text-base">
                {data.currentStreak > 1 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Current Streak</span>
                    <span className="font-bold text-blue-300">
                      {data.currentStreak}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Total Games</span>
                  <span className="font-semibold text-gray-200">
                    {data.totalGamesPlayed}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Games Won</span>
                  <span className="font-semibold text-gray-200">
                    {data.totalGamesWon}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Win Rate</span>
                  <span className="font-semibold text-gray-200">
                    {data.totalGamesPlayed > 0
                      ? `${Math.round(
                          (data.totalGamesWon / data.totalGamesPlayed) * 100
                        )}%`
                      : "0%"}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
