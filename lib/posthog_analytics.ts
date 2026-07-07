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

/**
 * Tag this person as a brand-new player (no prior local storage).
 *
 * Sets BOTH:
 *   - a super property (posthog.register) so `player_type=new_player` rides
 *     on every subsequent event this person fires — including their later
 *     daily `game_start` / `game_complete` — letting us slice the entire
 *     reporting tree by who came in fresh.
 *   - a person property so the flag survives in PostHog for cohort / funnel
 *     filtering even across devices once identified.
 *
 * `enteredViaTutorial` distinguishes the two first-run paths: the guided run
 * (`/new`, default true) vs. a new player who chose to skip the guide and jump
 * straight into the daily (pass `false`). Both are new players, but only the
 * former saw the walkthrough — keeping them sliceable lets us compare day-1
 * outcomes between guided and unguided newcomers.
 *
 * `first_tutorial_at` is set-once so re-entries don't overwrite the original
 * acquisition timestamp.
 */
export function markNewPlayer(opts?: { enteredViaTutorial?: boolean }) {
  if (typeof window === 'undefined') return;

  const enteredViaTutorial = opts?.enteredViaTutorial ?? true;

  try {
    posthog.register({ player_type: 'new_player' });
    posthog.setPersonProperties(
      { player_type: 'new_player', entered_via_tutorial: enteredViaTutorial },
      { first_tutorial_at: new Date().toISOString() }
    );
  } catch (error) {
    console.warn('PostHog markNewPlayer failed:', error);
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
  mode: "daily" | "normal" | "endless";
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
  // Run-level progress, for slicing completions (completionists, item-skips,
  // hidden-area explorers). All optional so older callers keep working.
  chestsOpened?: number;
  totalChests?: number;
  hasSword?: boolean;
  hasShield?: boolean;
  treesDestroyed?: number;
  wallsDestroyed?: number;
  reachedOutsideWorld?: boolean;
  reachedPinkRealm?: boolean;
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
    level_reached: params.currentFloor != null ? String(params.currentFloor) : undefined,
    chests_opened: params.chestsOpened,
    total_chests: params.totalChests,
    // "opened everything the run offered" — the completionist signal.
    all_chests_opened:
      params.chestsOpened != null && params.totalChests != null && params.totalChests > 0
        ? params.chestsOpened >= params.totalChests
        : undefined,
    has_sword: params.hasSword,
    has_shield: params.hasShield,
    trees_destroyed: params.treesDestroyed,
    walls_destroyed: params.wallsDestroyed,
    reached_outside_world: params.reachedOutsideWorld,
    reached_pink_realm: params.reachedPinkRealm,
  });
}

/**
 * Fire once per run the first time the player breaches an exterior wall and
 * steps into the outdoor grassland — a hidden, bomb-gated action. Pair with
 * unique game_start users to get a "% who found the outside world" rate.
 */
export function trackOutsideWorldReached(params?: {
  mode?: "daily" | "normal" | "endless";
  floor?: number;
  dateSeed?: string;
}) {
  captureEvent('outside_world_reached', {
    game_mode: params?.mode,
    floor: params?.floor,
    date_seed: params?.dateSeed,
  });
}

/**
 * Fire once per run the first time the player blows up a tree while in the
 * outdoor world. `count` carries how many trees had fallen at that point (>=1).
 */
export function trackOutsideTreeDestroyed(params?: {
  mode?: "daily" | "normal" | "endless";
  count?: number;
  floor?: number;
  dateSeed?: string;
}) {
  captureEvent('outside_tree_destroyed', {
    game_mode: params?.mode,
    count: params?.count,
    floor: params?.floor,
    date_seed: params?.dateSeed,
  });
}

/**
 * Fire on each floor transition in a daily run, carrying the loadout the player
 * carried up. Filtering `to_floor=2 & has_sword=false` answers "do people skip
 * the sword/shield and rush level two?".
 */
export function trackFloorAdvance(params: {
  mode?: "daily" | "normal" | "endless";
  fromFloor: number;
  toFloor: number;
  hasSword?: boolean;
  hasShield?: boolean;
  hasKey?: boolean;
  dateSeed?: string;
}) {
  captureEvent('floor_advanced', {
    game_mode: params.mode,
    from_floor: params.fromFloor,
    to_floor: params.toFloor,
    has_sword: params.hasSword,
    has_shield: params.hasShield,
    has_key: params.hasKey,
    date_seed: params.dateSeed,
  });
}

