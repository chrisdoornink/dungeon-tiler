import React from "react";
import type { LeaderboardEntry } from "../../lib/endless_leaderboard";

interface EndlessLeaderboardProps {
  entries: LeaderboardEntry[];
  /** Short (8-char) player id of the viewer, so their own row can be emphasised. */
  highlightPlayerId?: string;
  /**
   * Show the Steps/Kills detail columns. Off by default: the compact inline
   * board (start + game-over cards, narrow on mobile) shows only rank, name,
   * and floor. The full-leaderboard panel is wide enough for the detail, so it
   * opts in. This keeps every row inside the card width — no horizontal scroll.
   */
  detailed?: boolean;
  className?: string;
}

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "–" : n.toLocaleString();

// Compact step counts so the column stays narrow: <1000 verbatim, then k-notation
// (1000 -> "1k", 1800 -> "1.8k", 2956 -> "2.9k", 33000 -> "33k"). Floored, never rounded
// up, so a count never reads higher than it is.
const compactSteps = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "–";
  if (n < 1000) return String(n);
  const k = n / 1000;
  if (k < 10) {
    const oneDec = Math.floor(k * 10) / 10;
    return `${Number.isInteger(oneDec) ? oneDec : oneDec.toFixed(1)}k`;
  }
  return `${Math.floor(k)}k`;
};

/**
 * The ranked all-time descent list, shared by the start screen, the game-over
 * screen, and the full-leaderboard panel. Each row is one player's best run:
 * deepest floor reached, plus the steps taken and enemies killed on that run.
 *
 * A real <table> keeps the Floor/Steps/Kills columns aligned between the header
 * and every row (independent grids would drift out of alignment). It uses a
 * FIXED layout with a flexible Player column so a long name truncates in place
 * — the row never widens past the card, so there is never a horizontal scroll.
 */
export const EndlessLeaderboard: React.FC<EndlessLeaderboardProps> = ({
  entries,
  highlightPlayerId,
  detailed = false,
  className = "",
}) => {
  if (entries.length === 0) {
    return (
      <p className="text-gray-400 text-sm text-center">
        No descents recorded yet. Be the first.
      </p>
    );
  }

  return (
    <div className={className}>
      <table className="w-full table-fixed text-xs sm:text-sm border-collapse">
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-20" />
          {detailed && <col className="w-20" />}
          {detailed && <col className="w-20" />}
        </colgroup>
        <thead>
          <tr className="text-gray-500 border-b border-white/10">
            <th className="pb-1 pr-1 font-normal text-right">#</th>
            <th className="pb-1 font-normal text-left">Player</th>
            <th className="pb-1 pl-1.5 font-normal text-right">Floor</th>
            {detailed && (
              <th className="pb-1 pl-1.5 font-normal text-right">Steps</th>
            )}
            {detailed && (
              <th className="pb-1 pl-1.5 font-normal text-right">Kills</th>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const isMe =
              !!highlightPlayerId && entry.playerId === highlightPlayerId;
            return (
              <tr
                key={`${entry.playerId}-${i}`}
                className={isMe ? "bg-amber-500/10" : ""}
              >
                <td className="py-1 pr-1 text-right tabular-nums text-gray-500">
                  {i + 1}
                </td>
                <td
                  className={`py-1 pr-2 ${
                    isMe ? "text-amber-300 font-semibold" : "text-gray-100"
                  }`}
                >
                  {/* min-w-0 lets the name span shrink so truncate engages; the
                      "(you)" tag never shrinks and so is never clipped. */}
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="truncate">{entry.name}</span>
                    {isMe && (
                      <span className="shrink-0 text-amber-400/70">(you)</span>
                    )}
                  </div>
                </td>
                <td className="py-1 pl-1.5 text-right tabular-nums whitespace-nowrap text-amber-200">
                  {entry.floor}
                </td>
                {detailed && (
                  <td className="py-1 pl-1.5 text-right tabular-nums whitespace-nowrap text-gray-300">
                    {compactSteps(entry.steps)}
                  </td>
                )}
                {detailed && (
                  <td className="py-1 pl-1.5 text-right tabular-nums whitespace-nowrap text-gray-300">
                    {fmt(entry.kills)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EndlessLeaderboard;
