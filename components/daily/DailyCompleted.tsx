"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DailyChallengeData } from "../../lib/daily_challenge_storage";
import FeedbackButton from "../FeedbackButton";
// import { ScoreCalculator, ScoreBreakdown } from "../../lib/score_calculator";
import * as Analytics from "../../lib/posthog_analytics";
import { GameState } from "../../lib/map/game-state";
import {
  EnemyRegistry,
  EnemyKind,
  getEnemyIcon,
} from "../../lib/enemies/registry";
import {
  summarizeMonsters,
  monsterShareLines,
  shareEmojiForKind,
} from "../../lib/enemies/monster_summary";
import DailyPollModal, { PollResponses } from "../DailyPollModal";
import { calculateBadges, type Badge } from "../../lib/badges";
import type { DailyStats } from "../../lib/redis";
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

  // Enemies — snake kept for the poison-death line; all other kinds are grouped
  // through lib/enemies/monster_summary (no more per-kind colored dots).
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
  bomb: "💣",
  darkness: "🌑",
  lava: "🌋",

  // Streak indicators
  streak_fire: "🔥",

  // Result indicators (like Wordle)
  win_square: "🟩",
  loss_square: "🟥",
} as const;

// Minimal shape of the `lastGame` snapshot that this screen reads for inventory
// + health. The snapshot is written by TilemapGrid on run completion and stored
// in localStorage; older snapshots may be missing the newer count fields, so all
// are optional and default to 0/absent.
export interface EndGameSnapshot {
  hasKey?: boolean;
  hasExitKey?: boolean;
  hasSword?: boolean;
  hasShield?: boolean;
  hasSnakeMedallion?: boolean;
  rockCount?: number;
  runeCount?: number;
  bombCount?: number;
  foodCount?: number;
  potionCount?: number;
  berryCount?: number;
  pinkHeartCount?: number;
  heroHealth?: number;
  heroMaxHealth?: number;
  bonusHearts?: number;
}

export interface InventoryEntry {
  key: string;
  asset: string; // in-game HUD asset, for the on-screen row
  emoji: string; // for the copy-to-clipboard share text
  alt: string;
  count?: number; // present only for stackable items; drives the "×N" label
}

// Build the ordered inventory list shown at the end of a run. Unique gear (key,
// sword, shield, medallion) has no count; stackables (rocks, runes, bombs, food,
// potions, berries, pink hearts) carry their count so both the visual row and the
// share text can render "×N". Assets match components/TilemapGrid.tsx's HUD.
export function buildInventoryEntries(
  game: EndGameSnapshot | null | undefined
): InventoryEntry[] {
  const inv: InventoryEntry[] = [];
  if (!game) return inv;
  if (game.hasKey)
    inv.push({ key: "key", asset: "/images/items/key.png", emoji: "🗝️", alt: "Key" });
  if (game.hasExitKey)
    inv.push({ key: "exitKey", asset: "/images/items/exit-key.png", emoji: "🔑", alt: "Exit Key" });
  if (game.hasSword)
    inv.push({ key: "sword", asset: "/images/items/sword.png", emoji: "🗡️", alt: "Sword" });
  if (game.hasShield)
    inv.push({ key: "shield", asset: "/images/items/shield.png", emoji: "🛡️", alt: "Shield" });
  if (game.hasSnakeMedallion)
    inv.push({ key: "medallion", asset: "/images/items/snake-medalion.png", emoji: "🌀", alt: "Travel Medallion" });
  if ((game.rockCount ?? 0) > 0)
    inv.push({ key: "rock", asset: "/images/items/rock-1.png", emoji: "🪨", alt: "Rock", count: game.rockCount });
  if ((game.runeCount ?? 0) > 0)
    inv.push({ key: "rune", asset: "/images/items/rune1.png", emoji: "💠", alt: "Rune", count: game.runeCount });
  if ((game.bombCount ?? 0) > 0)
    inv.push({ key: "bomb", asset: "/images/items/bomb-black.png", emoji: "💣", alt: "Bomb", count: game.bombCount });
  if ((game.foodCount ?? 0) > 0)
    inv.push({ key: "food", asset: "/images/items/food-1.png", emoji: "🧀", alt: "Food", count: game.foodCount });
  if ((game.potionCount ?? 0) > 0)
    inv.push({ key: "potion", asset: "/images/items/meds-1.png", emoji: "🧪", alt: "Potion", count: game.potionCount });
  if ((game.berryCount ?? 0) > 0)
    inv.push({ key: "berry", asset: "/images/items/berry.png", emoji: "🍓", alt: "Belted Berry", count: game.berryCount });
  // Pink flaming heart prize: shown only if still HELD at the end (using it
  // consumes it). A trophy for finding the secret realm.
  if ((game.pinkHeartCount ?? 0) > 0)
    inv.push({ key: "pinkHeart", asset: "/images/items/pink-heart.png", emoji: "💗", alt: "Pink Flaming Heart — secret prize", count: game.pinkHeartCount });
  return inv;
}

