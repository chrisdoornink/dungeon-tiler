/**
 * Client for the endless-run attestation + leaderboard API.
 *
 * Every call is fail-soft: the game never blocks on the network. A run whose
 * calls fail simply ends up unverified — the local best (EndlessStorage) still
 * works, it just can't enter the public board.
 */

import { getOrCreateUserId as getUserId } from "./posthog_analytics";
import type { GameState } from "./map";

export interface LeaderboardEntry {
  playerId: string; // truncated server-side; display only
  name: string;
  floor: number;
}

export interface LeaderboardData {
  top: LeaderboardEntry[];
  totalPlayers: number;
  rank: number | null;
  bestFloor: number | null;
}

export interface SubmitResult {
  verified: boolean;
  floor?: number;
  rank?: number | null;
  bestFloor?: number | null;
  top?: LeaderboardEntry[];
  totalPlayers?: number;
}

const NAME_KEY = "endlessPlayerName";

export function getEndlessPlayerName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setEndlessPlayerName(name: string): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NAME_KEY, name.slice(0, 16));
    }
  } catch {
    // ignore
  }
}

function statsPayload(state: GameState) {
  return {
    steps: state.stats.steps,
    enemiesDefeated: state.stats.enemiesDefeated,
    damageDealt: state.stats.damageDealt,
    damageTaken: state.stats.damageTaken,
    hasSword: !!state.hasSword,
    hasShield: !!state.hasShield,
    heroMaxHealth: state.heroMaxHealth ?? 5,
  };
}

/** Register a fresh run with the server; returns the runId or null on failure. */
export async function startEndlessRun(): Promise<string | null> {
  try {
    const res = await fetch("/api/endless-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", playerId: getUserId() }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { runId?: string };
    return data.runId ?? null;
  } catch {
    return null;
  }
}

/** Report entering `floor`; fire-and-forget from the floor transition. */
export function reportEndlessCheckpoint(state: GameState, floor: number): void {
  if (!state.endlessRunId) return;
  try {
    void fetch("/api/endless-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "checkpoint",
        runId: state.endlessRunId,
        floor,
        stats: statsPayload(state),
      }),
    });
  } catch {
    // ignore
  }
}

/** Submit the finished run. The server scores it from its own verified floor. */
export async function submitEndlessRun(state: GameState): Promise<SubmitResult | null> {
  try {
    const res = await fetch("/api/endless-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        runId: state.endlessRunId ?? "",
        name: getEndlessPlayerName(),
        stats: statsPayload(state),
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as SubmitResult;
  } catch {
    return null;
  }
}

export async function fetchEndlessLeaderboard(): Promise<LeaderboardData | null> {
  try {
    const res = await fetch(
      `/api/endless-run?playerId=${encodeURIComponent(getUserId())}`
    );
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardData;
  } catch {
    return null;
  }
}

export async function saveEndlessPlayerName(name: string): Promise<void> {
  setEndlessPlayerName(name);
  try {
    await fetch("/api/endless-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setName", playerId: getUserId(), name }),
    });
  } catch {
    // ignore
  }
}
