import { NextRequest, NextResponse } from "next/server";
import {
  parseHogQLRows,
  groupRowsByDay,
  type EndgameStatsResponse,
  type StatsDayPayload,
} from "../../../lib/stats/endgame_stats";
import { level2ChestStatusForDate } from "../../../lib/stats/daily_chest";
import { bossDayInfoForDate } from "../../../lib/stats/boss_day";

// Reads historical daily runs out of PostHog for the endgame stats dashboard.
// This is a read path (PostHog Query / HogQL) and needs a *personal* API key +
// numeric project id — the public `phc_` ingest key used by the browser cannot
// read data. Configure on the server (never NEXT_PUBLIC_*):
//   POSTHOG_PERSONAL_API_KEY  (or POSTHOG_API_KEY)
//   POSTHOG_PROJECT_ID        (numeric, from Project Settings)
//   POSTHOG_HOST              (optional, defaults to https://us.posthog.com)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 3;
const MAX_DAYS = 14;
const MAX_ROWS = 10000;

// Fixed select order for the rows query. We map results by POSITION using these
// names (rather than trusting PostHog's returned column labels), so the shape is
// stable regardless of how the API echoes aliases.
const ROW_COLUMNS = [
  "day",
  "timestamp",
  "distinct_id",
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
] as const;

// PostHog type-infers `date_seed` as a DateTime (it looks like a date), so
// `properties.date_seed` comes back as "2026-07-24T00:00:00Z". We need the raw
// stored "2026-07-24" string — both to page/group cleanly and because it is the
// exact value that seeded the chest generation. JSONExtractString reads it
// straight out of the properties JSON with no date parsing (no timezone shift).
const DAY_EXPR = "JSONExtractString(properties, 'date_seed')";

const ROW_SELECT = `
  ${DAY_EXPR} AS day,
  timestamp AS timestamp,
  distinct_id AS distinct_id,
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
  properties.boss_kind AS boss_kind
`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface HogQLResult {
  columns: string[];
  results: unknown[][];
}

function getConfig() {
  const apiKey =
    process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_API_KEY || "";
  const projectId = process.env.POSTHOG_PROJECT_ID || "";
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(
    /\/$/,
    ""
  );
  return { apiKey, projectId, host };
}

async function runHogQL(
  query: string,
  cfg: { apiKey: string; projectId: string; host: string }
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

export async function GET(req: NextRequest) {
  const cfg = getConfig();

  // Not-configured state: return 200 with configured:false so the page can show
  // a friendly setup notice instead of erroring.
  if (!cfg.apiKey || !cfg.projectId) {
    const body: EndgameStatsResponse = {
      days: [],
      nextCursor: null,
      hasMore: false,
      configured: false,
      message:
        "PostHog read credentials are not set. Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (server env) to load stats.",
    };
    return NextResponse.json(body);
  }

  // --- params ---
  const beforeDayParam = req.nextUrl.searchParams.get("beforeDay");
  const beforeDay =
    beforeDayParam && DATE_RE.test(beforeDayParam) ? beforeDayParam : null;
  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam)
    ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(daysParam)))
    : DEFAULT_DAYS;

  try {
    // Query 1: pick the page of distinct daily-challenge days (newest first).
    // Fetch one extra to detect whether older days remain.
    const beforeClause = beforeDay ? `AND ${DAY_EXPR} < '${beforeDay}'` : "";
    const daysQuery = `
      SELECT DISTINCT ${DAY_EXPR} AS day
      FROM events
      WHERE event = 'game_complete'
        AND properties.game_mode = 'daily'
        AND ${DAY_EXPR} != ''
        ${beforeClause}
      ORDER BY day DESC
      LIMIT ${days + 1}
    `;
    const daysRes = await runHogQL(daysQuery, cfg);
    const allDays = daysRes.results
      .map((r) => String(r[0] ?? ""))
      .filter((d) => DATE_RE.test(d));

    const hasMore = allDays.length > days;
    const pageDays = allDays.slice(0, days);

    if (pageDays.length === 0) {
      const body: EndgameStatsResponse = {
        days: [],
        nextCursor: null,
        hasMore: false,
        configured: true,
      };
      return NextResponse.json(body);
    }

    // Query 2: all game_complete rows for those days.
    const inList = pageDays.map((d) => `'${d}'`).join(", ");
    const rowsQuery = `
      SELECT ${ROW_SELECT}
      FROM events
      WHERE event = 'game_complete'
        AND properties.game_mode = 'daily'
        AND ${DAY_EXPR} IN (${inList})
      ORDER BY day DESC, timestamp DESC
      LIMIT ${MAX_ROWS}
    `;
    const rowsRes = await runHogQL(rowsQuery, cfg);
    const rows = parseHogQLRows([...ROW_COLUMNS], rowsRes.results);
    const grouped = groupRowsByDay(rows);
    const groupedByDate = new Map(grouped.map((g) => [g.date, g]));

    // Preserve the newest-first order from query 1, and attach the deterministic
    // Level 2 chest status + boss-entrance kind for each day.
    const payloadDays: StatsDayPayload[] = pageDays.map((date) => {
      const g = groupedByDate.get(date);
      const chestStatus = level2ChestStatusForDate(date);
      const bossDay = bossDayInfoForDate(date);
      return {
        date,
        chests: {
          items: chestStatus.items.map((it) => ({
            key: it.key,
            label: it.label,
            icon: it.icon,
          })),
          bombAvailable: chestStatus.bombAvailable,
        },
        bossDay,
        summary: g?.summary ?? {
          total: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          reachedPinkRealm: 0,
          reachedOutsideWorld: 0,
          blewUpTree: 0,
          avgLevelReached: null,
          reachedBossRoom: 0,
          bossDefeated: 0,
        },
        games: g?.games ?? [],
      };
    });

    const body: EndgameStatsResponse = {
      days: payloadDays,
      nextCursor: hasMore ? pageDays[pageDays.length - 1] : null,
      hasMore,
      configured: true,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[endgame-stats]", err);
    return NextResponse.json(
      { error: "Failed to load endgame stats from PostHog." },
      { status: 502 }
    );
  }
}
