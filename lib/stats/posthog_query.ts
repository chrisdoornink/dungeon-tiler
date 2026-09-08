// Server-only PostHog read helpers shared by the /stats API routes.
//
// Reading events needs a *personal* API key + numeric project id — the public `phc_`
// ingest key used by the browser cannot read data. Configure on the server (never
// NEXT_PUBLIC_*):
//   POSTHOG_PERSONAL_API_KEY  (or POSTHOG_API_KEY)
//   POSTHOG_PROJECT_ID        (numeric, from Project Settings)
//   POSTHOG_HOST              (optional, defaults to https://us.posthog.com)

export interface PostHogConfig {
  apiKey: string;
  projectId: string;
  host: string;
}

export interface HogQLResult {
  columns: string[];
  results: unknown[][];
}

export function getPostHogConfig(): PostHogConfig {
  const apiKey =
    process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_API_KEY || "";
  const projectId = process.env.POSTHOG_PROJECT_ID || "";
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(
    /\/$/,
    ""
  );
  return { apiKey, projectId, host };
}

export async function runHogQL(
  query: string,
  cfg: PostHogConfig
): Promise<HogQLResult> {
  const res = await fetch(`${cfg.host}/api/projects/${cfg.projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PostHog query failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return (await res.json()) as HogQLResult;
}

/** Escape a value for use inside a single-quoted HogQL string literal. */
export function hogQLString(v: string): string {
  return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// PostHog type-infers `date_seed` as a DateTime (it looks like a date), so
// `properties.date_seed` comes back as "2026-07-24T00:00:00Z". We need the raw
// stored "2026-07-24" string — both to page/group cleanly and because it is the
// exact value that seeded the chest generation. JSONExtractString reads it
// straight out of the properties JSON with no date parsing (no timezone shift).
export const DAY_EXPR = "JSONExtractString(properties, 'date_seed')";

// Fixed select order for game_complete rows. Results are mapped by POSITION using
// these names (rather than trusting PostHog's returned column labels), so the shape
// is stable regardless of how the API echoes aliases. The `day` expression is a
// parameter because the daily view keys on date_seed while the per-player view also
// has to place endless/normal runs (no date_seed) on a calendar day.
export const ROW_COLUMNS = [
  "day",
  "timestamp",
  "distinct_id",
  "game_mode",
  "outcome",
  "level_reached",
  "hero_health",
  "steps",
  "enemies_defeated",
  "damage_dealt",
  "damage_taken",
  "chests_opened",
  "total_chests",
  "has_sword",
  "has_shield",
  "trees_destroyed",
  "walls_destroyed",
  "reached_outside_world",
  "reached_pink_realm",
  "collected_chest_items",
  "death_cause",
  "death_cause_enemy_kind",
  "reached_boss_room",
  "boss_defeated",
  "boss_entrance_kind",
  "boss_kind",
  "daily_boss_kind",
] as const;

export function rowSelect(dayExpr: string = DAY_EXPR): string {
  return `
  ${dayExpr} AS day,
  timestamp AS timestamp,
  distinct_id AS distinct_id,
  properties.game_mode AS game_mode,
  properties.outcome AS outcome,
  properties.level_reached AS level_reached,
  properties.hero_health AS hero_health,
  properties.steps AS steps,
  properties.enemies_defeated AS enemies_defeated,
  properties.damage_dealt AS damage_dealt,
  properties.damage_taken AS damage_taken,
  properties.chests_opened AS chests_opened,
  properties.total_chests AS total_chests,
  properties.has_sword AS has_sword,
  properties.has_shield AS has_shield,
  properties.trees_destroyed AS trees_destroyed,
  properties.walls_destroyed AS walls_destroyed,
  properties.reached_outside_world AS reached_outside_world,
  properties.reached_pink_realm AS reached_pink_realm,
  properties.collected_chest_items AS collected_chest_items,
  properties.death_cause AS death_cause,
  properties.death_cause_enemy_kind AS death_cause_enemy_kind,
  properties.reached_boss_room AS reached_boss_room,
  properties.boss_defeated AS boss_defeated,
  properties.boss_entrance_kind AS boss_entrance_kind,
  properties.boss_kind AS boss_kind,
  properties.daily_boss_kind AS daily_boss_kind
`;
}
