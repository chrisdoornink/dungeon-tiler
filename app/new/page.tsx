"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, type GameState } from "../../lib/map";
import { buildTutorialState } from "../../lib/tutorial/tutorial_state";
import { buildDailyFloor2FromTutorial } from "../../lib/tutorial/tutorial_to_daily";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import { DailyChallengeStorage } from "../../lib/daily_challenge_storage";
import { DateUtils } from "../../lib/date_utils";

/**
 * `/new` — first-run / share-link entry point.
 *
 * Flow:
 *   1. Gate: if the visitor already has progress in today's daily challenge
 *      (mid-run or already completed), redirect them straight to / — the
 *      daily route. The tutorial is only for players who haven't started
 *      today's run.
 *   2. Otherwise, render the tutorial map in its own storage slot
 *      ("tutorial") so saves don't collide with daily / story state.
 *   3. On tutorial win, synthesize today's floor-2 daily state with the
 *      player's tutorial inventory carried over, save it to the daily slot,
 *      and navigate to / — where the player picks up at floor 2 seamlessly.
 *
 * Note: `/daily-new` and `/` currently render the same component (`/` is
 * just a re-export). `/` is the canonical URL. The `"daily-new"` storage
 * slot identifier is unrelated to URL routing — it's an internal key.
 *
 * Every visit to /new starts a fresh tutorial — no mid-tutorial persist for
 * v1. The tutorial is short; "I want to retry from the start" is the more
 * common case.
 */
function NewPageInner() {
  const router = useRouter();
  const [initialState, setInitialState] = useState<GameState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Gate 1: is there an in-progress daily run today? If so, send the
    // player to /daily-new so they resume from where they left off.
    const dailyInProgress = CurrentGameStorage.loadCurrentGame("daily-new");
    if (dailyInProgress) {
      router.replace("/");
      return;
    }

    // Gate 2: did the player already complete today's daily? If so,
    // /daily-new will render the "you already played today" screen.
    try {
      const daily = DailyChallengeStorage.loadData();
      const today = DateUtils.getTodayString();
      if (daily.todayCompleted && daily.lastPlayedDate === today) {
        router.replace("/");
        return;
      }
    } catch {
      // If the daily storage is malformed or unreadable, fall through to
      // the tutorial — better to show the tutorial than to crash here.
    }

    // Fresh tutorial run.
    setInitialState(buildTutorialState());
  }, [router]);

  const handleTutorialWin = useCallback(
    (finalState: GameState) => {
      try {
        const floor2 = buildDailyFloor2FromTutorial(finalState);
        CurrentGameStorage.saveCurrentGame(floor2, "daily-new");
      } catch (err) {
        // If the handoff fails for any reason, fall through to the daily
        // route anyway — it will boot a normal floor 1 run.
        console.error("Tutorial-to-daily handoff failed:", err);
      }
      router.push("/");
    },
    [router]
  );

  if (!initialState) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
          storageSlot="tutorial"
          onWin={handleTutorialWin}
        />
      </div>
    </div>
  );
}

export default function NewPage() {
  return (
    <Suspense fallback={null}>
      <NewPageInner />
    </Suspense>
  );
}
