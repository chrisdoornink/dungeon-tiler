// Shaping + aggregation for the endgame stats dashboard.
//
// Source of truth is the `game_complete` PostHog event fired at the end of every
// daily run (win or death). Each event carries the full run summary, so a single
// event type answers most reporting questions:
//   1. Level 2 chest status  -> computed from `date_seed` (see daily_chest.ts)
//   2. reached pink realm     -> reached_pink_realm
//   3. reached outside world  -> reached_outside_world
//   4. blew up the tree       -> trees_destroyed > 0
//   5. reached/beat the boss  -> reached_boss_room / boss_defeated
// The DAY's boss-entrance kind (bomb/douse/moat-lava/moat-water) is instead computed
// deterministically from `date_seed` (see boss_day.ts) — analytics-independent,
// exactly like the chest status, so it's known even if nobody reached floor 3 yet.
//
// These functions are pure (no network) so the route can stay thin and the
// coercion / grouping logic is unit-testable against fixture rows.

import type { ChestItemMeta } from "./daily_chest";
import type { BossDayInfo } from "./boss_day";

/** One completed daily game, normalized from a PostHog `game_complete` row. */
export interface GameCompleteRow {
  day: string; // date_seed, YYYY-MM-DD (the daily-challenge identity)
  timestamp: string; // ISO string of when the run ended
  distinctId: string;
  outcome: "win" | "dead";
  levelReached: number | null;
  heroHealth: number | null;
  steps: number | null;
  enemiesDefeated: number | null;
  damageDealt: number | null;
  damageTaken: number | null;
  chestsOpened: number | null;
  totalChests: number | null;
  hasSword: boolean;
  hasShield: boolean;
  treesDestroyed: number;
  wallsDestroyed: number;
  reachedOutsideWorld: boolean;
  reachedPinkRealm: boolean;
  /** Exact chest items collected, e.g. ["sword","shield","extra_heart"]; [] if unrecorded. */
  collectedChestItems: string[];
  deathCause: string | null;
  deathCauseEnemyKind: string | null;
  /** Boss room (see boss-daily-entrances). Entrance kind/boss kind are recorded even
   *  if the room was never found, so "what kind of boss day was it" is always known. */
  reachedBossRoom: boolean;
  bossDefeated: boolean;
  bossEntranceKind: string | null;
  bossKind: string | null;
}

export interface DaySummary {
  total: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100, integer
  reachedPinkRealm: number; // # of games that reached the pink realm
  reachedOutsideWorld: number; // # of games that breached into the outside world
  blewUpTree: number; // # of games that destroyed >=1 tree
  avgLevelReached: number | null; // mean floor reached, 1 decimal
  reachedBossRoom: number; // # of games that found the day's boss room
  bossDefeated: number; // # of games that killed the boss
}

/** Level 2 chest status as sent to the client (icon paths + bomb flag). */
export interface ChestStatusPayload {
  items: Pick<ChestItemMeta, "key" | "label" | "icon">[];
  bombAvailable: boolean;
}

export interface StatsDayPayload {
  date: string; // YYYY-MM-DD
  chests: ChestStatusPayload;
  // The day's boss entrance, computed deterministically from the date (see
  // boss_day.ts) — reliable even if nobody that day reached floor 3 to record it
  // in analytics. Mirrors `chests` in spirit: a fact about the DAY, not a per-run
  // aggregate.
  bossDay: BossDayInfo;
  summary: DaySummary;
  games: GameCompleteRow[];
}

export interface EndgameStatsResponse {
  days: StatsDayPayload[];
  /** Pass as `beforeDay` to load the next (older) page; null when no more. */
  nextCursor: string | null;
  hasMore: boolean;
  /** False when PostHog read credentials are not configured on the server. */
  configured: boolean;
  message?: string;
}

// --- coercion helpers --------------------------------------------------------

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOr(v: unknown, fallback: number): number {
  const n = toNumberOrNull(v);
  return n === null ? fallback : Math.trunc(n);
}

/**
 * PostHog stores booleans as real JSON booleans, but older/mixed events can
 * surface them as the strings "true"/"false" (or 0/1). Treat all of those.
 */
function toBool(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.toLowerCase() === "true";
  if (typeof v === "number") return v !== 0;
  return false;
}

