// TEST ROOM VERSION - This is the end screen for the test room, not the daily challenge
"use client";

import React, { useEffect, useState } from "react";
import { go } from "../../lib/navigation";
import { getEnemyIcon, enemyKinds, createEmptyByKind, type EnemyKind } from "../../lib/enemies/registry";
import { ScoreCalculator, type ScoreBreakdown } from "../../lib/score_calculator";

type LastGame = {
  completedAt: string;
  hasKey: boolean;
  hasExitKey: boolean;
  hasSword?: boolean;
  hasShield?: boolean;
  showFullMap?: boolean;
  streak?: number;
  heroHealth?: number;
  mapData: {
    tiles: number[][];
    subtypes: number[][][];
  };
  outcome?: "win" | "dead";
  deathCause?: {
    type: 'enemy' | 'faulty_floor';
    enemyKind?: string;
  };
  stats?: {
    damageDealt: number;
    damageTaken: number;
    enemiesDefeated: number;
    steps?: number;
    byKind?: { goblin: number; ghost: number; 'stone-exciter': number };
  };
};

export default function EndPage() {
  const [last, setLast] = useState<LastGame | null>(null);
  const [copied, setCopied] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem("lastGame");
        if (raw) {
          const gameData = JSON.parse(raw);
          setLast(gameData);
          
          // Calculate score breakdown
          if (gameData.stats) {
            const score = ScoreCalculator.calculateScore(
              gameData.outcome || 'dead',
              gameData.heroHealth || 0,
              gameData.stats,
              {
                hasKey: gameData.hasKey,
                hasExitKey: gameData.hasExitKey,
                hasSword: gameData.hasSword,
                hasShield: gameData.hasShield,
                showFullMap: gameData.showFullMap,
              }
            );
            setScoreBreakdown(score);
          }
        }
      }
    } catch {
      // ignore parse/storage errors
    }
  }, []);

  if (!last) {
    return (
      <div 
        className="flex min-h-screen items-center justify-center p-6"
        style={{
          backgroundImage: "url(/images/presentational/wall-up-close.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "auto"
        }}
      >
        <div className="max-w-4xl mx-auto rounded-lg shadow-xl p-8">
          <h1 className="text-2xl font-semibold mb-2 text-gray-100">No game data found</h1>
          <p className="text-gray-200">Play a game to see your results here.</p>
        </div>
      </div>
    );
  }

  // Map size no longer shown on end screen

  const title = last.outcome === "dead" ? "You died in the dungeon!" : "You escaped the dungeon!";
  const subtitle = last.outcome === "dead" ? "Defeated at" : "Completed at";

  // Death cause specific messages and images
  const getDeathDetails = () => {
    if (last.outcome !== "dead" || !last.deathCause) return null;
    
    switch (last.deathCause.type) {
      case 'faulty_floor':
        return {
          message: "You stepped on a crack and fell into the abyss",
          image: "/images/floor/crack3.png",
          alt: "Floor crack"
        };
      case 'enemy':
        const enemyKind = last.deathCause.enemyKind || 'goblin';
        let enemyImage = "/images/enemies/fire-goblin/fire-goblin-front.png";
        let enemyName = "a goblin";
        
        if (enemyKind === 'ghost') {
          enemyImage = "/images/enemies/ghost/ghost-front.png";
          enemyName = "a ghost";
        } else if (enemyKind === 'stone-exciter') {
          enemyImage = "/images/enemies/stone-exciter/stone-exciter-front.png";
          enemyName = "a stone exciter";
        }
        
        return {
          message: `You were slain by ${enemyName}`,
          image: enemyImage,
          alt: enemyName
        };
      default:
        return null;
    }
  };

  const deathDetails = getDeathDetails();

  // Build shareable summary in the new requested format
  const shareLines: string[] = [];
  const dateStr = new Date(last.completedAt).toLocaleDateString('en-CA');
  // Header
  shareLines.push(`#TorchBoy ${dateStr}`);
  // Stats line: outcome, death cause, steps, damage, score
  const outcomeEmoji = last.outcome === 'dead' ? '💀' : '🏆';
  const deathEmoji = last.outcome === 'dead' && last.deathCause
    ? (last.deathCause.type === 'faulty_floor'
        ? '🕳️'
        : last.deathCause.type === 'enemy'
        ? (({
            ghost: '👻',
            goblin: '👹',
            'stone-exciter': '🗿',
          } as Record<string, string>)[last.deathCause.enemyKind || 'goblin'] || '👹')
        : '')
    : '';
  const stepsPart = typeof last.stats?.steps === 'number' ? `👣 ${last.stats!.steps}` : '';
  const dmgPart = typeof last.stats?.damageDealt === 'number' && typeof last.stats?.damageTaken === 'number'
    ? `💥 +${last.stats!.damageDealt} -${last.stats!.damageTaken}`
    : '';
  const scorePart = scoreBreakdown ? `${ScoreCalculator.getScoreEmoji(scoreBreakdown.grade)} ${scoreBreakdown.grade} (${scoreBreakdown.percentage}%)` : '';
  shareLines.push([outcomeEmoji, deathEmoji, scorePart, stepsPart, dmgPart].filter(Boolean).join(' '));
  // Streak line
  const streakVal = typeof last.streak === 'number' ? last.streak : 0;
  shareLines.push(`🔥 streak: ${streakVal}`);
  // Kills line
  const enemyChunks: string[] = [];
  if (last.stats?.byKind) {
    Object.entries(last.stats.byKind as Record<string, number>).forEach(([enemyType, count]) => {
      const n = typeof count === 'number' ? count : 0;
      if (n > 0) {
        const emoji = ({ ghost: '👻', goblin: '👹', 'stone-exciter': '🗿' } as Record<string, string>)[enemyType] || '👹';
        enemyChunks.push(emoji.repeat(n));
      }
    });
  }
  shareLines.push(`⚔️ kills: ${enemyChunks.join('')}`);
  // Inventory line
  const items: string[] = [];
  if (last.hasKey) items.push('🔑');
  if (last.hasExitKey) items.push('🗝️');
  if (last.hasSword) items.push('🗡️');
  if (last.hasShield) items.push('🛡️');
  shareLines.push(`🗃️ inventory: ${items.join('')}`);
  // Health line (default to empty if unknown)
  const health = typeof last.heroHealth === 'number' ? last.heroHealth : 0;
  const healthTiles: string[] = [];
  for (let i = 1; i <= 5; i++) {
    healthTiles.push(i <= health ? '🟩' : '⬜');
  }
  shareLines.push(healthTiles.join(''));
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
    <div 
      className="flex min-h-screen items-center justify-center p-6"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto"
      }}
    >
      <div className="w-full max-w-4xl space-y-6">
        {/* Main Game Statistics Box - Centered and Larger */}
        <div data-testid="game-statistics-box" className="rounded-lg shadow-xl p-8 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-semibold mb-2 text-gray-100">{title}</h1>
        <p className="text-gray-200 mb-3">{subtitle} {new Date(last.completedAt).toLocaleString()}</p>

        {/* Death cause specific subtitle with image */}
        {deathDetails && (
          <div className="flex items-center justify-center gap-3 mb-4 p-3 rounded-lg border border-red-400">
            <div
              className="w-8 h-8 flex-shrink-0"
              style={{
                backgroundImage: `url(${deathDetails.image})`,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
              aria-label={deathDetails.alt}
            />
            <p className="text-red-300 text-sm font-medium">{deathDetails.message}</p>
          </div>
        )}

        {/* Pickups: show only icons for what the player obtained */}
        <div className="flex items-center justify-center flex-wrap gap-2 mb-4">
          {last.hasKey && (
            <span className="px-2 py-0.5 text-sm bg-gray-700 text-gray-100 rounded">🔑</span>
          )}
          {last.hasExitKey && (
            <span className="px-2 py-0.5 text-sm bg-gray-700 text-gray-100 rounded">🗝️</span>
          )}
          {last.hasSword && (
            <span className="px-2 py-0.5 text-sm bg-gray-700 text-gray-100 rounded">🗡️</span>
          )}
          {last.hasShield && (
            <span className="px-2 py-0.5 text-sm bg-gray-700 text-gray-100 rounded">🛡️</span>
          )}
          {last.showFullMap && (
            <span className="px-2 py-0.5 text-sm bg-gray-700 text-gray-100 rounded">💡</span>
          )}
        </div>

        <div className="text-left text-sm space-y-2 text-gray-200">
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
              {typeof last.stats.steps === 'number' && (
                <div className="flex items-baseline justify-between">
                  <div className="font-medium">Steps</div>
                  <div>{last.stats.steps}</div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="font-medium">Enemies Defeated</div>
                {(() => {
                  const by: Record<EnemyKind, number> = (last.stats?.byKind as Record<EnemyKind, number>) || createEmptyByKind();
                  const items: Array<{ key: EnemyKind; count: number; src: string; title: string }>= enemyKinds.map((k: EnemyKind) => ({
                    key: k,
                    count: by[k] || 0,
                    src: getEnemyIcon(k, 'front'),
                    title: k,
                  }));
                  const visible = items.filter(i => i.count > 0);
                  const fallbackTotal = last.stats?.enemiesDefeated || 0;
                  return (
                    <div className="flex items-center gap-2">
                      {visible.length === 0 ? (
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(12, fallbackTotal) }).map((_, i) => (
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
                          {fallbackTotal > 12 && (
                            <span className="text-xs text-gray-600">+{fallbackTotal - 12}</span>
                          )}
                        </div>
                      ) : (
                        visible.map((i) => (
                          <div key={i.key} className="flex items-center gap-1">
                            {Array.from({ length: Math.min(6, i.count) }).map((_, idx) => (
                              <div
                                key={`${i.key}-${idx}`}
                                aria-label={i.title}
                                title={i.title}
                                className="w-5 h-5"
                                style={{
                                  backgroundImage: `url(${i.src})`,
                                  backgroundSize: "contain",
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "center",
                                }}
                              />
                            ))}
                            {i.count > 6 && (
                              <span className="text-xs text-gray-600">+{i.count - 6}</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
          {scoreBreakdown && (
            <div className="border-t border-gray-700 pt-3 mt-3">
              <div className="flex items-baseline justify-between mb-2">
                <div className="font-medium">Final Score</div>
                <div className="flex items-center gap-2">
                  <span>{ScoreCalculator.getScoreEmoji(scoreBreakdown.grade)}</span>
                  <span className="font-bold">{scoreBreakdown.grade}</span>
                  <span className="text-sm text-gray-400">({scoreBreakdown.percentage}%)</span>
                </div>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <div>Total Points</div>
                <div className="font-mono">{scoreBreakdown.totalScore.toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>

        {/* Inventory Collected Section */}
        <div className="mt-4 text-left text-sm text-gray-200 border-t border-gray-700 pt-4">
          <div className="font-medium mb-2">Inventory Collected</div>
          {(() => {
            const inv: Array<{ emoji: string; label: string }>= [];
            if (last.hasKey) inv.push({ emoji: '🔑', label: 'Key' });
            if (last.hasExitKey) inv.push({ emoji: '🗝️', label: 'Exit Key' });
            if (last.hasSword) inv.push({ emoji: '🗡️', label: 'Sword' });
            if (last.hasShield) inv.push({ emoji: '🛡️', label: 'Shield' });
            if (last.showFullMap) inv.push({ emoji: '💡', label: 'Map Reveal' });
            if (inv.length === 0) {
              return <div className="text-gray-400">None</div>;
            }
            return (
              <ul className="grid grid-cols-2 gap-y-1 gap-x-4">
                {inv.map((i, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span>{i.emoji}</span>
                    <span>{i.label}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>

        {/* Share Results button inside Game Statistics box */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => go('/')}
            className="px-4 py-2 rounded-md bg-[#0D47A1] text-white hover:bg-[#0b3a82] transition-colors border-0"
          >
            play again
          </button>
          <button
            type="button"
            onClick={onShare}
            className="px-4 py-2 rounded-md bg-[#2E7D32] text-white hover:bg-[#256628] transition-colors border-0"
          >
            {copied ? 'copied!' : 'share'}
          </button>
        </div>
        </div>

        {/* Individual Stats List - Simple list below Game Statistics box */}
        <div data-testid="individual-stats-list" className="max-w-2xl mx-auto">
          <div className="text-left text-sm space-y-3 text-gray-200">
            {typeof last.streak === 'number' && (
              <div className="flex items-baseline justify-between py-2 border-b border-gray-700">
                <div className="font-medium">Current Streak</div>
                <div className="text-lg">{last.streak}</div>
              </div>
            )}
            {/* Add more individual stats here as needed */}
          </div>
        </div>
      </div>
    </div>
  );
}
