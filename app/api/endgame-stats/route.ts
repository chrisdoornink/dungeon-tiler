import { NextRequest, NextResponse } from "next/server";
import {
  parseHogQLRows,
  groupRowsByDay,
  attachStartTimes,
  type EndgameStatsResponse,
  type StatsDayPayload,
} from "../../../lib/stats/endgame_stats";
import { level2ChestStatusForDate } from "../../../lib/stats/daily_chest";
import { bossDayInfoForDate, reconcileBossDay } from "../../../lib/stats/boss_day";
import { puzzleDayInfoForDate } from "../../../lib/stats/puzzle_day";
import { returningPlayersFrom } from "../../../lib/stats/player_names";
import {
  DAY_EXPR,
  ROW_COLUMNS,
  getPostHogConfig,
  rowSelect,
  runHogQL,
} from "../../../lib/stats/posthog_query";

// Reads historical daily runs out of PostHog for the endgame stats dashboard.
// PostHog credentials + the shared row select live in lib/stats/posthog_query.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 3;
const MAX_DAYS = 14;
const MAX_ROWS = 10000;

// How far back to look when deciding who is a "returning" player (2+ distinct daily
// days). Wider than any single page so a name is stable as you scroll into history.
const RETURNING_LOOKBACK_DAYS = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const cfg = getPostHogConfig();

  // Not-configured state: return 200 with configured:false so the page can show
  // a friendly setup notice instead of erroring.
  if (!cfg.apiKey || !cfg.projectId) {
    const body: EndgameStatsResponse = {
      days: [],
      players: {},
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
        players: {},
        nextCursor: null,
        hasMore: false,
        configured: true,
      };
      return NextResponse.json(body);
    }

    // Query 2: all game_complete rows for those days.
    const inList = pageDays.map((d) => `'${d}'`).join(", ");
    const rowsQuery = `
      SELECT ${rowSelect()}
      FROM events
      WHERE event = 'game_complete'
        AND properties.game_mode = 'daily'
        AND ${DAY_EXPR} IN (${inList})
      ORDER BY day DESC, timestamp DESC
      LIMIT ${MAX_ROWS}
    `;
    const rowsRes = await runHogQL(rowsQuery, cfg);
    const rows = parseHogQLRows([...ROW_COLUMNS], rowsRes.results);

    // Query 3: game_start events for the same days — used to compute run duration.
    const startsQuery = `
      SELECT
        distinct_id AS distinct_id,
        ${DAY_EXPR} AS day,
        timestamp AS timestamp
      FROM events
      WHERE event = 'game_start'
        AND properties.game_mode = 'daily'
        AND ${DAY_EXPR} IN (${inList})
      LIMIT ${MAX_ROWS}
    `;
    const startsRes = await runHogQL(startsQuery, cfg);
    const startRows = startsRes.results.map((r) => ({
      distinctId: String(r[0] ?? ""),
      day: String(r[1] ?? ""),
      timestamp: String(r[2] ?? ""),
    }));
    const rowsWithStart = attachStartTimes(rows, startRows);

    // Query 4: who has completed a daily on 2+ distinct days recently. Runs alongside
    // every page so the pseudonym set is the same no matter which page you are on.
    const returningQuery = `
      SELECT DISTINCT distinct_id AS distinct_id, ${DAY_EXPR} AS day
      FROM events
      WHERE event = 'game_complete'
        AND properties.game_mode = 'daily'
        AND ${DAY_EXPR} != ''
        AND timestamp > now() - INTERVAL ${RETURNING_LOOKBACK_DAYS} DAY
      LIMIT ${MAX_ROWS}
    `;
    const returningRes = await runHogQL(returningQuery, cfg);
    const players = returningPlayersFrom(
      returningRes.results.map((r) => ({
        distinctId: String(r[0] ?? ""),
        day: String(r[1] ?? ""),
      }))
    );

    const grouped = groupRowsByDay(rowsWithStart);
    const groupedByDate = new Map(grouped.map((g) => [g.date, g]));

    // Preserve the newest-first order from query 1, and attach the deterministic
    // Level 2 chest status + boss-entrance kind for each day.
    const payloadDays: StatsDayPayload[] = pageDays.map((date) => {
      const g = groupedByDate.get(date);
      const chestStatus = level2ChestStatusForDate(date);
      // Replay first, then let the day's own rows overrule which boss it was — the replay
      // re-indexes whenever the roster grows, so it cannot be trusted about the past on its
      // own. See reconcileBossDay.
      const bossDay = reconcileBossDay(
        bossDayInfoForDate(date),
        (g?.games ?? []).map((row) => row.dailyBossKind)
      );
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
        puzzle: puzzleDayInfoForDate(date),
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
      players,
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
