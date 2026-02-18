// Analytics helper using PostHog
// All functions no-op safely when PostHog is unavailable.

import * as posthogAnalytics from './posthog_analytics';

// Domain-specific wrappers for convenience
export function trackGameStart(params: {
  mode: "daily" | "normal";
  mapId?: string;
  dateSeed?: string; // YYYY-MM-DD when daily
  algorithm?: string;
}) {
  posthogAnalytics.trackGameStart(params);
}

export function trackGameComplete(params: {
  outcome: "win" | "dead";
  mode: "daily" | "normal";
  mapId?: string;
  dateSeed?: string;
  heroHealth: number;
  steps: number;
  enemiesDefeated: number;
  damageDealt: number;
  damageTaken: number;
  byKind?: Record<string, number>;
  deathCause?: string;
  currentFloor?: number;
}) {
  posthogAnalytics.trackGameComplete(params);
}

export function trackPickup(name: "key" | "exit_key" | "sword" | "shield" | "rock" | "rune" | "food" | "potion") {
  posthogAnalytics.trackPickup(name);
}

export function trackUse(name: "rock" | "rune" | "food" | "potion") {
  posthogAnalytics.trackUse(name);
}
