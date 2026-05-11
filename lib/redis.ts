import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export interface DailyCompletion {
  outcome: "win" | "dead";
  floor: number;
  steps: number;
  enemiesDefeated: number;
  heroHealth: number;
}

export interface DailyStats {
  totalPlayers: number;
  winRate: number;
  avgFloor: number;
  avgEnemiesDefeated: number;
  avgSteps: number;
}

export function getDailyKey(date: string): string {
  return `daily:completions:${date}`;
}

export function aggregateCompletions(completions: DailyCompletion[]): DailyStats {
  if (completions.length === 0) {
    return { totalPlayers: 0, winRate: 0, avgFloor: 0, avgEnemiesDefeated: 0, avgSteps: 0 };
  }
  const wins = completions.filter((c) => c.outcome === "win").length;
  const total = completions.length;
  return {
    totalPlayers: total,
    winRate: Math.round((wins / total) * 100),
    avgFloor: Math.round((completions.reduce((s, c) => s + c.floor, 0) / total) * 10) / 10,
    avgEnemiesDefeated: Math.round(completions.reduce((s, c) => s + c.enemiesDefeated, 0) / total),
    avgSteps: Math.round(completions.reduce((s, c) => s + c.steps, 0) / total),
  };
}
