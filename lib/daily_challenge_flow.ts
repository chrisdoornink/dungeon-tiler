import {
  DailyChallengeStorage,
  DailyChallengeData,
} from "./daily_challenge_storage";
import { DateUtils } from "./date_utils";
import { CurrentGameStorage } from "./current_game_storage";

export enum DailyChallengeState {
  FIRST_TIME = "FIRST_TIME",
  DAILY_AVAILABLE = "DAILY_AVAILABLE",
  DAILY_COMPLETED = "DAILY_COMPLETED",
}

export interface DailyChallengeStateData {
  data: DailyChallengeData;
  today: string;
}

export class DailyChallengeFlow {
  /**
   * Determine the current state of the daily challenge flow
   */
  static getCurrentState(): DailyChallengeState {
    const data = DailyChallengeStorage.loadData();

    // First time user - show intro
    if (!data.hasSeenIntro) {
      // If there's any prior saved game, skip intro automatically.
      // Requirement: only show intro when there is no saved game data.
      try {
        if (typeof window !== "undefined") {
          const dailyChallenge = window.localStorage.getItem("dailyChallenge");
          if (!dailyChallenge) return DailyChallengeState.FIRST_TIME;
          const parsed = JSON.parse(dailyChallenge);
          if (
            parsed?.lastPlayedDate &&
            DateUtils.isToday(parsed.lastPlayedDate)
          ) {
            return DailyChallengeState.DAILY_COMPLETED;
          }
          return DailyChallengeState.DAILY_AVAILABLE;
        }
      } catch {
        // ignore storage access errors and fall back to intro
      }
      return DailyChallengeState.FIRST_TIME;
    }

    // Check if user completed today's challenge
    if (data.todayCompleted && DateUtils.isToday(data.lastPlayedDate)) {
      return DailyChallengeState.DAILY_COMPLETED;
    }

    // User can play today's challenge
    return DailyChallengeState.DAILY_AVAILABLE;
  }

  /**
   * Get current state data including challenge data and today's date
   */
  static getStateData(): DailyChallengeStateData {
    return {
      data: DailyChallengeStorage.loadData(),
      today: DateUtils.getTodayString(),
    };
  }

  /**
   * Handle completion of intro flow
   */
  static handleIntroComplete(): DailyChallengeData {
    return DailyChallengeStorage.markIntroSeen();
  }

  /**
   * Handle completion of daily challenge game
   */
  static handleGameComplete(result: "won" | "lost"): DailyChallengeData {
    const today = DateUtils.getTodayString();
    try {
      if (typeof window !== "undefined") {
        CurrentGameStorage.clearCurrentGame("daily");
      }
    } catch {}
    return DailyChallengeStorage.recordGameResult(result, today);
  }

  /**
   * Check if user can play today's challenge
   */
  static canPlayToday(): boolean {
    const data = DailyChallengeStorage.loadData();
    return !data.todayCompleted;
  }

  /**
   * Reset daily progress for a new day
   */
  static resetForNewDay(): DailyChallengeData {
    return DailyChallengeStorage.resetDailyProgress();
  }
}
