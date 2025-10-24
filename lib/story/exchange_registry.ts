/**
 * Item Exchange Registry
 * 
 * Defines all item exchanges/swaps in the game (e.g., trading stones for a sword,
 * completing riddles for a reward, etc.)
 */

import type { GameState } from "../map/game-state";

export interface ExchangeRequirement {
  /** Type of requirement */
  type: "item" | "flag" | "custom";
  /** Item type if type is "item" (e.g., "rocks") */
  itemType?: keyof Pick<GameState, "rockCount" | "runeCount" | "foodCount">;
  /** Minimum count required */
  count?: number;
  /** Story flag if type is "flag" */
  flagId?: string;
  /** Custom check function if type is "custom" */
  check?: (gameState: GameState) => boolean;
}

export interface ExchangeReward {
  /** Type of reward */
  type: "item" | "flag";
  /** Item to give (e.g., "sword", "shield") */
  itemType?: "sword" | "shield" | "key" | "exitKey" | "snakeMedallion";
  /** Story flag to set if type is "flag" */
  flagId?: string;
  /** Value to set for the flag */
  flagValue?: boolean;
}

export interface ExchangeCost {
  /** Type of cost */
  type: "item";
  /** Item type to deduct */
  itemType: keyof Pick<GameState, "rockCount" | "runeCount" | "foodCount">;
  /** Amount to deduct */
  count: number;
}

export interface ExchangeDefinition {
  /** Unique ID for this exchange */
  id: string;
  /** NPC who offers this exchange */
  npcId: string;
  /** Display name for the exchange */
  name: string;
  /** Description shown to player */
  description: string;
  /** Requirements to unlock this exchange option */
  requirements: ExchangeRequirement[];
  /** What the player must give up */
  costs: ExchangeCost[];
  /** What the player receives */
  rewards: ExchangeReward[];
  /** Dialogue ID to show when offering the exchange */
  offerDialogueId?: string;
  /** Dialogue ID to show after completing the exchange */
  completionDialogueId?: string;
  /** Story flag to set when exchange is completed (prevents repeating) */
  completionFlagId?: string;
  /** Can this exchange be repeated? */
  repeatable?: boolean;
}

/**
 * Registry of all item exchanges in the game
 */
export const EXCHANGES: Record<string, ExchangeDefinition> = {
  "smithy-stones-for-sword": {
    id: "smithy-stones-for-sword",
    npcId: "npc-jorin",
    name: "Forge a Sword",
    description: "Trade 20 stones for a finely crafted sword",
    requirements: [
      {
        type: "item",
        itemType: "rockCount",
        count: 20,
      },
    ],
    costs: [
      {
        type: "item",
        itemType: "rockCount",
        count: 20,
      },
    ],
    rewards: [
      {
        type: "item",
        itemType: "sword",
      },
    ],
    offerDialogueId: "jorin-sword-offer",
    completionDialogueId: "jorin-sword-complete",
    completionFlagId: "smithy-forged-sword",
    repeatable: false,
  },
  
  "snake-riddle-reward": {
    id: "snake-riddle-reward",
    npcId: "npc-bluff-coiled-snake",
    name: "Snake Medallion",
    description: "Receive the Snake Medallion for solving all riddles",
    requirements: [],
    costs: [],
    rewards: [
      {
        type: "item",
        itemType: "snakeMedallion",
      },
    ],
    completionFlagId: "received-snake-medallion",
    repeatable: false,
  },
};

/**
 * Check if an exchange is available for the player
 */
export function isExchangeAvailable(
  exchangeId: string,
  gameState: GameState
): boolean {
  const exchange = EXCHANGES[exchangeId];
  if (!exchange) return false;

  // Check if already completed and not repeatable
  if (!exchange.repeatable && gameState.storyFlags?.[exchange.completionFlagId || ""]) {
    return false;
  }

  // Check all requirements
  return exchange.requirements.every((req) => {
    switch (req.type) {
      case "item":
        if (!req.itemType || req.count === undefined) return false;
        const itemCount = gameState[req.itemType] ?? 0;
        return itemCount >= req.count;
      
      case "flag":
        if (!req.flagId) return false;
        return !!gameState.storyFlags?.[req.flagId];
      
      case "custom":
        if (!req.check) return false;
        return req.check(gameState);
      
      default:
        return false;
    }
  });
}

/**
 * Get all available exchanges for a specific NPC
 */
export function getAvailableExchangesForNPC(
  npcId: string,
  gameState: GameState
): ExchangeDefinition[] {
  return Object.values(EXCHANGES)
    .filter((exchange) => exchange.npcId === npcId)
    .filter((exchange) => isExchangeAvailable(exchange.id, gameState));
}

/**
 * Perform an exchange - deduct costs and grant rewards
 */
export function performExchange(
  exchangeId: string,
  gameState: GameState
): GameState {
  const exchange = EXCHANGES[exchangeId];
  if (!exchange) return gameState;

  // Verify exchange is available
  if (!isExchangeAvailable(exchangeId, gameState)) {
    console.warn(`[Exchange] Attempted unavailable exchange: ${exchangeId}`);
    return gameState;
  }

  let newState = { ...gameState };

  // Deduct costs
  for (const cost of exchange.costs) {
    if (cost.type === "item" && cost.itemType) {
      const currentCount = newState[cost.itemType] ?? 0;
      newState = {
        ...newState,
        [cost.itemType]: Math.max(0, currentCount - cost.count),
      };
    }
  }

  // Grant rewards
  for (const reward of exchange.rewards) {
    if (reward.type === "item" && reward.itemType) {
      switch (reward.itemType) {
        case "sword":
          newState = { ...newState, hasSword: true };
          break;
        case "shield":
          newState = { ...newState, hasShield: true };
          break;
        case "key":
          newState = { ...newState, hasKey: true };
          break;
        case "exitKey":
          newState = { ...newState, hasExitKey: true };
          break;
        case "snakeMedallion":
          newState = { ...newState, hasSnakeMedallion: true };
          break;
      }
    } else if (reward.type === "flag" && reward.flagId) {
      newState = {
        ...newState,
        storyFlags: {
          ...newState.storyFlags,
          [reward.flagId]: reward.flagValue ?? true,
        },
      };
    }
  }

  // Mark exchange as completed
  if (exchange.completionFlagId) {
    newState = {
      ...newState,
      storyFlags: {
        ...newState.storyFlags,
        [exchange.completionFlagId]: true,
      },
    };
  }

  return newState;
}
