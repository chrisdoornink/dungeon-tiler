import React, { useEffect } from "react";
import type { LeaderboardData } from "../../lib/endless_leaderboard";
import { EndlessLeaderboard } from "./EndlessLeaderboard";

interface LeaderboardPanelProps {
  board: LeaderboardData | null;
  loading: boolean;
  /** Short (8-char) player id of the viewer, to emphasise their own row. */
  highlightPlayerId?: string;
  onClose: () => void;
}

/**
 * The full all-time leaderboard. On mobile it rises as a bottom-sheet flyout; on
 * desktop it's a large centered panel. Body scrolls so it can hold many entries.
 */
export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  board,
  loading,
  highlightPlayerId,
  onClose,
}) => {
  // Close on Escape, matching the app's other overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entries = board?.top ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="endless-leaderboard-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-3xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-lg border border-white/10 bg-neutral-900 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3">
          <h2
            id="endless-leaderboard-title"
            className="text-lg font-bold text-amber-300"
          >
            All-Time Deepest Descents
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/20 bg-white/5 px-3 py-1 text-sm font-medium text-gray-100 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">Loading…</p>
          ) : (
            <EndlessLeaderboard
              entries={entries}
              highlightPlayerId={highlightPlayerId}
              detailed
            />
          )}
        </div>

        {board && board.rank != null && (
          <div className="border-t border-white/10 bg-black/40 px-4 py-3 text-center text-sm text-gray-300">
            You: <span className="text-amber-300 font-semibold">#{board.rank}</span> of{" "}
            {board.totalPlayers} · best Floor {board.bestFloor}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardPanel;
