import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { redis } from "../../../lib/redis";
import {
  type CheckpointStats,
  type RunRecord,
  validateCheckpoint,
  validateSubmission,
  sanitizeName,
} from "../../../lib/endless_validation";

/**
 * Endless-mode run attestation + all-time leaderboard.
 *
 * The server witnesses each run via sequential floor checkpoints and keeps its
 * own RunRecord in Redis; the leaderboard score at submission is the floor the
 * SERVER verified, never the client's number. Runs that trip a validation rule
 * are shadow-flagged: every response still says ok (no feedback for forgers),
 * but flagged runs land in a review list instead of the public board.
 *
 * Keys:
 *   endless:run:<runId>      — RunRecord JSON (48h TTL)
 *   endless:lb               — sorted set: playerId -> best verified floor
 *   endless:player:<id>      — hash: name + best-run stat line
 *   endless:flagged          — list of flagged submissions for review
 *   endless:starts:<id>:<day> — per-player run-start counter (anti-spam)
 */

const RUN_TTL_SECONDS = 60 * 60 * 48;
const MAX_STARTS_PER_DAY = 200; // generous: a real run takes minutes
const LEADERBOARD_KEY = "endless:lb";

// An anonymous run only earns a board slot if it cracks the top N — otherwise
// the board would fill with throwaway "Anonymous" floor-1 deaths. Named players
// are always saved (see the submit handler).
const ANON_BOARD_TOP_N = 20;

/**
 * Would `floor` place within the top N of the current board? True when the board
 * isn't full yet, or when the floor is at least the current Nth-place score.
 */
async function isTopNFloor(floor: number, n: number): Promise<boolean> {
  const count = await redis.zcard(LEADERBOARD_KEY);
  if (count < n) return true;
  const nth = await redis.zrange<(string | number)[]>(LEADERBOARD_KEY, n - 1, n - 1, {
    rev: true,
    withScores: true,
  });
  const cutoff = nth.length >= 2 ? Number(nth[1]) : 0;
  return floor >= cutoff;
}

function runKey(runId: string): string {
  return `endless:run:${runId}`;
}

function playerKey(playerId: string): string {
  return `endless:player:${playerId}`;
}

async function loadRun(runId: string): Promise<RunRecord | null> {
  const raw = await redis.get<RunRecord | string>(runKey(runId));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as RunRecord) : raw;
}

async function saveRun(runId: string, run: RunRecord): Promise<void> {
  await redis.set(runKey(runId), JSON.stringify(run), { ex: RUN_TTL_SECONDS });
}