export function trackPickup(item: "key" | "exit_key" | "sword" | "shield" | "rock" | "rune" | "bomb" | "food" | "potion" | "pink_heart" | "berry") {
  captureEvent('item_pickup', { item });
}

export function trackUse(item: "rock" | "rune" | "bomb" | "food" | "potion" | "pink_heart" | "berry") {
  captureEvent('item_use', { item });
}

export function trackPinkRealmReached(params?: { mode?: "daily" | "normal" | "endless"; floor?: number; dateSeed?: string }) {
  captureEvent('pink_realm_reached', { ...params });
}

/**
 * Fire when the player taps the Share Results button on an end / completion
 * screen. `surface` distinguishes the two share buttons (the generic /end
 * screen vs. the daily completion screen). Pair this with `game_complete`
 * (or `daily_challenge` completed) per day to build a share-rate chart:
 *   share_clicked unique users / completions unique users.
 */
export function trackShare(params: {
  surface: "end_screen" | "daily_completed";
  mode?: "daily" | "normal" | "endless";
  outcome?: "win" | "dead";
  levelReached?: number;
  dateSeed?: string;
  method?: "native_share" | "clipboard";
}) {
  captureEvent('share_clicked', {
    surface: params.surface,
    game_mode: params.mode,
    outcome: params.outcome,
    level_reached: params.levelReached != null ? String(params.levelReached) : undefined,
    date_seed: params.dateSeed,
    method: params.method,
  });
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

// --- Tutorial funnel ---------------------------------------------------------
//
// The /new tutorial funnel in PostHog is built from three event types:
//   1. tutorial_landed (outcome=started)  — player kept on /new, tutorial began
//   2. tutorial_beat (one per dialogue)    — each scripted beat they reach
//   3. tutorial_completed                  — finished tutorial, handed to daily
//
// Returning / non-new players that hit /new fire tutorial_landed
// (outcome=redirected) so we can still count total /new traffic.

/**
 * Canonical order of tutorial beats for funnel step numbering. The real
 * play order isn't strictly linear (rock / chest / sword / shield can vary by
 * route), so `beat_step` is a best-effort ordinal — PostHog funnels can also
 * just key off `beat` directly when order matters less than reach.
 */
const TUTORIAL_BEAT_ORDER: string[] = [
  'welcome',
  'ghost-spotted',
  'ghost-snuffed',
  'light-relit',
  'goblin-intro',
  'rock-pickup',
  'goblin-defeated',
  'chest-locked',
  'sword-pickup',
  'shield-pickup',
  'low-health',
  'exit-approach',
];

/** Strip the `tutorial-` prefix and collapse the two low-health variants. */
function normalizeTutorialBeat(dialogueId: string): string {
  const base = dialogueId.replace(/^tutorial-/, '');
  if (base === 'low-health-no-food' || base === 'low-health-with-food') {
    return 'low-health';
  }
  return base;
}

export function trackTutorialLanded(params: {
  outcome: 'started' | 'redirected' | 'skipped';
  reason?: string;
}) {
  captureEvent('tutorial_landed', {
    outcome: params.outcome,
    reason: params.reason,
  });
}

/**
 * Fire once per scripted dialogue the player actually reaches. Called the
 * moment the queued dialogue becomes the active session (i.e. they got that
 * far), so each event marks real progress through the tutorial.
 */
export function trackTutorialBeat(dialogueId: string) {
  const beat = normalizeTutorialBeat(dialogueId);
  const idx = TUTORIAL_BEAT_ORDER.indexOf(beat);
  captureEvent('tutorial_beat', {
    beat,
    dialogue_id: dialogueId,
    beat_step: idx >= 0 ? idx + 1 : undefined,
  });
}

export function trackTutorialCompleted(params?: {
  heroHealth?: number;
  hasSword?: boolean;
  hasShield?: boolean;
  foodCount?: number;
  rockCount?: number;
}) {
  captureEvent('tutorial_completed', {
    hero_health: params?.heroHealth,
    has_sword: params?.hasSword,
    has_shield: params?.hasShield,
    food_count: params?.foodCount,
    rock_count: params?.rockCount,
  });
}
