"use client";

import React, { useState, useEffect } from "react";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import { trackDailyChallenge } from "../../lib/posthog_analytics";
import {
  ScoreCalculator,
  type ScoreBreakdown,
} from "../../lib/score_calculator";
// Using localStorage directly instead of separate module

// Emoji translation map for game entities
const EMOJI_MAP = {
  // Game outcome
  win: "🏆",
  death: "💀",

  // Items/pickups
  key: "🔑",
  exitKey: "🗝️",
  sword: "🗡️",
  shield: "🛡️",
  map: "🗺️",

  // Enemies
  goblin: "👹",
  ghost: "👻",
  "stone-exciter": "🗿",

  // Stats
  damage: "⚔️",
  health: "❤️",
  steps: "👣",

  // Health visualization
  health_full: "🟩", // 5 health
  health_good: "🟩", // 4 health
  health_ok: "🟨", // 3 health
  health_low: "🟧", // 2 health
  health_critical: "🟥", // 1 health

  // Death causes
  faulty_floor: "🕳️",

  // Streak indicators
  streak_fire: "🔥",

  // Result indicators (like Wordle)
  win_square: "🟩",
  loss_square: "🟥",
} as const;

interface DailyCompletedProps {
  data: DailyChallengeData;
}

export default function DailyCompleted({ data }: DailyCompletedProps) {
  const todayResult = data.todayResult;
  const isWin = todayResult === "won";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    trackDailyChallenge("completed", {
      outcome: isWin ? "win" : "loss",
      streak: data.currentStreak,
      total_games: data.totalGamesPlayed,
      win_rate: Math.round((data.totalGamesWon / data.totalGamesPlayed) * 100),
    });
  }, [isWin, data.currentStreak, data.totalGamesPlayed, data.totalGamesWon]);

  // Get death details from last game result stored in localStorage
  const getLastGame = () => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("lastGame");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const lastGame = getLastGame();
  // Compute score breakdown using the same logic as end game screen
  const scoreBreakdown: ScoreBreakdown | null = lastGame?.stats
    ? ScoreCalculator.calculateScore(
        isWin ? "win" : "dead",
        lastGame.heroHealth || 0,
        lastGame.stats,
        {
          hasKey: !!lastGame.hasKey,
          hasExitKey: !!lastGame.hasExitKey,
          hasSword: !!lastGame.hasSword,
          hasShield: !!lastGame.hasShield,
          showFullMap: !!lastGame.showFullMap,
        }
      )
    : null;
  const getDeathDetails = () => {
    if (
      isWin ||
      !lastGame ||
      lastGame.outcome !== "dead" ||
      !lastGame.deathCause
    )
      return null;

    switch (lastGame.deathCause.type) {
      case "faulty_floor":
        return {
          message: "You stepped on a crack and fell into the abyss",
          image: "/images/floor/crack3.png",
          alt: "Floor crack",
        };
      case "enemy":
        const enemyKind = lastGame.deathCause.enemyKind || "goblin";
        let enemyImage = "/images/enemies/fire-goblin/fire-goblin-front.png";
        let enemyName = "a goblin";

        if (enemyKind === "ghost") {
          enemyImage = "/images/enemies/lantern-wisp.png";
          enemyName = "a ghost";
        } else if (enemyKind === "stone-exciter") {
          enemyImage = "/images/enemies/stone-exciter-front.png";
          enemyName = "a stone exciter";
        }

        return {
          message: `You were slain by ${enemyName}`,
          image: enemyImage,
          alt: enemyName,
        };
      default:
        return null;
    }
  };

  const deathDetails = getDeathDetails();

  // Generate shareable text in Wordle/Rogule style
  const generateShareText = () => {
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD format
    const lines: string[] = [];

    // Header
    lines.push(`#TorchBoy ${today}`);

    // Result and basic stats
    const resultEmoji = isWin ? EMOJI_MAP.win : EMOJI_MAP.death;
    // If player died, add emoji for cause of death (enemy kind or faulty floor)
    const deathEmoji =
      !isWin && lastGame?.deathCause
        ? lastGame.deathCause.type === "faulty_floor"
          ? EMOJI_MAP.faulty_floor
          : lastGame.deathCause.type === "enemy"
          ? EMOJI_MAP[
              (lastGame.deathCause.enemyKind as keyof typeof EMOJI_MAP) ??
                "goblin"
            ] || EMOJI_MAP.goblin
          : ""
        : "";
    const scorePart = scoreBreakdown
      ? `${ScoreCalculator.getScoreEmoji(scoreBreakdown.grade)} ${
          scoreBreakdown.grade
        } (${scoreBreakdown.percentage}%)`
      : "";
    const statsLine = [
      `${resultEmoji}`,
      deathEmoji,
      scorePart,
      lastGame?.stats?.steps
        ? `${EMOJI_MAP.steps} ${lastGame.stats.steps}`
        : "",
      lastGame?.stats?.damageDealt
        ? `💥 +${lastGame.stats.damageDealt} -${lastGame.stats.damageTaken}`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(statsLine);

    // Streak
    lines.push(`${EMOJI_MAP.streak_fire} streak: ${data.currentStreak}`);

    // Kills line (by enemy kind, repeated emoji)
    const enemyChunks: string[] = [];
    if (lastGame?.stats?.byKind) {
      Object.entries(lastGame.stats.byKind).forEach(([enemyType, count]) => {
        let numCount = typeof count === "number" ? count : 0;

        // CONSERVATIVE PATCH: Cap stone-exciter kills at 2 to prevent inflated display
        // This addresses a known bug where stone-exciter kills can be double-counted
        if (enemyType === "stone-exciter" && numCount >= 2) {
          numCount = numCount / 2;
        }

        if (numCount > 0) {
          const emoji =
            EMOJI_MAP[enemyType as keyof typeof EMOJI_MAP] || EMOJI_MAP.goblin;
          enemyChunks.push(emoji.repeat(numCount));
        }
      });
    }
    lines.push(`⚔️ kills: ${enemyChunks.join("")}`);

    // Inventory line
    const items: string[] = [];
    if (lastGame?.hasKey) items.push(EMOJI_MAP.key);
    if (lastGame?.hasExitKey) items.push(EMOJI_MAP.exitKey);
    if (lastGame?.hasSword) items.push(EMOJI_MAP.sword);
    if (lastGame?.hasShield) items.push(EMOJI_MAP.shield);
    lines.push(`🗃️ inventory: ${items.join("")}`);

    // Health visualization (5 hearts showing final health). Default to empty if unknown.
    const health =
      typeof lastGame?.heroHealth === "number" ? lastGame!.heroHealth : 0;
    const healthTiles: string[] = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= health) {
        healthTiles.push("❤️"); // Filled heart for remaining health
      } else {
        healthTiles.push("🤍"); // Empty heart for lost health
      }
    }
    lines.push(healthTiles.join(""));

    // A link to the game at torchboy.com
    lines.push("\n#TorchBoy https://torchboy.com");

    return lines.join("\n");
  };

  const onShare = async () => {
    const shareText = generateShareText();
    try {
      if (navigator.clipboard) {
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
      className="min-h-screen py-8 px-4"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Main Game Statistics Box - Centered and Larger */}
        <div
          data-testid="game-statistics-box"
          className="rounded-lg shadow-xl p-8 max-w-2xl mx-auto"
        >
          {/* Result Header */}
          <div className="text-center mb-8">
            <div
              data-testid={isWin ? "victory-asset" : "defeat-asset"}
              className={`w-24 h-24 mx-auto mb-4`}
              style={{
                backgroundImage: isWin
                  ? "url(/images/presentational/game-over-win-1.png)"
                  : `url(/images/presentational/game-over-loss-${
                      Math.random() < 0.5 ? "1" : "2"
                    }.png)`,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
              aria-label={isWin ? "Victory trophy" : "Defeat skull"}
            />
            <h1
              className={`text-3xl font-bold text-center mb-8 ${
                isWin ? "text-green-300" : "text-red-300"
              }`}
            >
              {isWin ? "Victory!" : "Defeat!"}
            </h1>
            <p className="text-lg text-gray-200">
              {isWin
                ? `You escaped the dungeon! The realm celebrates your victory.`
                : `The dungeon has claimed another victim. Your adventure ends here.`}
            </p>
            <p className="text-sm text-gray-300 text-center mt-4">
              Return tomorrow for a new dungeon challenge!
            </p>
            {/* Death cause specific details */}
            {deathDetails && (
              <div className="flex items-center justify-center gap-3 mt-4 p-3 rounded-lg border border-red-400">
                <div
                  className="w-12 h-12 flex-shrink-0"
                  style={{
                    backgroundImage: `url(${deathDetails.image})`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                  aria-label={deathDetails.alt}
                />
                <p className="text-red-300 text-sm font-medium">
                  {deathDetails.message}
                </p>
              </div>
            )}
          </div>

          {/* Game Statistics Section */}
          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            {/* <h2 className="text-xl font-semibold text-gray-100 mb-4 text-center">
              Game Statistics
            </h2> */}

            {lastGame && lastGame.stats ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Steps Taken:</span>
                  <span className="text-lg font-semibold text-gray-200">
                    {lastGame.stats.steps || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Damage Dealt:</span>
                  <span className="text-lg font-semibold text-green-300">
                    {lastGame.stats.damageDealt}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Damage Taken:</span>
                  <span className="text-lg font-semibold text-red-300">
                    {lastGame.stats.damageTaken}
                  </span>
                </div>
                {/* Removed numeric Enemies Defeated row per request */}
                {lastGame.stats.byKind && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Enemies defeated:</span>
                      <span className="flex flex-wrap gap-1">
                        {Object.entries(lastGame.stats.byKind).map(
                          ([enemyType, count]) => {
                            let numCount =
                              typeof count === "number" ? count : 0;

                            // CONSERVATIVE PATCH: Cap stone-exciter kills at 2 to prevent inflated display
                            // This addresses a known bug where stone-exciter kills can be double-counted
                            if (
                              enemyType === "stone-exciter" &&
                              numCount >= 2
                            ) {
                              numCount = numCount / 2;
                            }

                            const enemies: React.ReactElement[] = [];
                            for (let i = 0; i < numCount; i++) {
                              enemies.push(
                                <div
                                  key={`${enemyType}-${i}`}
                                  className="w-6 h-6"
                                  style={{
                                    backgroundImage: `url(/images/enemies/${
                                      enemyType === "stone-exciter"
                                        ? "stone-exciter-front"
                                        : enemyType === "ghost"
                                        ? "lantern-wisp"
                                        : "fire-goblin/fire-goblin-front"
                                    }.png)`,
                                    backgroundSize: "contain",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "center",
                                  }}
                                  title={enemyType}
                                />
                              );
                            }
                            return enemies;
                          }
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">
                        Inventory collected:
                      </span>
                      {/* Inventory Collected moved into Game Statistics */}

                      {(() => {
                        const inv: Array<{ asset: string; alt: string }> = [];
                        if (lastGame?.hasKey)
                          inv.push({
                            asset: "/images/items/key.png",
                            alt: "Key",
                          });
                        if (lastGame?.hasExitKey)
                          inv.push({
                            asset: "/images/items/exit-key.png",
                            alt: "Exit Key",
                          });
                        if (lastGame?.hasSword)
                          inv.push({
                            asset: "/images/items/sword.png",
                            alt: "Sword",
                          });
                        if (lastGame?.hasShield)
                          inv.push({
                            asset: "/images/items/shield.png",
                            alt: "Shield",
                          });
                        if (lastGame?.showFullMap)
                          inv.push({
                            asset: "/images/items/map-reveal.png",
                            alt: "Map Reveal",
                          });
                        if (inv.length === 0) {
                          return <span className="text-gray-400">None</span>;
                        }
                        return (
                          <span className="flex items-center gap-2">
                            {inv.map((i, idx) => (
                              <div
                                key={idx}
                                className="w-6 h-6"
                                style={{
                                  backgroundImage: `url(${i.asset})`,
                                  backgroundSize: "contain",
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "center",
                                }}
                                title={i.alt}
                                aria-label={i.alt}
                              />
                            ))}
                          </span>
                        );
                      })()}
                    </div>
                  </>
                )}
                {scoreBreakdown && (
                  <div className="mt-4 pt-3 border-t border-gray-600 flex justify-between items-center">
                    <span className="text-sm text-gray-400 mb-2">
                      Final Score
                    </span>
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-center gap-2">
                        {/* <span>
                          {ScoreCalculator.getScoreEmoji(scoreBreakdown.grade)}
                        </span> */}
                        <span className="font-bold">
                          {scoreBreakdown.grade}
                        </span>
                        <span className="text-sm text-gray-400">
                          ({scoreBreakdown.percentage}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400">No game statistics available</p>
            )}
            {/* Share Results button inside Game Statistics box */}
            <div className="text-center my-4">
              <button
                type="button"
                onClick={onShare}
                className="px-6 py-3 rounded-md bg-[#2E7D32] text-white hover:bg-[#256628] transition-colors border-0 font-semibold"
              >
                {copied ? "Copied!" : "Share Results"}
              </button>
            </div>
          </div>
        </div>

        {/* Individual Stats List - Simple list below Game Statistics box */}
        <div data-testid="individual-stats-list" className="max-w-lg mx-auto">
          <div className="">
            <div className="space-y-1">
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-gray-300 font-medium">
                  Current Streak:
                </span>
                <span
                  className={`text-2xl font-bold ${
                    isWin ? "text-green-300" : "text-red-300"
                  }`}
                >
                  {data.currentStreak}
                  {isWin && data.currentStreak > 1 && (
                    <span className="text-sm text-green-400 ml-1">🔥</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-gray-300 font-medium">Total Games:</span>
                <span className="text-lg font-semibold text-gray-200">
                  {data.totalGamesPlayed}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-gray-300 font-medium">Games Won:</span>
                <span className="text-lg font-semibold text-green-300">
                  {data.totalGamesWon}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-300 font-medium">Win Rate:</span>
                <span className="text-lg font-semibold text-purple-300">
                  {Math.round(
                    (data.totalGamesWon / data.totalGamesPlayed) * 100
                  )}
                  %
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Streak Celebration */}
        {isWin && data.currentStreak > 1 && (
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg p-6 mb-8 text-white max-w-2xl mx-auto">
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
        {data.streakHistory.length > 0 && data.totalGamesPlayed > 5 && (
          <div className="mb-8 max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">
              Your Journey
            </h2>
            <div className="bg-black/50 rounded-lg p-4 border border-gray-600">
              <div className="flex gap-2 overflow-x-auto">
                {data.streakHistory.slice(-10).map((entry, index) => (
                  <div
                    key={index}
                    className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-semibold ${
                      entry.result === "won" ? "bg-green-500" : "bg-red-500"
                    }`}
                    title={`${entry.date}: ${entry.result} (streak: ${entry.streak})`}
                  >
                    {entry.result === "won" ? "✓" : "✗"}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Motivational Message */}
        <div className="text-center mb-8 max-w-2xl mx-auto">
          <div className="rounded-lg p-6 border border-gray-600">
            {isWin ? (
              <>
                <h3 className="text-lg font-semibold text-gray-100 mb-2">
                  Well Done, Adventurer!
                </h3>
                <p className="text-lg text-gray-200 italic">
                  {data.currentStreak === 1
                    ? "Great start! Come back tomorrow to build your streak."
                    : `Amazing ${data.currentStreak}-day streak! The dungeon fears you.`}
                </p>
                <p className="text-gray-200 mt-4">
                  Your courage and skill have served you well today. Rest now,
                  for tomorrow brings new challenges.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-100 mb-2">
                  The Adventure Continues...
                </h3>
                <p className="text-gray-200">
                  Every defeat teaches valuable lessons. Study the
                  dungeon&apos;s secrets and return stronger tomorrow.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
