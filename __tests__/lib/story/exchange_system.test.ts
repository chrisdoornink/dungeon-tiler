import {
  EXCHANGES,
  isExchangeAvailable,
  getAvailableExchangesForNPC,
  performExchange,
} from "../../../lib/story/exchange_registry";
import type { GameState } from "../../../lib/map/game-state";
import { createInitialStoryFlags } from "../../../lib/story/event_registry";

describe("Exchange System", () => {
  describe("Smithy Sword Exchange", () => {
    it("should not be available with less than 20 stones", () => {
      const gameState: Partial<GameState> = {
        rockCount: 15,
        storyFlags: createInitialStoryFlags(),
      };
      
      const available = isExchangeAvailable(
        "smithy-stones-for-sword",
        gameState as GameState
      );
      
      expect(available).toBe(false);
    });

    it("should be available with exactly 20 stones", () => {
      const gameState: Partial<GameState> = {
        rockCount: 20,
        storyFlags: createInitialStoryFlags(),
      };
      
      const available = isExchangeAvailable(
        "smithy-stones-for-sword",
        gameState as GameState
      );
      
      expect(available).toBe(true);
    });

    it("should be available with more than 20 stones", () => {
      const gameState: Partial<GameState> = {
        rockCount: 25,
        storyFlags: createInitialStoryFlags(),
      };
      
      const available = isExchangeAvailable(
        "smithy-stones-for-sword",
        gameState as GameState
      );
      
      expect(available).toBe(true);
    });

    it("should not be available after already completing the exchange", () => {
      const gameState: Partial<GameState> = {
        rockCount: 25,
        storyFlags: {
          ...createInitialStoryFlags(),
          "smithy-forged-sword": true,
        },
      };
      
      const available = isExchangeAvailable(
        "smithy-stones-for-sword",
        gameState as GameState
      );
      
      expect(available).toBe(false);
    });

    it("should deduct 20 stones and grant sword when performed", () => {
      const gameState: Partial<GameState> = {
        rockCount: 25,
        hasSword: false,
        storyFlags: createInitialStoryFlags(),
      };
      
      const newState = performExchange(
        "smithy-stones-for-sword",
        gameState as GameState
      );
      
      expect(newState.rockCount).toBe(5); // 25 - 20 = 5
      expect(newState.hasSword).toBe(true);
      expect(newState.storyFlags?.["smithy-forged-sword"]).toBe(true);
    });

    it("should not perform exchange if not available", () => {
      const gameState: Partial<GameState> = {
        rockCount: 15, // Not enough
        hasSword: false,
        storyFlags: createInitialStoryFlags(),
      };
      
      const newState = performExchange(
        "smithy-stones-for-sword",
        gameState as GameState
      );
      
      // State should be unchanged
      expect(newState.rockCount).toBe(15);
      expect(newState.hasSword).toBe(false);
    });
  });

  describe("NPC Exchange Lookup", () => {
    it("should return sword exchange for Jorin when available", () => {
      const gameState: Partial<GameState> = {
        rockCount: 20,
        storyFlags: createInitialStoryFlags(),
      };
      
      const exchanges = getAvailableExchangesForNPC(
        "npc-jorin",
        gameState as GameState
      );
      
      expect(exchanges).toHaveLength(1);
      expect(exchanges[0].id).toBe("smithy-stones-for-sword");
    });

    it("should return empty array for Jorin when not enough stones", () => {
      const gameState: Partial<GameState> = {
        rockCount: 10,
        storyFlags: createInitialStoryFlags(),
      };
      
      const exchanges = getAvailableExchangesForNPC(
        "npc-jorin",
        gameState as GameState
      );
      
      expect(exchanges).toHaveLength(0);
    });

    it("should return empty array for NPC with no exchanges", () => {
      const gameState: Partial<GameState> = {
        rockCount: 100,
        storyFlags: createInitialStoryFlags(),
      };
      
      const exchanges = getAvailableExchangesForNPC(
        "npc-elder-rowan",
        gameState as GameState
      );
      
      expect(exchanges).toHaveLength(0);
    });
  });

  describe("Exchange Registry", () => {
    it("should have smithy sword exchange defined", () => {
      expect(EXCHANGES["smithy-stones-for-sword"]).toBeDefined();
      expect(EXCHANGES["smithy-stones-for-sword"].npcId).toBe("npc-jorin");
      expect(EXCHANGES["smithy-stones-for-sword"].repeatable).toBe(false);
    });
  });
});
