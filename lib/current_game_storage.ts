/**
 * Storage utility for continuous game state persistence
 * Enables auto-save/restore functionality to prevent loss on refresh
 */

import type { GameState } from './map';

const CURRENT_GAME_KEY = 'currentGame';
const DAILY_GAME_KEY = 'currentDailyGame';

export interface StoredGameState extends GameState {
  lastSaved: number; // timestamp
  isDailyChallenge?: boolean;
}

export class CurrentGameStorage {
  /**
   * Save current game state to localStorage
   */
  static saveCurrentGame(gameState: GameState, isDailyChallenge = false): void {
    if (typeof window === 'undefined') return;
    
    try {
      const storedState: StoredGameState = {
        ...gameState,
        lastSaved: Date.now(),
        isDailyChallenge,
      };
      
      const key = isDailyChallenge ? DAILY_GAME_KEY : CURRENT_GAME_KEY;
      window.localStorage.setItem(key, JSON.stringify(storedState));
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

  /**
   * Load current game state from localStorage
   */
  static loadCurrentGame(isDailyChallenge = false): StoredGameState | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const key = isDailyChallenge ? DAILY_GAME_KEY : CURRENT_GAME_KEY;
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
  static clearCurrentGame(isDailyChallenge = false): void {
    if (typeof window === 'undefined') return;
    
    try {
      const key = isDailyChallenge ? DAILY_GAME_KEY : CURRENT_GAME_KEY;
      window.localStorage.removeItem(key);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Check if a current game exists
   */
  static hasCurrentGame(isDailyChallenge = false): boolean {
    return this.loadCurrentGame(isDailyChallenge) !== null;
  }

  /**
   * Get the age of the saved game in milliseconds
   */
  static getGameAge(isDailyChallenge = false): number | null {
    const saved = this.loadCurrentGame(isDailyChallenge);
    if (!saved) return null;
    
    return Date.now() - saved.lastSaved;
  }
}
