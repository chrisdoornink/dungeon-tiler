"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import {
  buildQuarrymasterArena,
  QUARRYMASTER_LAYOUTS,
} from "../../lib/bosses/quarrymaster_arena";

// Arenas are hand-authored ASCII maps (QUARRYMASTER_LAYOUTS in quarrymaster_arena.ts): pick
// one with the Layout buttons, or add another by adding a map. Restart replays the same room —
// the variability within a run comes from which cracks the goblins fall into, not from
// regenerating terrain.
//
// There is deliberately no hero-HP control. In the real game the hero walks in carrying
// whatever the run left them, so a dial here would only be testing a number that never
// varies that way in practice. The boss's own HP is fixed (QUARRYMASTER_HP).

function TestQuarrymasterInner() {
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  const arena = useMemo(
    () => buildQuarrymasterArena({ layoutIndex }),
    // resetCount is a deliberate dependency: it forces a fresh state object on reset.
    [layoutIndex, resetCount]
  );

  const reset = () => {
    setOutcome("none");
    setResetCount((c) => c + 1);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm max-w-xl">
          <h1 className="text-2xl font-bold mb-2">
            Boss Prototype: The Quarrymaster
          </h1>
          <p className="text-sm text-gray-300 mb-1">
            He is caged behind three gates and he is a mediocre fighter. Working a
            route to the switches is the fight.
          </p>
          <ul className="text-xs text-gray-400 text-left mx-auto inline-block mt-1 space-y-0.5">
            <li>
              <span className="text-amber-400">Three floor switches.</span> Each
              drops one row of bars on his cage, for good. All three down and he is
              exposed.
            </li>
            <li>
              <span className="text-gray-200">Cracks are goblin traps, not your
              problem.</span> You can see them, so walk around them. A goblin
              chasing you will step on one, fall through, and leave a permanent
              hole that everything avoids after that.
            </li>
            <li>
              <span className="text-purple-300">Two pods</span> flank his chamber
              and keep sending ordinary goblins. They pile up &mdash; the crowd and
              your manoeuvring through it is the fight.
            </li>
            <li>Kill him for the gold key, then leave by the corner exit.</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 justify-center bg-black/70 rounded-lg p-3 backdrop-blur-sm">
          <span className="text-xs text-gray-400 self-center">Layout:</span>
          {QUARRYMASTER_LAYOUTS.map((l, i) => (
            <button
              key={l.name}
              onClick={() => {
                setLayoutIndex(i);
                setOutcome("none");
              }}
              className={`px-3 py-1 rounded text-sm ${
                layoutIndex === i
                  ? "bg-sky-700 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {l.name}
            </button>
          ))}
          <span className="w-px bg-gray-600 mx-1" />
          <button
            onClick={reset}
            className="px-3 py-1 rounded text-sm bg-red-700 text-white hover:bg-red-600"
          >
            Restart
          </button>
        </div>

        <div className="text-xs text-gray-400 bg-black/60 rounded px-3 py-1 backdrop-blur-sm">
          {arena.layoutName} &middot; {arena.cracks.length} cracks &middot;{" "}
          {arena.plates.length} switches &middot; {arena.pods.length} pods &middot;{" "}
          {arena.torches.length} torches
        </div>

        {outcome === "lost" && (
          <div className="bg-red-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            The floor or the swarm got you. Hit Restart to try again.
          </div>
        )}
        {outcome === "won" && (
          <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            Gates down, Quarrymaster down. Hit Restart to run it again.
          </div>
        )}

        <TilemapGrid
          key={`${layoutIndex}-${resetCount}`}
          tileTypes={tileTypes}
          initialGameState={arena.state}
          forceDaylight={true}
          storageSlot="test"
          onWin={() => setOutcome("won")}
          onDeath={() => setOutcome("lost")}
        />
      </div>
    </div>
  );
}

export default function TestQuarrymasterPage() {
  return (
    <Suspense fallback={null}>
      <TestQuarrymasterInner />
    </Suspense>
  );
}
