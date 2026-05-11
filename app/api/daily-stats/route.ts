import { NextRequest, NextResponse } from "next/server";
import { redis, getDailyKey, aggregateCompletions, type DailyCompletion } from "../../../lib/redis";

const TTL_SECONDS = 60 * 60 * 48; // 48 hours

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as DailyCompletion & { date: string };
    const { date, outcome, floor, steps, enemiesDefeated, heroHealth } = body;

    if (!date || !outcome || floor === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const entry: DailyCompletion = { outcome, floor, steps, enemiesDefeated, heroHealth };
    const key = getDailyKey(date);

    await redis.rpush(key, JSON.stringify(entry));
    await redis.expire(key, TTL_SECONDS);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[daily-stats POST]", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const key = getDailyKey(date);
    const raw = await redis.lrange<string>(key, 0, -1);
    const completions: DailyCompletion[] = raw.map((item) =>
      typeof item === "string" ? JSON.parse(item) : item
    );

    return NextResponse.json(aggregateCompletions(completions));
  } catch (err) {
    console.error("[daily-stats GET]", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
