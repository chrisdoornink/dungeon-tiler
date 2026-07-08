/**
 * Endless mode local records: best floor reached plus a summary of the last run,
 * persisted in localStorage. The floor reached is the score.
 */

import type { DeathCause } from "./death_message";

const ENDLESS_DATA_KEY = "endlessMode";

export interface EndlessRunSummary {
  floor: number;
  enemiesDefeated: number;
  steps: number;
  damageDealt: number;
  damageTaken: number;
  hasSword: boolean;
  hasShield: boolean;
  diedAt: string; // ISO timestamp
  // Full cause so the game-over screen can say e.g. "Slain by Fire Goblin".
  deathCause?: DeathCause;
}

export interface EndlessData {
  bestFloor: number;
  bestAt: string; // ISO timestamp of when the best was set
  totalRuns: number;
  lastRun?: EndlessRunSummary;
}

export class EndlessStorage {
  static load(): EndlessData | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(ENDLESS_DATA_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as EndlessData;
      if (typeof parsed?.bestFloor !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Record a finished run; returns whether it set a new best floor. */
  static recordRun(run: EndlessRunSummary): { isNewBest: boolean; data: EndlessData } {
    const prev = EndlessStorage.load();
    const isNewBest = !prev || run.floor > prev.bestFloor;
    const data: EndlessData = {
      bestFloor: isNewBest ? run.floor : prev.bestFloor,
      bestAt: isNewBest ? run.diedAt : prev.bestAt,
      totalRuns: (prev?.totalRuns ?? 0) + 1,
      lastRun: run,
    };
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ENDLESS_DATA_KEY, JSON.stringify(data));
      }
    } catch {
      // storage may be unavailable; the run still counts for this session
    }
    return { isNewBest, data };
  }
}
