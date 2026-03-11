"use client";

import React, { useState, useEffect } from "react";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
// import { ScoreCalculator, ScoreBreakdown } from "../../lib/score_calculator";
import * as Analytics from "../../lib/posthog_analytics";
import {
  EnemyRegistry,
  EnemyKind,
  getEnemyIcon,
} from "../../lib/enemies/registry";
import DailyPollModal, { PollResponses } from "../DailyPollModal";
import { calculateBadges, type Badge } from "../../lib/badges";
// Using localStorage directly instead of separate module

// Emoji translation map for game entities
const EMOJI_MAP = {
  // Game outcome
  win: "🏆",
  death: "💀",

  // Items/pickups
  key: "🗝️",
  exitKey: "🔑",
  sword: "🗡️",
  shield: "🛡️",
  map: "🗺️",

  // Enemies
  "fire-goblin": "👹",
  "water-goblin": "🔵",
  "water-goblin-spear": "🔵🗡️",
  "earth-goblin": "🟤",
  "earth-goblin-knives": "🟤⚔️",
  "pink-goblin": "🔮",
  ghost: "👻",
  "stone-goblin": "🗿",
  snake: "🐍",

  // Stats
  damage: "⚔️",
  health: "❤️",
  steps: "👣",
  poison: "☠️",

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
  const [showPoll, setShowPoll] = useState(false);
  const [badges, setBadges] = useState<Badge[]>([]);
  
  // Determine defeat image number once to prevent flickering
  const [defeatImageNum] = useState(() => Math.random() < 0.5 ? 1 : 2);

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

  // Generate dynamic badge descriptions based on actual stats
  const getDynamicBadgeDescription = (badge: Badge, game: any) => {
    if (!game?.stats) return badge.description;
    
    const stats = game.stats;
    switch (badge.id) {
      case 'monster-hunter':
      case 'exterminator':
      case 'dungeon-cleaner':
        return `${stats.enemiesDefeated} enemies defeated`;
      case 'swordmaster':
        return `${stats.enemiesKilledBySword || 0} sword kills`;
      case 'rock-thrower':
        return `${stats.enemiesKilledByRock || 0} rock kills`;
      case 'rune-master':
        return `${stats.enemiesKilledByRune || 0} rune kills`;
      case 'untouchable':
        return 'No damage taken';
      case 'survivor':
        return `Won with ${game.heroHealth} HP`;
      case 'healthy':
        return 'Won at full health';
      case 'rock-finder':
        return `${stats.rocksCollected || 0}/12 rocks found`;
      case 'pitcher':
        return `${stats.rocksThrown || 0} rocks thrown`;
      case 'rock-collector':
        return `${game.rockCount || 0} rocks saved`;
      case 'hoarder':
        return `${stats.itemsCollected || 0} items collected`;
      case 'treasure-hunter':
        return `${stats.chestsOpened || 0}/4 chests opened`;
      case 'speedrunner':
        return `${stats.steps} steps`;
      case 'marathon':
        return `${stats.steps} steps taken`;
      case 'poisoned':
        return `${stats.poisonSteps || 0} poison steps`;
      case 'ghost-whisperer':
        return `${stats.ghostsVanished || 0} ghosts vanished`;
      case 'pacifist':
        return `${stats.enemiesDefeated} enemies killed`;
      case 'minimalist':
        return 'No items used';
      case 'snake-hater':
        return `${stats.byKind?.snake || 0} snakes killed`;
      default:
        return badge.description;
    }
  };

  // Calculate badges earned
  useEffect(() => {
    if (lastGame?.stats) {
      const earnedBadges = calculateBadges(lastGame.stats, {
        win: lastGame.outcome === 'win',
        currentFloor: lastGame.currentFloor,
        maxFloors: lastGame.maxFloors,
        heroHealth: lastGame.heroHealth,
        heroMaxHealth: lastGame.heroMaxHealth ?? 5,
        hasSword: lastGame.hasSword,
        hasShield: lastGame.hasShield,
        hasKey: lastGame.hasKey,
        hasExitKey: lastGame.hasExitKey,
      });
      setBadges(earnedBadges);
    }
  }, [lastGame]);

  useEffect(() => {
    try {
      Analytics.trackDailyChallenge?.("completed", {
        outcome: isWin ? "win" : "loss",
        streak: data.currentStreak,
        total_games: data.totalGamesPlayed,
        win_rate: Math.round(
          (data.totalGamesWon / data.totalGamesPlayed) * 100
        ),
        level_reached: lastGame?.currentFloor,
      });
    } catch {}
    
    // Check if we should show the poll
    if (typeof window !== "undefined") {
      const pollShown = window.localStorage.getItem("dailyPollShown");
      const currentDate = new Date();
      const cutoffDate = new Date('2026-03-10'); // March 10, 2026
      
      // Only show if not shown before AND before the cutoff date
      if (!pollShown && currentDate < cutoffDate) {
        // Delay showing the poll slightly so the end screen loads first
        setTimeout(() => setShowPoll(true), 1000);
      }
    }
  }, [isWin, data.currentStreak, data.totalGamesPlayed, data.totalGamesWon]);
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
      case "poison":
        return {
          message: "You succumbed to poison from a snake bite",
          image: "/images/enemies/snake-coiled-right.png",
          alt: "Poisoned by snake",
        };
      case "enemy":
        const enemyKind = (lastGame.deathCause.enemyKind ||
          "fire-goblin") as EnemyKind;
        const enemyConfig = EnemyRegistry[enemyKind];
        const enemyImage = getEnemyIcon(enemyKind);
        const enemyName = `a ${enemyConfig.displayName}`;

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

    // Level reached (multi-tier mode)
    if (lastGame?.currentFloor != null) {
      const maxFloors = lastGame.maxFloors ?? 10;
      const beatGame = isWin && lastGame.currentFloor >= maxFloors;
      lines.push(beatGame ? `🎉 Escaped the dungeon!` : `Level ${lastGame.currentFloor}`);
    }

    // Result and basic stats
    const resultEmoji = isWin ? EMOJI_MAP.win : EMOJI_MAP.death;
    // If player died, add emoji for cause of death (enemy kind or faulty floor)
    // Death cause emojis (can be multiple, e.g., poison + snake)
    const deathEmojis: string[] = [];
    if (!isWin && lastGame?.deathCause) {
      if (lastGame.deathCause.type === "faulty_floor") {
        deathEmojis.push(EMOJI_MAP.faulty_floor);
      } else if (lastGame.deathCause.type === "enemy") {
        const e = (lastGame.deathCause.enemyKind as keyof typeof EMOJI_MAP) ?? "fire-goblin";
        deathEmojis.push(EMOJI_MAP[e] || EMOJI_MAP["fire-goblin"]);
      } else if (lastGame.deathCause.type === "poison") {
        deathEmojis.push(EMOJI_MAP.poison);
        // include snake indicator if known or by convention
        deathEmojis.push(EMOJI_MAP.snake);
      }
    }
    const statsLine = [
      `${resultEmoji}`,
      deathEmojis.join(" "),
      lastGame?.stats?.steps
        ? `${EMOJI_MAP.steps} ${lastGame.stats.steps}`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(statsLine);

    // Streak
    lines.push(`${EMOJI_MAP.streak_fire} streak: ${data.currentStreak}`);

    // Kills line (individual enemy emojis)
    const enemyEmojis: string[] = [];
    let totalKills = 0;
    if (lastGame?.stats?.byKind) {
      Object.entries(lastGame.stats.byKind).forEach(([enemyType, count]) => {
        let numCount = typeof count === "number" ? count : 0;

        // CONSERVATIVE PATCH: Cap stone-goblin kills at 2 to prevent inflated display
        // This addresses a known bug where stone-goblin kills can be double-counted
        if (enemyType === "stone-goblin" && numCount >= 2) {
          numCount = numCount / 2;
        }

        if (numCount > 0) {
          totalKills += numCount;
          const emoji =
            EMOJI_MAP[enemyType as keyof typeof EMOJI_MAP] || EMOJI_MAP["fire-goblin"];
          // Add individual emojis for each kill
          for (let i = 0; i < numCount; i++) {
            enemyEmojis.push(emoji);
          }
        }
      });
    }
    // Show individual emojis followed by total count
    lines.push(`☠️ ${enemyEmojis.join(" ")} (${totalKills} total)`);

    // Badges line - show only high-rated (8+) badges, max 2
    if (badges.length > 0) {
      // Only show legendary and high-epic badges (rated 8+ in our system)
      const highRatedBadges = badges.filter(b => 
        b.id === 'exterminator' || 
        b.id === 'rune-master' || 
        b.id === 'untouchable' || 
        b.id === 'hoarder' || 
        b.id === 'speedrunner' || 
        b.id === 'pacifist' || 
        b.id === 'minimalist'
      );
      
      if (highRatedBadges.length > 0) {
        const badgeEmojis = highRatedBadges.slice(0, 2).map(b => b.icon).join(" ");
        lines.push(`🏅 ${badgeEmojis}`);
      }
    }

    // Inventory line (no label word)
    const items: string[] = [];
    if (lastGame?.hasKey) items.push(EMOJI_MAP.key);
    if (lastGame?.hasExitKey) items.push(EMOJI_MAP.exitKey);
    if (lastGame?.hasSword) items.push(EMOJI_MAP.sword);
    if (lastGame?.hasShield) items.push(EMOJI_MAP.shield);
    lines.push(`🗃️ ${items.join("")}`);

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

    // Grade (moved below hearts), intentionally commented out for now until accuracy is improved
    // if (scoreBreakdown) {
    //   lines.push(`Grade: ${scoreBreakdown.grade} (${scoreBreakdown.percentage}%)`);
    // }

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

  const handlePollSubmit = (responses: PollResponses) => {
    // Save poll responses and mark as shown
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dailyPollShown", "true");
      window.localStorage.setItem("dailyPollResponses", JSON.stringify({
        ...responses,
        submittedAt: new Date().toISOString(),
      }));
    }
    
    // Track analytics - always track poll submission
    try {
      // Track the feedback using the existing trackFeedback method
      Analytics.trackFeedback?.({
        message: `Daily Challenge Poll - Mode Preference: ${responses.preferredMode || 'no preference'}${responses.otherFeedback ? ` | Additional feedback: ${responses.otherFeedback}` : ''}`,
      });
      
      // Also track as a daily challenge event for better categorization
      Analytics.trackDailyChallenge?.("completed", {
        poll_submitted: true,
        poll_mode_preference: responses.preferredMode || "none",
        poll_has_feedback: !!responses.otherFeedback,
      });
    } catch (error) {
      console.warn("Failed to track poll submission:", error);
    }
  };

  const handlePollClose = () => {
    setShowPoll(false);
    // Mark as shown even if they skip
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dailyPollShown", "true");
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
                  : `url(/images/presentational/game-over-loss-${defeatImageNum}.png)`,
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
            {lastGame?.currentFloor != null && (
              <p className="text-sm text-gray-400 text-center mt-2">
                Reached Level {lastGame.currentFloor}
              </p>
            )}
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
                {/* Share-style Preview using real assets */}
                <div className="text-center text-gray-100 mb-2">
                  <div className="pixel-text text-sm">
                    {/* Header */}
                    <div className="mb-1">
                      #TorchBoy {new Date().toLocaleDateString("en-CA")}
                    </div>
                    {lastGame?.currentFloor != null && (
                      <div className="mb-1 text-gray-300">
                        Level {lastGame.currentFloor}
                      </div>
                    )}
                    {/* Result + steps */}
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div
                        className="w-6 h-6"
                        style={{
                          backgroundImage: `url(${
                            isWin
                              ? "/images/presentational/game-over-win-1.png"
                              : "/images/presentational/game-over-loss-1.png"
                          })`,
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                        }}
                        aria-label={isWin ? "Victory" : "Defeat"}
                      />
                      {/* If dead, show cause */}
                      {!isWin && deathDetails && (
                        <div
                          className="w-6 h-6"
                          style={{
                            backgroundImage: `url(${deathDetails.image})`,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                          aria-label={deathDetails.alt}
                        />
                      )}
                      {/* Poison badge when relevant */}
                      {!isWin && lastGame?.deathCause?.type === 'poison' && (
                        <span className="text-base">{EMOJI_MAP.poison}</span>
                      )}
                      <div className="text-sm text-gray-300">
                        👣 {lastGame.stats.steps || 0}
                      </div>
                    </div>
                    {/* Streak */}
                    <div className="mb-2">streak: {data.currentStreak}</div>
                    {/* Enemies row (individual icons) */}
                    {lastGame.stats.byKind && (
                      <div className="mb-1">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <span className="mr-1">⚔️</span>
                          {Object.entries(lastGame.stats.byKind).flatMap(
                            ([enemyType, count]) => {
                              let numCount =
                                typeof count === "number" ? count : 0;
                              if (
                                enemyType === "stone-goblin" &&
                                numCount >= 2
                              ) {
                                numCount = numCount / 2;
                              }
                              if (numCount <= 0) return [];
                              
                              // Create an array of individual enemy icons
                              return Array.from({ length: numCount }, (_, idx) => (
                                <div
                                  key={`${enemyType}-${idx}`}
                                  className="w-6 h-6"
                                  style={{
                                    backgroundImage: `url(/images/enemies/${
                                      ({
                                        "fire-goblin": "fire-goblin/fire-goblin-front",
                                        "water-goblin": "fire-goblin/blue-goblin-front",
                                        "water-goblin-spear": "fire-goblin/blue-goblin-front-spear",
                                        "earth-goblin": "fire-goblin/brown-goblin-front",
                                        "earth-goblin-knives": "fire-goblin/brown-goblin-front-knives",
                                        "pink-goblin": "fire-goblin/pink-goblin-front",
                                        "stone-goblin": "fire-goblin/green-goblin-front",
                                        "ghost": "lantern-wisp",
                                        "snake": "snake-coiled-right",
                                      } as Record<string, string>)[enemyType] || "fire-goblin/fire-goblin-front"
                                    }.png)`,
                                    backgroundSize: "contain",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "center",
                                  }}
                                  title={enemyType}
                                />
                              ));
                            }
                          )}
                        </div>
                        {/* Total deaths count */}
                        <div className="text-center text-xs text-gray-400 mt-1">
                          Total: {Object.entries(lastGame.stats.byKind).reduce((total, [enemyType, count]) => {
                            let numCount = typeof count === "number" ? count : 0;
                            if (enemyType === "stone-goblin" && numCount >= 2) {
                              numCount = numCount / 2;
                            }
                            return total + numCount;
                          }, 0)} defeated
                        </div>
                      </div>
                    )}
                    {/* Inventory row (no label) */}
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span>🗃️</span>
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
                        if (inv.length === 0) return null;
                        return inv.map((i, idx) => (
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
                        ));
                      })()}
                    </div>
                    {/* Hearts */}
                    <div className="flex items-center justify-center gap-1">
                      {(() => {
                        const health =
                          typeof lastGame?.heroHealth === "number"
                            ? lastGame!.heroHealth
                            : 0;
                        const tiles: React.ReactElement[] = [];
                        for (let i = 1; i <= 5; i++) {
                          const filled = i <= health;
                          tiles.push(
                            <div
                              key={i}
                              className="w-5 h-5"
                              style={{
                                backgroundImage: `url(${
                                  filled
                                    ? "/images/presentational/heart-red.png"
                                    : "/images/presentational/heart-empty.png"
                                })`,
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                              }}
                              aria-label={filled ? "Heart" : "Empty Heart"}
                            />
                          );
                        }
                        return tiles;
                      })()}
                    </div>
                    {/* Grade moved below hearts; hidden for now until accuracy is improved.
                        When re-enabling, render something like:
                        <div className="mt-2 text-sm text-gray-300">
                          Grade: {scoreBreakdown.grade} ({scoreBreakdown.percentage}%)
                        </div>
                    */}
                  </div>
                </div>
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

        {/* Badges Section - Show earned badges */}
        {badges.length > 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="rounded-lg shadow-xl p-6 bg-black/50 border border-gray-600">
              <h2 className="text-xl font-semibold text-gray-100 mb-4 text-center">
                Badges Earned
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {badges
                  .sort((a, b) => {
                    // Sort by rarity: legendary > epic > rare > common
                    const rarityOrder = { legendary: 4, epic: 3, rare: 2, common: 1 };
                    return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
                  })
                  .slice(0, 5)
                  .map((badge) => (
                  <div
                    key={badge.id}
                    className={`rounded-lg p-3 text-center transition-all hover:scale-105 min-w-0 ${
                      badge.rarity === "legendary"
                        ? "bg-gradient-to-br from-yellow-600/20 to-orange-600/20 border border-yellow-500"
                        : badge.rarity === "epic"
                        ? "bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500"
                        : badge.rarity === "rare"
                        ? "bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500"
                        : "bg-gray-700/50 border border-gray-600"
                    }`}
                  >
                    <div className="text-2xl mb-1">{badge.icon}</div>
                    <div className="text-[11px] font-medium text-gray-200 leading-tight">
                      {badge.name}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {getDynamicBadgeDescription(badge, lastGame)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Individual Stats List - Simple list below Game Statistics box */}
        <div data-testid="individual-stats-list" className="max-w-lg mx-auto">
          <div className="">
            <div className="space-y-1">
              {data.currentStreak > 0 && (
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
              )}
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

      <div className="max-w-lg mx-auto mt-8 text-center">
        <div className="text-sm leading-relaxed space-y-3">
          <p className="text-xs">
            Torch Boy was made by Chris Doornink, a web developer out of Seattle,
            Washington.
          </p>
          {/* <p className="text-sm text-purple-300">I&apos;m looking for my next quest. Want to hire me?</p> */}
          <div className="space-y-2">
            <div>
              <a href="https://chrisdoornink.com" target="_blank" rel="noreferrer">
                Visit my website
              </a>
            </div>
            <div>
              <a href="https://www.linkedin.com/in/chrisdoornink/" target="_blank" rel="noreferrer">
                Connect on LinkedIn
              </a>
            </div>
            <div>
              <a href="https://github.com/chrisdoornink/dungeon-tiler" target="_blank" rel="noreferrer">
                View the GitHub repository
              </a>
            </div>
          </div>
        </div>
      </div>
      
      {/* Daily Challenge Poll Modal */}
      <DailyPollModal
        open={showPoll}
        onClose={handlePollClose}
        onSubmit={handlePollSubmit}
      />
    </div>
  );
}
