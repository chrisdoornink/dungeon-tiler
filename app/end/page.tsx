"use client";

import React, { useEffect, useState } from "react";

type LastGame = {
  completedAt: string;
  hasKey: boolean;
  hasExitKey: boolean;
  hasSword?: boolean;
  hasShield?: boolean;
  showFullMap?: boolean;
  mapData: {
    tiles: number[][];
    subtypes: number[][][];
  };
  outcome?: "win" | "dead";
  stats?: {
    damageDealt: number;
    damageTaken: number;
    enemiesDefeated: number;
  };
};

export default function EndPage() {
  const [last, setLast] = useState<LastGame | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const raw = window.sessionStorage.getItem("lastGame");
        if (raw) {
          setLast(JSON.parse(raw));
        }
      }
    } catch {
      // ignore parse/storage errors
    }
  }, []);

  if (!last) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">No game data found</h1>
          <p className="text-gray-600">Play a game to see your results here.</p>
        </div>
      </div>
    );
  }

  // Map size no longer shown on end screen

  const title = last.outcome === "dead" ? "You died in the dungeon!" : "You escaped the dungeon!";
  const subtitle = last.outcome === "dead" ? "Defeated at" : "Completed at";

  // Build a simple shareable summary using emoji/icons we already use
  const shareLines: string[] = [];
  const dateStr = new Date(last.completedAt).toLocaleDateString();
  shareLines.push(`#Dungeon ${dateStr}`);
  shareLines.push(last.outcome === 'dead' ? '☠️ You died' : '🚪 Escaped!');
  if (last.stats) {
    shareLines.push(`🗡️ dmg: ${last.stats.damageDealt}  🛡️ taken: ${last.stats.damageTaken}  👹 x${last.stats.enemiesDefeated}`);
  }
  // intentionally omit map size from share text
  const shareText = shareLines.join('\n');

  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // ignore share errors
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full text-center text-[#1B1B1B]">
        <h1 className="text-2xl font-semibold mb-2">{title}</h1>
        <p className="text-gray-700 mb-3">{subtitle} {new Date(last.completedAt).toLocaleString()}</p>

        {/* Pickups: show only icons for what the player obtained */}
        <div className="flex items-center justify-center flex-wrap gap-2 mb-4">
          {last.hasKey && (
            <span className="px-2 py-0.5 text-sm bg-[#F1F5F9] rounded">🔑</span>
          )}
          {last.hasExitKey && (
            <span className="px-2 py-0.5 text-sm bg-[#F1F5F9] rounded">🗝️</span>
          )}
          {last.hasSword && (
            <span className="px-2 py-0.5 text-sm bg-[#F1F5F9] rounded">🗡️</span>
          )}
          {last.hasShield && (
            <span className="px-2 py-0.5 text-sm bg-[#F1F5F9] rounded">🛡️</span>
          )}
          {last.showFullMap && (
            <span className="px-2 py-0.5 text-sm bg-[#F1F5F9] rounded">💡</span>
          )}
        </div>

        <div className="text-left text-sm space-y-2">
          {last.stats && (
            <>
              <div className="flex items-baseline justify-between">
                <div className="font-medium">Damage Dealt</div>
                <div>{last.stats.damageDealt}</div>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="font-medium">Damage Taken</div>
                <div>{last.stats.damageTaken}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium">Enemies Defeated</div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(12, last.stats.enemiesDefeated) }).map((_, i) => (
                    <div
                      key={i}
                      aria-label="enemy"
                      title="enemy"
                      className="w-5 h-5"
                      style={{
                        backgroundImage: "url(/images/enemies/fire-goblin/fire-goblin-front.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                  ))}
                  {last.stats.enemiesDefeated > 12 && (
                    <span className="text-xs text-gray-600">+{last.stats.enemiesDefeated - 12}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="my-4">
          <button
            type="button"
            onClick={onShare}
            className="px-4 py-2 rounded-md bg-[#2E7D32] text-white hover:bg-[#256628] transition-colors border-0"
          >
            {copied ? 'copied!' : 'share'}
          </button>
        </div>
      </div>
    </div>
  );
}
