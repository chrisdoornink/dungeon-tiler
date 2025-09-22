/**
 * Storage utility for continuous game state persistence
 * Enables auto-save/restore functionality to prevent loss on refresh
 */

import type { GameState } from './map';

const CURRENT_GAME_KEY = 'currentGame';
const DAILY_GAME_KEY = 'currentDailyGame';
const STORY_GAME_KEY = 'currentStoryGame';

export type GameStorageSlot = 'default' | 'daily' | 'story';

function keyForSlot(slot: GameStorageSlot): string {
  switch (slot) {
    case 'daily':
      return DAILY_GAME_KEY;
    case 'story':
      return STORY_GAME_KEY;
    default:
      return CURRENT_GAME_KEY;
  }
}

export interface StoredGameState extends GameState {
  lastSaved: number; // timestamp
  isDailyChallenge?: boolean;
}

export class CurrentGameStorage {
  /**
   * Save current game state to localStorage
   */
  static saveCurrentGame(
    gameState: GameState,
    slot: GameStorageSlot = 'default'
  ): void {
    if (typeof window === 'undefined') return;
    
    try {
      const storedState: StoredGameState = {
        ...gameState,
        lastSaved: Date.now(),
        isDailyChallenge: slot === 'daily',
      };
      const key = keyForSlot(slot);
      window.localStorage.setItem(key, JSON.stringify(storedState));
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

  /**
   * Load current game state from localStorage
   */
  static loadCurrentGame(slot: GameStorageSlot = 'default'): StoredGameState | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const key = keyForSlot(slot);
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      
      const parsed = JSON.parse(raw) as StoredGameState;
      
      // Validate that it's a valid game state
      if (!parsed.mapData || !parsed.stats || typeof parsed.heroHealth !== 'number') {
        return null;
      }
      
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Clear current game state (when game ends)
   */
  static clearCurrentGame(slot: GameStorageSlot = 'default'): void {
    if (typeof window === 'undefined') return;
    
    try {
      const key = keyForSlot(slot);
      window.localStorage.removeItem(key);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Check if a current game exists
   */
  static hasCurrentGame(slot: GameStorageSlot = 'default'): boolean {
    return this.loadCurrentGame(slot) !== null;
  }

  /**
   * Get the age of the saved game in milliseconds
   */
  static getGameAge(slot: GameStorageSlot = 'default'): number | null {
    const saved = this.loadCurrentGame(slot);
    if (!saved) return null;
    
    return Date.now() - saved.lastSaved;
  }
}
