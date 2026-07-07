// Analytics helper using PostHog
// All functions no-op safely when PostHog is unavailable.

import * as posthogAnalytics from './posthog_analytics';

// Domain-specific wrappers for convenience
export function trackGameStart(params: {
  mode: "daily" | "normal" | "endless";
  mapId?: string;
  dateSeed?: string; // YYYY-MM-DD when daily
  algorithm?: string;
}) {
  posthogAnalytics.trackGameStart(params);
}

export function trackGameComplete(params: {
  outcome: "win" | "dead";
  mode: "daily" | "normal" | "endless";
  mapId?: string;
  dateSeed?: string;
  heroHealth: number;
  steps: number;
  enemiesDefeated: number;
  damageDealt: number;
  damageTaken: number;
  byKind?: Record<string, number>;
  deathCause?: string;
  deathCauseEnemyKind?: string;
  currentFloor?: number;
  chestsOpened?: number;
  totalChests?: number;
  hasSword?: boolean;
  hasShield?: boolean;
  treesDestroyed?: number;
  wallsDestroyed?: number;
  reachedOutsideWorld?: boolean;
  reachedPinkRealm?: boolean;
}) {
  posthogAnalytics.trackGameComplete(params);
}

export function trackOutsideWorldReached(params?: { mode?: "daily" | "normal" | "endless"; floor?: number; dateSeed?: string }) {
  posthogAnalytics.trackOutsideWorldReached(params);
}

export function trackOutsideTreeDestroyed(params?: { mode?: "daily" | "normal" | "endless"; count?: number; floor?: number; dateSeed?: string }) {
  posthogAnalytics.trackOutsideTreeDestroyed(params);
}

export function trackFloorAdvance(params: {
  mode?: "daily" | "normal" | "endless";
  fromFloor: number;
  toFloor: number;
  hasSword?: boolean;
  hasShield?: boolean;
  hasKey?: boolean;
  dateSeed?: string;
}) {
  posthogAnalytics.trackFloorAdvance(params);
}

export function trackPickup(name: "key" | "exit_key" | "sword" | "shield" | "rock" | "rune" | "bomb" | "food" | "potion" | "pink_heart" | "berry") {
  posthogAnalytics.trackPickup(name);
}

export function trackUse(name: "rock" | "rune" | "bomb" | "food" | "potion" | "pink_heart" | "berry") {
  posthogAnalytics.trackUse(name);
}

export function trackPinkRealmReached(params?: { mode?: "daily" | "normal" | "endless"; floor?: number; dateSeed?: string }) {
  posthogAnalytics.trackPinkRealmReached(params);
}

export function trackShare(params: {
  surface: "end_screen" | "daily_completed";
  mode?: "daily" | "normal" | "endless";
  outcome?: "win" | "dead";
  levelReached?: number;
  dateSeed?: string;
  method?: "native_share" | "clipboard";
}) {
  posthogAnalytics.trackShare(params);
}
