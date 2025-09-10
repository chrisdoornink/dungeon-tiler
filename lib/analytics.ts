// Simple GA4 analytics helper. Assumes GA snippet is added (gtag.js).
// All functions no-op safely when window.gtag is unavailable.

type EventParams = Record<string, unknown>;

interface GtagWindow {
  gtag?: (event: string, name: string, params?: EventParams) => void;
}

function gtagSafe(event: string, name: string, params?: EventParams) {
  try {
    if (typeof window !== "undefined") {
      const w = window as unknown as GtagWindow;
      if (typeof w.gtag === "function") {
        w.gtag(event, name, params || {});
      }
    } else {
      // no-op
    }
  } catch {
    // swallow errors – analytics should never break gameplay
  }
}

export function logEvent(name: string, params?: EventParams) {
  gtagSafe("event", name, params);
}

// Domain-specific wrappers for convenience
export function trackGameStart(params: {
  mode: "daily" | "normal";
  mapId?: string;
  dateSeed?: string; // YYYY-MM-DD when daily
  algorithm?: string;
}) {
  logEvent("game_start", params);
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
}) {
  logEvent("game_complete", params);
}

export function trackPickup(name: "key" | "exit_key" | "sword" | "shield" | "rock" | "rune" | "food" | "potion") {
  logEvent("pickup", { item: name });
}

export function trackUse(name: "rock" | "rune" | "food" | "potion") {
  logEvent("use_item", { item: name });
}
