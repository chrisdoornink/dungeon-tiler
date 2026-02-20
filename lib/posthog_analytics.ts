import posthog from 'posthog-js';

// PostHog analytics wrapper for dungeon-tiler game
// Provides user identification and event tracking

type EventParams = Record<string, unknown>;

// Generate a persistent anonymous user ID
function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'server-user';
  
  const storageKey = 'dungeon-tiler-user-id';
  let userId = localStorage.getItem(storageKey);
  
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(storageKey, userId);
  }
  
  return userId;
}

// Initialize user identification
export function identifyUser() {
  if (typeof window === 'undefined') return;
  
  try {
    const userId = getOrCreateUserId();
    posthog.identify(userId, {
      game: 'dungeon-tiler',
      platform: 'web'
    });
  } catch (error) {
    console.warn('PostHog identify failed:', error);
  }
}

// Safe PostHog event capture
function captureEvent(eventName: string, properties?: EventParams) {
  if (typeof window === 'undefined') return;
  
  try {
    posthog.capture(eventName, {
      ...properties,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('PostHog capture failed:', error);
  }
}

// Game-specific event tracking functions
export function trackGameStart(params: {
  mode: "daily" | "normal";
  mapId?: string;
  dateSeed?: string;
  algorithm?: string;
}) {
  captureEvent('game_start', {
    game_mode: params.mode,
    map_id: params.mapId,
    date_seed: params.dateSeed,
    algorithm: params.algorithm
  });
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
  deathCauseEnemyKind?: string;
  currentFloor?: number;
}) {
  captureEvent('game_complete', {
    outcome: params.outcome,
    game_mode: params.mode,
    map_id: params.mapId,
    date_seed: params.dateSeed,
    hero_health: params.heroHealth,
    steps: params.steps,
    enemies_defeated: params.enemiesDefeated,
    damage_dealt: params.damageDealt,
    damage_taken: params.damageTaken,
    enemies_by_kind: params.byKind,
    death_cause: params.deathCause,
    death_cause_enemy_kind: params.deathCauseEnemyKind,
    level_reached: params.currentFloor != null ? String(params.currentFloor) : undefined
  });
}

export function trackPickup(item: "key" | "exit_key" | "sword" | "shield" | "rock" | "rune" | "food" | "potion") {
  captureEvent('item_pickup', { item });
}

export function trackUse(item: "rock" | "rune" | "food" | "potion") {
  captureEvent('item_use', { item });
}

export function trackDailyChallenge(action: 'intro_viewed' | 'started' | 'completed', params?: EventParams) {
  captureEvent('daily_challenge', {
    action,
    ...params
  });
}

export function trackPageView(page: string) {
  captureEvent('$pageview', { 
    $current_url: window.location.href,
    page 
  });
}

// Combat events
export function trackCombat(params: {
  enemy_type: string;
  damage_dealt: number;
  damage_taken: number;
  critical_hit?: boolean;
  enemy_defeated?: boolean;
}) {
  captureEvent('combat_action', params);
}

// Map interaction events
export function trackMapInteraction(params: {
  tile_type: string;
  action: string;
  position?: { x: number; y: number };
}) {
  captureEvent('map_interaction', params);
}

export function trackFeedback(params: {
  message: string;
  email?: string;
  url?: string;
}) {
  captureEvent('user_feedback', {
    message: params.message,
    email: params.email,
    url: params.url,
  });
}
