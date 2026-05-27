"use client";

import React, { Suspense, useEffect, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, type GameState } from "../../lib/map";
import { buildTutorialState } from "../../lib/tutorial/tutorial_state";

/**
 * /tutorial — sandbox URL for iterating on the interactive tutorial.
 *
 * Once the tutorial flow is wired into the daily challenge (gated by a
 * `?tutorial=1` query param and the multi-layer new-user detection described
 * in `.claude/features/interactive-tutorial/index.md`), this route will go
 * away or become a redirect. For now it's the easiest place to playtest while
 * iterating on rooms and scripted beats without touching the daily flow.
 *
 * The tutorial deliberately does NOT use CurrentGameStorage — every visit to
 * this URL gets a fresh state. We do not want partial tutorial progress to
 * persist across refreshes during development.
 */
function TutorialInner() {
  const [initialState, setInitialState] = useState<GameState | null>(null);

  useEffect(() => {
    setInitialState(buildTutorialState());
  }, []);

  if (!initialState) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading tutorial...
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
        <h1 className="text-xl font-semibold text-gray-300 tracking-wide uppercase">
          Tutorial (sandbox)
        </h1>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
        />
      </div>
    </div>
  );
}

export default function TutorialPage() {
  return (
    <Suspense fallback={null}>
      <TutorialInner />
    </Suspense>
  );
}
