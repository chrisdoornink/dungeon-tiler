import React from "react";
import type { LeaderboardEntry } from "../../lib/endless_leaderboard";

interface EndlessLeaderboardProps {
  entries: LeaderboardEntry[];
  /** Short (8-char) player id of the viewer, so their own row can be emphasised. */
  highlightPlayerId?: string;
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
 * and every row (independent grids would drift out of alignment).
 */
export const EndlessLeaderboard: React.FC<EndlessLeaderboardProps> = ({
  entries,
  highlightPlayerId,
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
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-xs sm:text-sm border-collapse">
        <thead>
          <tr className="text-gray-500 border-b border-white/10">
            <th className="w-5 pb-1 pr-1 font-normal text-right">#</th>
            <th className="pb-1 font-normal text-left">Player</th>
            <th className="pb-1 pl-1.5 font-normal text-right">Floor</th>
            <th className="pb-1 pl-1.5 font-normal text-right">Steps</th>
            <th className="pb-1 pl-1.5 font-normal text-right">Kills</th>
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
                  className={`py-1 pr-2 max-w-[8rem] truncate ${
                    isMe ? "text-amber-300 font-semibold" : "text-gray-100"
                  }`}
                >
                  {entry.name}
                  {isMe && <span className="text-amber-400/70"> (you)</span>}
                </td>
                <td className="py-1 pl-1.5 text-right tabular-nums whitespace-nowrap text-amber-200">
                  {entry.floor}
                </td>
                <td className="py-1 pl-1.5 text-right tabular-nums whitespace-nowrap text-gray-300">
                  {compactSteps(entry.steps)}
                </td>
                <td className="py-1 pl-1.5 text-right tabular-nums whitespace-nowrap text-gray-300">
                  {fmt(entry.kills)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EndlessLeaderboard;
