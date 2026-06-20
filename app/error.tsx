"use client";

import React, { useEffect } from "react";

/**
 * App-level error boundary. If anything inside the game throws at runtime in
 * production, this renders a branded, recoverable fallback instead of an
 * unrecoverable blank screen. `reset()` re-renders the segment; the Restart
 * link is a hard fallback back to the daily home.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the console for debugging (kept in prod — removeConsole
    // excludes error) without exposing details to the player.
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center text-white"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div
        className="w-20 h-20"
        style={{
          backgroundImage: "url(/images/hero/hero-front-static.png)",
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
        aria-hidden
      />
      <h1 className="text-2xl font-bold text-blue-400">Torch Boy</h1>
      <p className="text-lg text-gray-200 max-w-md">
        Something went wrong in the dungeon. Your torch flickered out for a
        moment.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-lg"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={() => {
            // Hard navigation fully resets the app out of the errored state.
            window.location.href = "/";
          }}
          className="px-6 py-3 rounded-lg border border-gray-500 text-gray-200 font-semibold hover:bg-white/10 transition-colors"
        >
          Restart
        </button>
      </div>
    </div>
  );
}