interface DailyCompletedProps {
  data: DailyChallengeData;
}

export default function DailyCompleted({ data }: DailyCompletedProps) {
  const todayResult = data.todayResult;
  const isWin = todayResult === "won";
  const [copied, setCopied] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  
  // Determine defeat image number once to prevent flickering
  const [defeatImageNum] = useState(() => Math.random() < 0.5 ? 1 : 2);

  // Badges are temporarily hidden while the feature gets more work — the badge
  // calc + effect still run so flipping this back to true re-enables the section
  // with no other changes. Typed as boolean so the render gate isn't dead code.
  const SHOW_BADGES: boolean = false;

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

  // lastGame is a one-time read from localStorage that never changes while this
  // screen is mounted. Memoize it so the reference is stable — re-reading on every
  // render made the badge effect (deps: [lastGame]) re-run forever and trip React's
  // "Maximum update depth exceeded".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lastGame = useMemo(() => getLastGame(), []);

  // Generate dynamic badge descriptions based on actual stats
  const getDynamicBadgeDescription = (badge: Badge, game: GameState) => {
    if (!game?.stats) return badge.description;
    
    const stats = game.stats;
    switch (badge.id) {
      case 'exterminator':
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
      case 'rock-finder':
        return `${stats.rocksCollected || 0}/12 rocks found`;
      case 'treasure-hunter':
        return `${stats.chestsOpened || 0}/4 chests opened`;
      case 'speedrunner':
        return `${stats.steps} steps`;
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
  // Save this session to Redis once, then fetch today's aggregate
  useEffect(() => {
    const date = new Date().toLocaleDateString("en-CA");
    const savedKey = `dailyStatsSaved:${date}`;

    if (lastGame && typeof window !== "undefined" && !window.localStorage.getItem(savedKey)) {
      fetch("/api/daily-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          outcome: lastGame.outcome === "win" ? "win" : "dead",
          floor: lastGame.currentFloor ?? 1,
          steps: lastGame.stats?.steps ?? 0,
          enemiesDefeated: lastGame.stats?.enemiesDefeated ?? 0,
          heroHealth: lastGame.heroHealth ?? 0,
        }),
      })
        .then(() => window.localStorage.setItem(savedKey, "true"))
        .catch(() => {});
    }

    fetch(`/api/daily-stats?date=${date}`)
      .then((r) => r.json())
      .then((stats) => setDailyStats(stats))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      case "lava":
        return {
          message: "You stepped into the molten lava",
          image: "/images/floor/crack3.png",
          alt: "Lava",
        };
      case "poison":
        return {
          message: "You succumbed to poison from a snake bite",
          image: "/images/enemies/snake-coiled-right.png",
          alt: "Poisoned by snake",
        };
      case "bomb":
        return {
          message: "You were caught in your own bomb blast",
          image: "/images/items/bomb-red.png",
          alt: "Killed by a bomb",
        };
      case "darkness":
        return {
          message: "You were swallowed by the dark",
          // A black square — no asset needed for the nightmare's darkness.
          image:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          alt: "Swallowed by the dark",
        };
      case "enemy":
        const enemyKind = (lastGame.deathCause.enemyKind ||
          "fire-goblin") as EnemyKind;
        const enemyConfig = EnemyRegistry[enemyKind];
        const enemyImage = getEnemyIcon(enemyKind);
        const enemyName = enemyConfig ? `a ${enemyConfig.displayName}` : "an enemy";

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

    // On a loss, most runs never reach the final floor — call out how far you
    // got right above the skull/cause-of-death line. Wins already say this via
    // the trophy emoji, so skip it there.
    if (!isWin && lastGame?.currentFloor != null) {
      lines.push(`📍 Level ${lastGame.currentFloor}`);
    }

    // Result and basic stats
    const resultEmoji = isWin ? EMOJI_MAP.win : EMOJI_MAP.death;
    // If player died, add emoji for cause of death (enemy kind or faulty floor)
    // Death cause emojis (can be multiple, e.g., poison + snake)
    const deathEmojis: string[] = [];
    if (!isWin && lastGame?.deathCause) {
      if (lastGame.deathCause.type === "faulty_floor") {
        deathEmojis.push(EMOJI_MAP.faulty_floor);
      } else if (lastGame.deathCause.type === "lava") {
        deathEmojis.push(EMOJI_MAP.lava);
      } else if (lastGame.deathCause.type === "bomb") {
        deathEmojis.push(EMOJI_MAP.bomb);
      } else if (lastGame.deathCause.type === "enemy") {
        const e = (lastGame.deathCause.enemyKind as EnemyKind) ?? "fire-goblin";
        deathEmojis.push(shareEmojiForKind(e));
      } else if (lastGame.deathCause.type === "poison") {
        deathEmojis.push(EMOJI_MAP.poison);
        // include snake indicator if known or by convention
        deathEmojis.push(EMOJI_MAP.snake);
      } else if (lastGame.deathCause.type === "darkness") {
        deathEmojis.push(EMOJI_MAP.darkness);
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

    // Streak — only show on a win and only once it's a real streak (> 1).
    if (isWin && data.currentStreak > 1) {
      lines.push(`${EMOJI_MAP.streak_fire} streak: ${data.currentStreak}`);
    }

    // Monsters defeated: a single total plus a grouped breakdown. Goblin variants
    // collapse into one bucket; the magician/stone/snake/wisp keep their own icon.
    // Replaces the old per-floor wall of colored dots.
    const monsterSummary = summarizeMonsters(
      lastGame?.stats?.byKind,
      lastGame?.stats?.enemiesDefeated
    );
    for (const monsterLine of monsterShareLines(monsterSummary)) {
      lines.push(monsterLine);
    }

    // Inventory line (no label word). Stackables carry a "×N" count; unique gear
    // (key/sword/shield/medallion) shows just its emoji.
    const items = buildInventoryEntries(lastGame).map((i) =>
      typeof i.count === "number" ? `${i.emoji}×${i.count}` : i.emoji
    );
    lines.push(`🗃️ ${items.join(" ")}`);

    // Health visualization: one heart per max HP (5 by default, 6+ if an Extra
    // Heart was collected), filled up to final health. Only shown on a win — on
    // a loss the hearts are all empty anyway, and "Reached Level N" above already
    // conveys how far the run got, so the row would just be dead space.
    if (isWin) {
      const health =
        typeof lastGame?.heroHealth === "number" ? lastGame!.heroHealth : 0;
      // Never render fewer hearts than current HP: older snapshots (pre-heroMaxHealth)
      // can carry heroHealth 6 from an Extra Heart with no max stored, so floor at health.
      const maxHealth = Math.max(
        typeof lastGame?.heroMaxHealth === "number" ? lastGame!.heroMaxHealth : 5,
        health
      );
      const healthTiles: string[] = [];
      for (let i = 1; i <= maxHealth; i++) {
        if (i <= health) {
          healthTiles.push("❤️"); // Filled heart for remaining health
        } else {
          healthTiles.push("🤍"); // Empty heart for lost health
        }
      }
      // Temporary pink overheal hearts still active at the end (i.e. the heart was USED and the
      // buffer survived) ride along after the normal row.
      const bonusHearts =
        typeof lastGame?.bonusHearts === "number" ? lastGame.bonusHearts : 0;
      for (let i = 0; i < bonusHearts; i++) healthTiles.push("💗");
      lines.push(healthTiles.join(""));
    }

    // Grade (moved below hearts), intentionally commented out for now until accuracy is improved
    // if (scoreBreakdown) {
    //   lines.push(`Grade: ${scoreBreakdown.grade} (${scoreBreakdown.percentage}%)`);
    // }

    // A link to the game at torchboy.com
    lines.push("\nhttps://torchboy.com");

    return lines.join("\n");
  };

  const onShare = async () => {
    const shareText = generateShareText();
    try {
      Analytics.trackShare?.({
        surface: "daily_completed",
        mode: "daily",
        outcome: isWin ? "win" : "dead",
        levelReached: lastGame?.currentFloor,
        method: "clipboard",
      });
    } catch {}
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
                {isWin ? "Completed" : "Reached"} Level {lastGame.currentFloor}
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
                    {!isWin && lastGame?.currentFloor != null && (
                      <div className="mb-1 text-gray-300">
                        📍 Level {lastGame.currentFloor}
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
                    {/* Streak — win-only, matching the shared text */}
                    {isWin && data.currentStreak > 1 && (
                      <div className="mb-2">streak: {data.currentStreak}</div>
                    )}
                    {/* Monsters defeated: total + one icon per group, in a single row */}
                    {(() => {
                      const summary = summarizeMonsters(
                        lastGame.stats.byKind,
                        lastGame.stats.enemiesDefeated
                      );
                      if (summary.total <= 0) return null;
                      return (
                        <div className="mb-1 flex items-center justify-center gap-3 flex-wrap">
                          <span className="text-sm text-gray-300">
                            ⚔️ {summary.total}
                          </span>
                          {summary.groups.map((g) => (
                            <div
                              key={g.key}
                              className="flex items-center gap-1"
                              title={g.label}
                            >
                              <div
                                className="w-6 h-6"
                                style={{
                                  backgroundImage: `url(${g.spriteSrc})`,
                                  backgroundSize: "contain",
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "center",
                                }}
                                aria-label={g.label}
                              />
                              <span className="text-sm text-gray-300">
                                ×{g.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* Inventory row (no label). Stackables show a "×N" count. */}
                    <div className="flex items-center justify-center gap-3 mb-2 flex-wrap">
                      <span>🗃️</span>
                      {buildInventoryEntries(lastGame).map((i) => {
                        const label =
                          typeof i.count === "number"
                            ? `${i.alt} x${i.count}`
                            : i.alt;
                        return (
                          <div
                            key={i.key}
                            className="flex items-center gap-1"
                            title={label}
                          >
                            <div
                              className="w-6 h-6"
                              style={{
                                backgroundImage: `url(${i.asset})`,
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                              }}
                              aria-label={label}
                            />
                            {typeof i.count === "number" && (
                              <span className="text-sm text-gray-300">
                                ×{i.count}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Hearts — win only; a loss run's row would be all empty anyway
                        and the Level line above already says how far it got. */}
                    {isWin && (
                    <div className="flex items-center justify-center gap-1">
                      {(() => {
                        const health =
                          typeof lastGame?.heroHealth === "number"
                            ? lastGame!.heroHealth
                            : 0;
                        // One heart per max HP: 5 normally, 6+ when an Extra
                        // Heart was collected. Older snapshots lack heroMaxHealth
                        // and fall back to 5 — but never fewer than current HP, so
                        // a pre-migration 6/6 run doesn't lose its 6th heart.
                        const maxHealth = Math.max(
                          typeof lastGame?.heroMaxHealth === "number"
                            ? lastGame!.heroMaxHealth
                            : 5,
                          health
                        );
                        const tiles: React.ReactElement[] = [];
                        for (let i = 1; i <= maxHealth; i++) {
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
                        // Temporary pink overheal hearts still active at the end (the heart
                        // was used and the buffer survived) render after the normal row.
                        const bonusHearts =
                          typeof lastGame?.bonusHearts === "number"
                            ? lastGame.bonusHearts
                            : 0;
                        for (let i = 0; i < bonusHearts; i++) {
                          tiles.push(
                            <div
                              key={`bonus-${i}`}
                              className="w-5 h-5"
                              style={{
                                backgroundImage:
                                  "url(/images/presentational/heart-pink.png)",
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                              }}
                              aria-label="Pink Heart"
                            />
                          );
                        }
                        return tiles;
                      })()}
                    </div>
                    )}
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

        {/* Endless Mode CTA — a "want more?" nudge shown directly under the run
            results. No surrounding box (matches the lifetime-stats list further
            down). The tap is tracked (endless_prompt_clicked) so we can measure
            crossover into Endless from the endgame screen. */}
        <div className="max-w-lg mx-auto text-center">
          <p className="text-gray-200 mb-3">Want to keep playing?</p>
          <Link
            href="/endless"
            onClick={() => {
              try {
                Analytics.trackEndlessPromptClick?.({
                  surface: "daily_completed",
                  outcome: isWin ? "win" : "dead",
                });
              } catch {}
            }}
            className="inline-block px-6 py-3 rounded-md bg-[#2E7D32] text-white hover:bg-[#256628] transition-colors font-semibold"
          >
            Try Endless Mode
          </Link>
        </div>

        {/* Badges Section - temporarily hidden (SHOW_BADGES) while the feature
            gets more work.
            Note: reachedPinkRealm is intentionally tracked silently (run-level flag +
            pink_realm_reached PostHog event + lastGame payload) but NOT shown here yet —
            a richer realm reveal will land once the realm has real secrets/stats. */}
        {SHOW_BADGES && badges.length > 0 && (
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
                  .slice(0, 2)
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

        {/* Today's Adventurers - Community Comparison */}
        {!statsLoading && dailyStats && dailyStats.totalPlayers >= 2 && (
          <div className="max-w-2xl mx-auto">
            <div className="rounded-lg shadow-xl p-6 bg-black/50 border border-gray-600">
              <h2 className="text-xl font-semibold text-gray-100 mb-4 text-center">
                Today&apos;s Adventurers
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                  <span className="text-gray-300">Dungeon difficulty</span>
                  <span className={`font-semibold ${
                    dailyStats.winRate >= 50 ? "text-green-300" :
                    dailyStats.winRate >= 30 ? "text-yellow-300" :
                    dailyStats.winRate >= 10 ? "text-orange-300" :
                    "text-red-300"
                  }`}>
                    {dailyStats.winRate >= 50 ? "Forgiving" :
                     dailyStats.winRate >= 30 ? "Perilous" :
                     dailyStats.winRate >= 10 ? "Deadly" :
                     "Merciless"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                  <span className="text-gray-300">Avg floor reached</span>
                  <span className="font-semibold text-gray-200">
                    {dailyStats.avgFloor}
                    {lastGame?.currentFloor != null && (
                      <span className="text-xs text-gray-400 ml-2">
                        (you: {lastGame.currentFloor})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                  <span className="text-gray-300">Avg enemies defeated</span>
                  <span className="font-semibold text-gray-200">
                    {dailyStats.avgEnemiesDefeated}
                    {lastGame?.stats?.enemiesDefeated != null && (
                      <span className={`text-xs ml-2 ${lastGame.stats.enemiesDefeated >= dailyStats.avgEnemiesDefeated ? "text-green-400" : "text-gray-400"}`}>
                        (you: {lastGame.stats.enemiesDefeated})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-300">Avg steps taken</span>
                  <span className="font-semibold text-gray-200">
                    {dailyStats.avgSteps}
                    {lastGame?.stats?.steps != null && (
                      <span className={`text-xs ml-2 ${lastGame.stats.steps <= dailyStats.avgSteps ? "text-green-400" : "text-gray-400"}`}>
                        (you: {lastGame.stats.steps})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Individual Stats List - Simple list below Game Statistics box */}
        <div data-testid="individual-stats-list" className="max-w-lg mx-auto">
          <div className="">
            <div className="space-y-1">
              {isWin && data.currentStreak > 1 && (
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
          <div className="flex items-center justify-center text-xs text-gray-400 pt-1">
            <a href="/privacy" className="underline underline-offset-4 hover:text-gray-200">
              Privacy
            </a>
          </div>
        </div>
      </div>
      
      {/* Floating feedback button — fixed bottom-left, uses the pixel chat-box
          icon. No How-to-Play companion; the feedback channel is the only one. */}
      <FeedbackButton />

      {/* Daily Challenge Poll Modal */}
      <DailyPollModal
        open={showPoll}
        onClose={handlePollClose}
        onSubmit={handlePollSubmit}
      />
    </div>
  );
}