/**
 * Array-valued PostHog properties come back as a real array, but can also
 * surface as a JSON string. Normalize either into a string[].
 */
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      // fall through
    }
  }
  return [];
}

/**
 * Normalize a single plain-object record (column name -> value) into a
 * GameCompleteRow. Column names are the aliases used by the HogQL query below.
 */
export function toGameCompleteRow(rec: Record<string, unknown>): GameCompleteRow {
  const outcome = String(rec.outcome ?? "").toLowerCase() === "win" ? "win" : "dead";
  return {
    day: String(rec.day ?? ""),
    timestamp: String(rec.timestamp ?? ""),
    distinctId: String(rec.distinct_id ?? ""),
    outcome,
    levelReached: toNumberOrNull(rec.level_reached),
    heroHealth: toNumberOrNull(rec.hero_health),
    steps: toNumberOrNull(rec.steps),
    enemiesDefeated: toNumberOrNull(rec.enemies_defeated),
    damageDealt: toNumberOrNull(rec.damage_dealt),
    damageTaken: toNumberOrNull(rec.damage_taken),
    chestsOpened: toNumberOrNull(rec.chests_opened),
    totalChests: toNumberOrNull(rec.total_chests),
    hasSword: toBool(rec.has_sword),
    hasShield: toBool(rec.has_shield),
    treesDestroyed: toIntOr(rec.trees_destroyed, 0),
    wallsDestroyed: toIntOr(rec.walls_destroyed, 0),
    reachedOutsideWorld: toBool(rec.reached_outside_world),
    reachedPinkRealm: toBool(rec.reached_pink_realm),
    collectedChestItems: toStringArray(rec.collected_chest_items),
    deathCause: rec.death_cause == null ? null : String(rec.death_cause),
    deathCauseEnemyKind:
      rec.death_cause_enemy_kind == null ? null : String(rec.death_cause_enemy_kind),
    reachedBossRoom: toBool(rec.reached_boss_room),
    bossDefeated: toBool(rec.boss_defeated),
    bossEntranceKind: rec.boss_entrance_kind == null ? null : String(rec.boss_entrance_kind),
    bossKind: rec.boss_kind == null ? null : String(rec.boss_kind),
  };
}

/**
 * Map PostHog HogQL query output (`columns` + `results` rows-as-arrays) into
 * normalized GameCompleteRow objects.
 */
export function parseHogQLRows(
  columns: string[],
  results: unknown[][]
): GameCompleteRow[] {
  return results.map((row) => {
    const rec: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      rec[col] = row[i];
    });
    return toGameCompleteRow(rec);
  });
}

// --- aggregation -------------------------------------------------------------

export function summarizeDay(games: GameCompleteRow[]): DaySummary {
  const total = games.length;
  const wins = games.filter((g) => g.outcome === "win").length;
  const levels = games
    .map((g) => g.levelReached)
    .filter((n): n is number => n !== null);
  const avgLevelReached =
    levels.length > 0
      ? Math.round((levels.reduce((s, n) => s + n, 0) / levels.length) * 10) / 10
      : null;
  return {
    total,
    wins,
    losses: total - wins,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    reachedPinkRealm: games.filter((g) => g.reachedPinkRealm).length,
    reachedOutsideWorld: games.filter((g) => g.reachedOutsideWorld).length,
    blewUpTree: games.filter((g) => g.treesDestroyed > 0).length,
    avgLevelReached,
    reachedBossRoom: games.filter((g) => g.reachedBossRoom).length,
    bossDefeated: games.filter((g) => g.bossDefeated).length,
  };
}

/**
 * Group normalized rows by their daily `date_seed`, newest day first and newest
 * game first within each day. Rows with an empty day are dropped.
 */
export function groupRowsByDay(
  rows: GameCompleteRow[]
): { date: string; summary: DaySummary; games: GameCompleteRow[] }[] {
  const byDay = new Map<string, GameCompleteRow[]>();
  for (const row of rows) {
    if (!row.day) continue;
    const list = byDay.get(row.day);
    if (list) list.push(row);
    else byDay.set(row.day, [row]);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // date desc
    .map(([date, games]) => {
      const sorted = [...games].sort((a, b) =>
        a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0
      );
      return { date, summary: summarizeDay(sorted), games: sorted };
    });
}
