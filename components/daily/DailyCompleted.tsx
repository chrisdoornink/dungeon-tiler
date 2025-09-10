"use client";

import React, { useState, useEffect } from "react";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import { trackDailyChallenge } from "../../lib/posthog_analytics";
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
    trackDailyChallenge('completed', {
      outcome: isWin ? 'win' : 'loss',
      streak: data.currentStreak,
      total_games: data.totalGamesPlayed,
      win_rate: Math.round((data.totalGamesWon / data.totalGamesPlayed) * 100)
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

  console.log("deathDetails", deathDetails);

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
    const statsLine = [
      `${resultEmoji}`,
      deathEmoji,
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
        const numCount = typeof count === "number" ? count : 0;
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

    // Health visualization (5 tiles showing final health). Default to empty if unknown.
    const health =
      typeof lastGame?.heroHealth === "number" ? lastGame!.heroHealth : 0;
    const healthTiles: string[] = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= health) {
        if (health === 5) healthTiles.push(EMOJI_MAP.health_full);
        else if (health === 4) healthTiles.push(EMOJI_MAP.health_good);
        else if (health === 3) healthTiles.push(EMOJI_MAP.health_ok);
        else if (health === 2) healthTiles.push(EMOJI_MAP.health_low);
        else if (health === 1) healthTiles.push(EMOJI_MAP.health_critical);
      } else {
        healthTiles.push("⬜"); // Empty health
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
      <div className="max-w-4xl mx-auto rounded-lg shadow-xl p-8">
        {/* Result Header */}
        <div className="text-center mb-8">
          <div
            className={`text-6xl mb-4 ${
              isWin ? "text-green-500" : "text-red-500"
            }`}
          >
            {isWin ? "🎉" : "💀"}
          </div>
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

        {/* Share Button */}
        <div className="text-center mb-4">
          <button
            type="button"
            onClick={onShare}
            className="px-6 py-3 rounded-md bg-[#2E7D32] text-white hover:bg-[#256628] transition-colors border-0 font-semibold"
          >
            {copied ? "Copied!" : "Share Results"}
          </button>
        </div>

        {/* Stats Update */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">
              Updated Stats
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Current Streak:</span>
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
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Total Games:</span>
                <span className="text-lg font-semibold text-gray-200">
                  {data.totalGamesPlayed}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Games Won:</span>
                <span className="text-lg font-semibold text-green-300">
                  {data.totalGamesWon}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Win Rate:</span>
                <span className="text-lg font-semibold text-purple-300">
                  {Math.round(
                    (data.totalGamesWon / data.totalGamesPlayed) * 100
                  )}
                  %
                </span>
              </div>
            </div>
          </div>

          <div className="bg-black/50 rounded-lg p-6 border border-gray-600">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">
              Game Statistics
            </h2>
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
                  <div className="mt-4 pt-3 border-t border-gray-600">
                    <div className="text-sm text-gray-400 mb-2">
                      Enemies defeated:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(lastGame.stats.byKind).map(
                        ([enemyType, count]) => {
                          const numCount =
                            typeof count === "number" ? count : 0;
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
                    </div>

                    {/* Inventory Collected moved into Game Statistics */}
                    <div className="mt-4 pt-3 border-t border-gray-600">
                      <div className="text-sm text-gray-400 mb-2">
                        Inventory collected:
                      </div>
                      {(() => {
                        const inv: Array<{ emoji: string; label: string }> = [];
                        if (lastGame?.hasKey)
                          inv.push({ emoji: "🔑", label: "Key" });
                        if (lastGame?.hasExitKey)
                          inv.push({ emoji: "🗝️", label: "Exit Key" });
                        if (lastGame?.hasSword)
                          inv.push({ emoji: "🗡️", label: "Sword" });
                        if (lastGame?.hasShield)
                          inv.push({ emoji: "🛡️", label: "Shield" });
                        if (lastGame?.showFullMap)
                          inv.push({ emoji: "💡", label: "Map Reveal" });
                        if (inv.length === 0) {
                          return <div className="text-gray-400">None</div>;
                        }
                        return (
                          <ul className="grid sm:grid-cols-2 gap-y-2 gap-x-6">
                            {inv.map((i, idx) => (
                              <li
                                key={idx}
                                className="flex items-center gap-2 text-gray-200"
                              >
                                <span className="text-lg">{i.emoji}</span>
                                <span>{i.label}</span>
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400">No game statistics available</p>
            )}
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
        {data.streakHistory.length > 0 && data.totalGamesPlayed > 5 && (
          <div className="mb-8">
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
        <div className="text-center mb-8">
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

        <p className="text-sm text-gray-300 text-center">
          Return tomorrow for a new dungeon challenge!
        </p>
      </div>
    </div>
  );
}
