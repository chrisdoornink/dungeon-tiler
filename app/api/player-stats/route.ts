import { NextRequest, NextResponse } from "next/server";
import {
  parseHogQLRows,
  attachStartTimes,
  type PlayerDayPayload,
  type PlayerStatsResponse,
} from "../../../lib/stats/endgame_stats";
import { level2ChestStatusForDate } from "../../../lib/stats/daily_chest";
import { playerNameFor } from "../../../lib/stats/player_names";
import {
  DAY_EXPR,
  ROW_COLUMNS,
  getPostHogConfig,
  hogQLString,
  rowSelect,
  runHogQL,
} from "../../../lib/stats/posthog_query";

// Everything one player (a PostHog distinct_id) has completed in the last N days, across
// every game mode. Backs the click-through from a pseudonymous name on /stats.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;
const MAX_ROWS = 2000;

// distinct_ids are PostHog-generated UUID-ish tokens. Anything outside this set is not a
// real id and is rejected before it gets anywhere near a query string.
const ID_RE = /^[A-Za-z0-9_\-:.]{1,128}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Daily runs live on their date_seed day (the challenge identity); endless/normal runs
// have no seed, so they fall on the calendar day the run ended (UTC).
const PLAYER_DAY_EXPR = `if(${DAY_EXPR} != '', ${DAY_EXPR}, toString(toDate(timestamp)))`;

export async function GET(req: NextRequest) {
  const cfg = getPostHogConfig();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid player id." }, { status: 400 });
  }
  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const windowDays = Number.isFinite(daysParam)
    ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(daysParam)))
    : DEFAULT_DAYS;
  const name = playerNameFor(id);

  if (!cfg.apiKey || !cfg.projectId) {
    const body: PlayerStatsResponse = {
      distinctId: id,
      name,
      windowDays,
      totalGames: 0,
      activeDays: 0,
      days: [],
      configured: false,
      message:
        "PostHog read credentials are not set. Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (server env) to load stats.",
    };
    return NextResponse.json(body);
  }

  try {
    const idLit = hogQLString(id);
    const rowsQuery = `
      SELECT ${rowSelect(PLAYER_DAY_EXPR)}
      FROM events
      WHERE event = 'game_complete'
        AND distinct_id = ${idLit}
        AND timestamp > now() - INTERVAL ${windowDays} DAY
      ORDER BY timestamp DESC
      LIMIT ${MAX_ROWS}
    `;
    const rowsRes = await runHogQL(rowsQuery, cfg);
    const rows = parseHogQLRows([...ROW_COLUMNS], rowsRes.results);

    const startsQuery = `
      SELECT
        distinct_id AS distinct_id,
        ${PLAYER_DAY_EXPR} AS day,
        timestamp AS timestamp
      FROM events
      WHERE event = 'game_start'
        AND distinct_id = ${idLit}
        AND timestamp > now() - INTERVAL ${windowDays + 1} DAY
      LIMIT ${MAX_ROWS}
    `;
    const startsRes = await runHogQL(startsQuery, cfg);
    const startRows = startsRes.results.map((r) => ({
      distinctId: String(r[0] ?? ""),
      day: String(r[1] ?? ""),
      timestamp: String(r[2] ?? ""),
    }));
    const withStarts = attachStartTimes(rows, startRows);

    // Group by day, newest day first, newest run first within a day.
    const byDay = new Map<string, typeof withStarts>();
    for (const row of withStarts) {
      if (!DATE_RE.test(row.day)) continue;
      const list = byDay.get(row.day);
      if (list) list.push(row);
      else byDay.set(row.day, [row]);
    }
    const days: PlayerDayPayload[] = Array.from(byDay.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([date, games]) => {
        const chestStatus = level2ChestStatusForDate(date);
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
          games: [...games].sort((a, b) =>
            a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0
          ),
        };
      });

    const body: PlayerStatsResponse = {
      distinctId: id,
      name,
      windowDays,
      totalGames: withStarts.length,
      activeDays: days.length,
      days,
      configured: true,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[player-stats]", err);
    return NextResponse.json(
      { error: "Failed to load player stats from PostHog." },
      { status: 502 }
    );
  }
}