function readStats(body: Record<string, unknown>): CheckpointStats {
  const s = (body.stats ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  return {
    steps: num(s.steps),
    enemiesDefeated: num(s.enemiesDefeated),
    damageDealt: num(s.damageDealt),
    damageTaken: num(s.damageTaken),
    hasSword: s.hasSword === true,
    hasShield: s.hasShield === true,
    heroMaxHealth: num(s.heroMaxHealth) || 5,
  };
}

interface BoardEntry {
  playerId: string;
  name: string;
  floor: number;
  steps: number | null; // from the player's best-run stat line; null for legacy rows
  kills: number | null;
}

async function topEntries(count: number): Promise<BoardEntry[]> {
  const raw = await redis.zrange<(string | number)[]>(LEADERBOARD_KEY, 0, count - 1, {
    rev: true,
    withScores: true,
  });
  const entries: BoardEntry[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    entries.push({
      playerId: String(raw[i]),
      name: "",
      floor: Number(raw[i + 1]),
      steps: null,
      kills: null,
    });
  }
  // Attach display name + the best-run stat line (steps/kills), stored per player.
  await Promise.all(
    entries.map(async (e) => {
      const [name, bestSteps, bestKills] = await Promise.all([
        redis.hget<string>(playerKey(e.playerId), "name"),
        redis.hget<number>(playerKey(e.playerId), "bestSteps"),
        redis.hget<number>(playerKey(e.playerId), "bestKills"),
      ]);
      e.name = name || "Anonymous";
      e.steps = bestSteps === null || bestSteps === undefined ? null : Number(bestSteps);
      e.kills = bestKills === null || bestKills === undefined ? null : Number(bestKills);
      // Never leak raw player ids to other clients
      e.playerId = e.playerId.slice(0, 8);
    })
  );
  return entries;
}

async function playerRank(playerId: string): Promise<{ rank: number | null; bestFloor: number | null }> {
  const [rank, score] = await Promise.all([
    redis.zrevrank(LEADERBOARD_KEY, playerId),
    redis.zscore(LEADERBOARD_KEY, playerId),
  ]);
  return {
    rank: rank === null || rank === undefined ? null : rank + 1,
    bestFloor: score === null || score === undefined ? null : Number(score),
  };
}

export async function GET(req: NextRequest) {
  try {
    const playerId = req.nextUrl.searchParams.get("playerId");
    // Callers can request a longer board (e.g. the full-leaderboard panel). Default 10,
    // clamped so a bad query can't ask Redis for an unbounded range. Guard the raw
    // string first: an absent param is null, and Number(null) is 0 (finite), which
    // would otherwise silently collapse the board to a single row.
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limitParam = limitRaw === null || limitRaw === "" ? NaN : Number(limitRaw);
    const limit = Number.isFinite(limitParam)
      ? Math.min(100, Math.max(1, Math.floor(limitParam)))
      : 10;
    const [top, total] = await Promise.all([
      topEntries(limit),
      redis.zcard(LEADERBOARD_KEY),
    ]);
    const me = playerId ? await playerRank(playerId) : { rank: null, bestFloor: null };
    return NextResponse.json({ top, totalPlayers: total, ...me });
  } catch (err) {
    console.error("[endless-run GET]", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === "start") {
      const playerId = typeof body.playerId === "string" ? body.playerId.slice(0, 64) : "";
      if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });

      // Anti-spam: cap run starts per player per day
      const day = new Date().toISOString().slice(0, 10);
      const startsKey = `endless:starts:${playerId}:${day}`;
      const starts = await redis.incr(startsKey);
      if (starts === 1) await redis.expire(startsKey, 60 * 60 * 25);
      if (starts > MAX_STARTS_PER_DAY) {
        // Still hand out a runId (no feedback), but it starts pre-flagged
        const runId = randomUUID();
        const now = Date.now();
        await saveRun(runId, {
          playerId,
          floor: 1,
          startedAt: now,
          lastCheckpointAt: now,
          steps: 0,
          enemiesDefeated: 0,
          damageDealt: 0,
          damageTaken: 0,
          flags: ["start:rate-limited"],
        });
        return NextResponse.json({ runId });
      }

      const runId = randomUUID();
      const now = Date.now();
      await saveRun(runId, {
        playerId,
        floor: 1,
        startedAt: now,
        lastCheckpointAt: now,
        steps: 0,
        enemiesDefeated: 0,
        damageDealt: 0,
        damageTaken: 0,
        flags: [],
      });
      return NextResponse.json({ runId });
    }

    if (action === "checkpoint") {
      const runId = typeof body.runId === "string" ? body.runId : "";
      const floor = typeof body.floor === "number" ? body.floor : 0;
      if (!runId || !floor) return NextResponse.json({ ok: true }); // nothing to verify
      const run = await loadRun(runId);
      if (!run) return NextResponse.json({ ok: true }); // expired/unknown: silently unverified

      const stats = readStats(body);
      const now = Date.now();
      const flags = validateCheckpoint(run, floor, stats, now);
      if (flags.length > 0) {
        run.flags.push(...flags);
      } else {
        // Clean checkpoint: the server now attests this floor was reached.
        run.floor = floor;
        run.steps = stats.steps;
        run.enemiesDefeated = stats.enemiesDefeated;
        run.damageDealt = stats.damageDealt;
        run.damageTaken = stats.damageTaken;
      }
      run.lastCheckpointAt = now;
      await saveRun(runId, run);
      return NextResponse.json({ ok: true });
    }

    if (action === "submit") {
      const runId = typeof body.runId === "string" ? body.runId : "";
      const run = runId ? await loadRun(runId) : null;
      if (!run) {
        // No server-witnessed run: nothing to score. Report the board anyway.
        const top = await topEntries(10);
        return NextResponse.json({ verified: false, top });
      }

      const finalStats = readStats(body);
      const name = sanitizeName(body.name);
      const flags = [...run.flags, ...validateSubmission(run, finalStats)];
      run.submittedAt = Date.now();
      await saveRun(runId, run);

      // The score is the floor the server witnessed — the client never sends one.
      const verifiedFloor = run.floor;

      if (flags.length > 0) {
        // Shadow-flag: keep for review, stay off the public board, reveal nothing.
        // A flagged run never touches the player's stored best either.
        await redis.rpush(
          "endless:flagged",
          JSON.stringify({ runId, run, finalStats, flaggedAt: Date.now() })
        );
        const [top, total] = await Promise.all([
          topEntries(10),
          redis.zcard(LEADERBOARD_KEY),
        ]);
        return NextResponse.json({ verified: true, floor: verifiedFloor, saved: false, top, totalPlayers: total });
      }

      // Resolve the run's display name: this submission's name, else one the
      // player saved on a previous run. Any name at all makes the run "named".
      const existingName = await redis.hget<string>(playerKey(run.playerId), "name");
      const effectiveName = name || existingName || "";

      // Always keep the player's best-run stat line current (manual GT), even for
      // an anonymous run that won't hit the board — so naming later can promote it.
      const prevBest = await redis.hget<number>(playerKey(run.playerId), "bestFloor");
      const patch: Record<string, string | number> = {};
      if (name) patch.name = name; // save/override the display name
      if (prevBest === null || prevBest === undefined || verifiedFloor > Number(prevBest)) {
        patch.bestFloor = verifiedFloor;
        patch.bestSteps = finalStats.steps;
        patch.bestKills = finalStats.enemiesDefeated;
        patch.bestAt = Date.now();
      }
      if (Object.keys(patch).length > 0) {
        await redis.hset(playerKey(run.playerId), patch);
      }

      // Save to the public board when the run is named, or (anonymous) good
      // enough to crack the top N. GT: only ever improves a player's best.
      const saved =
        !!effectiveName || (await isTopNFloor(verifiedFloor, ANON_BOARD_TOP_N));
      if (saved) {
        await redis.zadd(LEADERBOARD_KEY, { gt: true }, {
          score: verifiedFloor,
          member: run.playerId,
        });
      }

      const { rank, bestFloor } = await playerRank(run.playerId);
      const [top, total] = await Promise.all([
        topEntries(10),
        redis.zcard(LEADERBOARD_KEY),
      ]);
      return NextResponse.json({
        verified: true,
        floor: verifiedFloor,
        saved,
        rank,
        bestFloor,
        top,
        totalPlayers: total,
      });
    }

    if (action === "setName") {
      const playerId = typeof body.playerId === "string" ? body.playerId.slice(0, 64) : "";
      const name = sanitizeName(body.name);
      if (playerId && name) {
        await redis.hset(playerKey(playerId), { name });
        // Naming makes any prior run significant: promote the player's stored
        // best onto the board (no-op if they were already on it).
        const best = await redis.hget<number>(playerKey(playerId), "bestFloor");
        if (best !== null && best !== undefined) {
          await redis.zadd(LEADERBOARD_KEY, { gt: true }, {
            score: Number(best),
            member: playerId,
          });
        }
      }
      const me = playerId ? await playerRank(playerId) : { rank: null, bestFloor: null };
      return NextResponse.json({ ok: true, ...me });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[endless-run POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
