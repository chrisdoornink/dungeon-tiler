"use client";

import React, { Suspense, useEffect, useState } from "react";
import GameView from "../../components/GameView";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import { setAnalyticsSuppressed } from "../../lib/posthog_analytics";

/**
 * /daily-preview?date=YYYY-MM-DD — replay ANY day's FULL daily (enemies, darkness, floor 1->2->3
 * cascade), so a specific date's colour puzzle (or anything else) can be tested before it goes live.
 *
 * It reuses the real daily engine but is quarantined from the live game:
 *  - storage: its own "daily-preview" slot, never the player's real "daily-new" save;
 *  - the slot is cleared on entry so each visit is a fresh run of the chosen date;
 *  - analytics: setAnalyticsSuppressed(true) for the whole session, so no game_complete /
 *    floor_advanced / pickup events reach PostHog (i.e. /stats stays clean), and the real
 *    "lastGame" streak snapshot is never overwritten.
 * Generation for the chosen date is deterministic, so this shows EXACTLY what players will get.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const round = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return round === s;
}

// Upcoming days that carry a colour puzzle (computed from the daily seeds). Quick-pick only —
// the date field takes any day. A run has AT MOST ONE colour puzzle: floor 1 generates first, so on
// a floor-1 day floor 2 is suppressed. These two lists are therefore mutually exclusive.
const FLOOR1_PUZZLE_DAYS = ["2026-09-28", "2026-10-02", "2026-10-15", "2026-11-26", "2026-12-05", "2026-12-12"];
const FLOOR2_PUZZLE_DAYS = ["2026-09-01", "2026-09-08", "2026-09-12", "2026-09-14", "2026-09-17", "2026-09-20", "2026-09-25"];

function DayButton({ date }: { date: string }) {
  return (
    <a
      href={`/daily-preview?date=${date}`}
      className="inline-block px-2 py-1 m-1 rounded bg-white/10 hover:bg-white/20 underline text-xs"
    >
      {date}
    </a>
  );
}

function Picker({ current }: { current: string }) {
  const [value, setValue] = useState(current && DATE_RE.test(current) ? current : "");
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-6 text-white bg-black/90">
      <div className="max-w-lg text-center bg-black/70 rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-bold">Daily Preview</h1>
        <p className="text-sm text-gray-300">
          Play any day&apos;s <b>full</b> daily — real enemies, darkness, and the floor 1&nbsp;→&nbsp;2&nbsp;→&nbsp;3
          cascade — to test what a date holds before it goes live. This run is a sandbox: it is{" "}
          <b>not saved to your real daily and not recorded in stats</b>.
        </p>
        {current && !isValidDate(current) && (
          <p className="text-amber-300 text-sm">“{current}” isn&apos;t a valid YYYY-MM-DD date.</p>
        )}
        <div className="flex items-center justify-center gap-2">
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-black rounded px-2 py-1"
          />
          <a
            href={value ? `/daily-preview?date=${value}` : "#"}
            className={`px-3 py-1 rounded font-semibold ${
              value ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-white/10 text-gray-500 pointer-events-none"
            }`}
          >
            Play
          </a>
        </div>
        <div className="text-left text-sm space-y-2 pt-2">
          <div>
            <div className="text-sky-300 font-semibold">Floor-1 puzzle (3 switches):</div>
            <div>{FLOOR1_PUZZLE_DAYS.map((d) => <DayButton key={d} date={d} />)}</div>
          </div>
          <div>
            <div className="text-emerald-300 font-semibold">Floor-2 puzzle (4 switches):</div>
            <div>{FLOOR2_PUZZLE_DAYS.map((d) => <DayButton key={d} date={d} />)}</div>
          </div>
          <p className="text-xs text-gray-400 pt-1">A run has at most one colour puzzle — a floor-1 day never also has a floor-2 one.</p>
        </div>
      </div>
    </div>
  );
}

function ResultOverlay({ result, date }: { result: "won" | "lost"; date: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-white">
      <div className="text-center bg-neutral-900 rounded-xl p-6 space-y-4 max-w-sm">
        <div className="text-3xl">{result === "won" ? "🎉 Cleared" : "💀 Died"}</div>
        <p className="text-sm text-gray-300">
          Preview of <b>{date}</b>&apos;s daily — nothing was recorded.
        </p>
        <div className="flex gap-2 justify-center">
          <a href={`/daily-preview?date=${date}`} className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-semibold">
            Play again
          </a>
          <a href="/daily-preview" className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 underline">
            Pick another date
          </a>
        </div>
      </div>
    </div>
  );
}

function Inner() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const dateParam = params?.get("date") ?? "";
  const valid = isValidDate(dateParam);

  // Gate the game render on this date's sandbox being prepared (slot cleared + analytics
  // suppressed) so GameView never mounts against a stale preview save.
  const [readyDate, setReadyDate] = useState<string | null>(null);
  const [result, setResult] = useState<"won" | "lost" | null>(null);

  useEffect(() => {
    if (!valid) {
      setReadyDate(null);
      return;
    }
    setResult(null);
    CurrentGameStorage.clearCurrentGame("daily-preview");
    setAnalyticsSuppressed(true);
    setReadyDate(dateParam);
    return () => setAnalyticsSuppressed(false);
  }, [valid, dateParam]);

  if (!valid) return <Picker current={dateParam} />;
  if (readyDate !== dateParam) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-black/90">
        Preparing {dateParam}…
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-0 inset-x-0 z-40 flex items-center justify-center gap-3 bg-amber-900/90 text-amber-100 text-xs py-1 px-2">
        <span>🔍 PREVIEW — {dateParam}&apos;s daily · not saved, not in stats</span>
        <a href="/daily-preview" className="underline">change date</a>
      </div>
      <GameView
        key={dateParam}
        isDailyChallenge
        storageSlot="daily-preview"
        dailyDateOverride={dateParam}
        onDailyComplete={setResult}
      />
      {result && <ResultOverlay result={result} date={dateParam} />}
    </>
  );
}

export default function DailyPreviewPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
