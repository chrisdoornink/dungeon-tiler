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
  // --- Legendary: the elite, win-gated feats ---
  {
    id: "untouchable",
    name: "Untouchable",
    description: "Win without taking any damage",
    icon: "🛡️",
    criteria: (stats, gameState) => gameState.win === true && stats.damageTaken === 0,
    rarity: "legendary",
  },
  {
    id: "pacifist",
    name: "Pacifist",
    description: "Win while defeating 6 or fewer enemies",
    icon: "☮️",
    criteria: (stats, gameState) => gameState.win === true && stats.enemiesDefeated <= 6,
    rarity: "legendary",
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "Win without picking up rocks, food, or potions",
    icon: "🎋",
    criteria: (stats, gameState) =>
      gameState.win === true &&
      (stats.rocksCollected ?? 0) === 0 &&
      (stats.foodUsed ?? 0) === 0 &&
      (stats.potionsUsed ?? 0) === 0,
    rarity: "legendary",
  },
  {
    id: "exterminator",
    name: "Exterminator",
    description: "Defeat 18 enemies in a single run",
    icon: "💀",
    criteria: (stats) => stats.enemiesDefeated >= 18,
    rarity: "legendary",
  },

  // --- Epic: hard, skill-driven feats ---
  {
    id: "rune-master",
    name: "Rune Master",
    description: "Defeat 2 stone goblins with runes",
    icon: "🔮",
    criteria: (stats) => (stats.enemiesKilledByRune ?? 0) >= 2,
    rarity: "epic",
  },
  {
    id: "swordmaster",
    name: "Swordmaster",
    description: "Defeat 10 enemies with your sword",
    icon: "⚔️",
    criteria: (stats) => (stats.enemiesKilledBySword ?? 0) >= 10,
    rarity: "epic",
  },
  {
    id: "rock-finder",
    name: "Rock Finder",
    description: "Collect all 12 rocks in a single run",
    icon: "🗿",
    criteria: (stats) => (stats.rocksCollected ?? 0) >= 12,
    rarity: "epic",
  },
  {
    id: "survivor",
    name: "Survivor",
    description: "Win with 1 health remaining",
    icon: "❤️‍🩹",
    criteria: (stats, gameState) => gameState.win === true && gameState.heroHealth === 1,
    rarity: "epic",
  },
  {
    id: "treasure-hunter",
    name: "Treasure Hunter",
    description: "Open all 4 chests in a single run",
    icon: "💰",
    criteria: (stats) => (stats.chestsOpened ?? 0) >= 4,
    rarity: "epic",
  },
  {
    id: "speedrunner",
    name: "Speed Run",
    description: "Win in under 250 steps",
    icon: "⚡",
    criteria: (stats, gameState) => gameState.win === true && stats.steps < 250,
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
    id: "snake-hater",
    name: "Snake Hater",
    description: "Defeat 2 snakes in a single run",
    icon: "🐍",
    criteria: (stats) => (stats.byKind?.snake ?? 0) >= 2,
    rarity: "epic",
  },

  // --- Rare: solid, achievable accomplishments ---
  {
    id: "rock-thrower",
    name: "Rock Thrower",
    description: "Defeat 5 enemies with rocks",
    icon: "🪨",
    criteria: (stats) => (stats.enemiesKilledByRock ?? 0) >= 5,
    rarity: "rare",
  },
  {
    id: "ghost-whisperer",
    name: "Ghost Buster",
    description: "Make 3 ghosts vanish in a single run",
    icon: "👻",
    criteria: (stats) => (stats.ghostsVanished ?? 0) >= 3,
    rarity: "rare",
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
