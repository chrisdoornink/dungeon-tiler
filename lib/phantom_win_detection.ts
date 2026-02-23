import { DateUtils } from './date_utils';
import { DailyChallengeData } from './daily_challenge_storage';

/**
 * Detects and undoes phantom completions in daily challenge data.
 *
 * A phantom win occurs when a stale saved game with win:true is loaded and
 * immediately triggers onDailyComplete, marking the user as having played
 * without them actually playing. This function cross-checks the completion
 * timestamp stored in dailyChallenge against lastGame.completedAt to detect
 * and roll back such phantom completions.
 *
 * Returns the (possibly mutated) data and whether it was a phantom.
 */
export function detectAndUndoPhantomWin(
  data: DailyChallengeData,
  lastGameRaw: string | null
): { data: DailyChallengeData; wasPhantom: boolean } {
  if (!data.todayCompleted) {
    return { data, wasPhantom: false };
  }

  try {
    const lastGame = lastGameRaw ? JSON.parse(lastGameRaw) : null;
    const lastGameCompletedAt: string = lastGame?.completedAt ?? '';
    const ourCompletedAt: string = data.completedAt ?? '';

    let isPhantom = false;

    if (!ourCompletedAt) {
      // Pre-fix save: no completedAt stored. Only flag as phantom if lastGame
      // exists and clearly doesn't corroborate today's completion.
      if (lastGame) {
        const steps = lastGame?.stats?.steps ?? 0;
        const completedDateStr = lastGameCompletedAt ? lastGameCompletedAt.slice(0, 10) : '';
        const completedToday = completedDateStr ? DateUtils.isToday(completedDateStr) : false;
        if (steps === 0 || !completedToday) {
          isPhantom = true;
        }
      }
      // If no lastGame at all, can't determine — leave as-is
    } else {
      // Post-fix save: compare our completedAt against lastGame.completedAt.
      // If they differ by more than 10 seconds, the completion wasn't from a real game.
      if (!lastGameCompletedAt) {
        isPhantom = true;
      } else {
        const diff = Math.abs(
          new Date(ourCompletedAt).getTime() - new Date(lastGameCompletedAt).getTime()
        );
        if (diff > 10000) {
          isPhantom = true;
        }
      }
    }

    if (isPhantom) {
      data.todayCompleted = false;
      data.todayResult = null;
      data.completedAt = undefined;
      // Also undo the phantom streak/count increments
      if (data.streakHistory.length > 0) {
        const last = data.streakHistory[data.streakHistory.length - 1];
        if (last.date === data.lastPlayedDate) {
          data.streakHistory.pop();
          data.totalGamesPlayed = Math.max(0, data.totalGamesPlayed - 1);
          if (last.result === 'won') {
            data.totalGamesWon = Math.max(0, data.totalGamesWon - 1);
          }
          const prev = data.streakHistory[data.streakHistory.length - 1];
          data.currentStreak = prev ? prev.streak : 0;
          data.lastPlayedDate = prev ? prev.date : '';
        }
      }
      return { data, wasPhantom: true };
    }
  } catch {}

  return { data, wasPhantom: false };
}
