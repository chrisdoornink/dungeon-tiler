import type { GameState } from "./map/game-state";

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji or image path
  criteria: (stats: GameState["stats"], gameState: Partial<GameState>) => boolean;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export const BADGES: Badge[] = [
  // Kill-based badges
  {
    id: "monster-hunter",
    name: "Monster Hunter",
    description: "Defeat 10 enemies in a single run",
    icon: "🏹",
    criteria: (stats) => stats.enemiesDefeated >= 10,
    rarity: "rare",
  },
  {
    id: "exterminator",
    name: "Exterminator",
    description: "Defeat 20 enemies in a single run",
    icon: "💀",
    criteria: (stats) => stats.enemiesDefeated >= 20,
    rarity: "legendary",
  },
  {
    id: "dungeon-cleaner",
    name: "Dungeon Cleaner",
    description: "Defeat 30+ enemies in a single run",
    icon: "🧹",
    criteria: (stats) => stats.enemiesDefeated >= 30,
    rarity: "legendary",  // Keep as legendary despite being potentially impossible
  },

  // Weapon preference badges
  {
    id: "swordmaster",
    name: "Swordmaster",
    description: "Defeat 10 enemies with your sword",
    icon: "⚔️",
    criteria: (stats) => (stats.enemiesKilledBySword ?? 0) >= 10,
    rarity: "epic",
  },
  {
    id: "rock-thrower",
    name: "Rock Thrower",
    description: "Defeat 5 enemies with rocks",
    icon: "🪨",
    criteria: (stats) => (stats.enemiesKilledByRock ?? 0) >= 5,
    rarity: "rare",
  },
  {
    id: "rune-master",
    name: "Rune Master",
    description: "Defeat 3 stone goblins with runes",
    icon: "🔮",
    criteria: (stats) => (stats.enemiesKilledByRune ?? 0) >= 3,
    rarity: "legendary",
  },

  // Survival badges
  {
    id: "untouchable",
    name: "Untouchable",
    description: "Complete a run without taking damage",
    icon: "🛡️",
    criteria: (stats, gameState) => gameState.win === true && stats.damageTaken === 0,
    rarity: "legendary",
  },
  {
    id: "survivor",
    name: "Survivor",
    description: "Complete a run with 1 health remaining",
    icon: "❤️‍🩹",
    criteria: (stats, gameState) => gameState.win === true && gameState.heroHealth === 1,
    rarity: "rare",
  },
  {
    id: "healthy",
    name: "Healthy",
    description: "Complete a run with full health",
    icon: "💪",
    criteria: (stats, gameState) => gameState.win === true && gameState.heroHealth === (gameState.heroMaxHealth ?? 5),
    rarity: "common",
  },

  // Item usage badges
  {
    id: "rock-finder",
    name: "Rock Finder",
    description: "Collect all 12 rocks in a single run",
    icon: "🗿",
    criteria: (stats) => (stats.rocksCollected ?? 0) >= 12,
    rarity: "rare",
  },
  {
    id: "pitcher",
    name: "Pitcher",
    description: "Throw 10 rocks in a single run",
    icon: "🎯",
    criteria: (stats) => (stats.rocksThrown ?? 0) >= 10,
    rarity: "epic",
  },
  {
    id: "rock-collector",
    name: "Rock Hoarder",
    description: "End with 8+ rocks in inventory",
    icon: "💎",
    criteria: (stats, gameState) => (gameState.rockCount ?? 0) >= 8,
    rarity: "epic",
  },
  {
    id: "hoarder",
    name: "Hoarder",
    description: "Collect 20 total items in a single run",
    icon: "🎒",
    criteria: (stats) => (stats.itemsCollected ?? 0) >= 20,
    rarity: "legendary",
  },
  {
    id: "treasure-hunter",
    name: "Treasure Hunt",
    description: "Open all 4 chests",
    icon: "💰",
    criteria: (stats) => (stats.chestsOpened ?? 0) >= 4,
    rarity: "common",
  },

  // Challenge badges
  {
    id: "speedrunner",
    name: "Speed Run",
    description: "Complete a run in under 250 steps",
    icon: "⚡",
    criteria: (stats, gameState) => gameState.win === true && stats.steps < 250,
    rarity: "legendary",
  },
  {
    id: "marathon",
    name: "Marathon",
    description: "Take 1000+ steps in a single run",
    icon: "🏃",
    criteria: (stats) => stats.steps >= 1000,
    rarity: "epic",
  },
  {
    id: "poisoned",
    name: "Toxic Resist",
    description: "Survive 30 steps while poisoned",
    icon: "☠️",
    criteria: (stats) => (stats.poisonSteps ?? 0) >= 30,
    rarity: "epic",
  },
  {
    id: "ghost-whisperer",
    name: "Ghost Buster",
    description: "Make 3 ghosts vanish in a single run",
    icon: "👻",
    criteria: (stats) => (stats.ghostsVanished ?? 0) >= 3,
    rarity: "rare",
  },

  // Pacifist/minimalist badges
  {
    id: "pacifist",
    name: "Pacifist",
    description: "Complete a run defeating 6 or fewer enemies",
    icon: "☮️",
    criteria: (stats, gameState) => gameState.win === true && stats.enemiesDefeated <= 6,
    rarity: "legendary",
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "Complete a run without picking up rocks, food, or potions",
    icon: "🎋",
    criteria: (stats, gameState) => 
      gameState.win === true && 
      (stats.rocksCollected ?? 0) === 0 && 
      (stats.foodUsed ?? 0) === 0 && 
      (stats.potionsUsed ?? 0) === 0,
    rarity: "legendary",
  },

  // Enemy type specific
  {
    id: "snake-hater",
    name: "Snake Hater",
    description: "Defeat 2+ snakes",
    icon: "🐍",
    criteria: (stats) => (stats.byKind?.snake ?? 0) >= 2,
    rarity: "epic",
  },
];

export function calculateBadges(stats: GameState["stats"], gameState: Partial<GameState>): Badge[] {
  return BADGES.filter(badge => badge.criteria(stats, gameState));
}

export function getBadgeById(id: string): Badge | undefined {
  return BADGES.find(badge => badge.id === id);
}

export function getBadgesByRarity(rarity: Badge["rarity"]): Badge[] {
  return BADGES.filter(badge => badge.rarity === rarity);
}
