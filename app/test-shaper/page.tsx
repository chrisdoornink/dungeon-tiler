"use client";

import React, { Suspense, useState, useMemo } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import {
  SHAPER_LAYOUTS,
  SHAPER_ENTRIES,
  buildShaperArena,
  type ShaperEntry,
} from "../../lib/bosses/shaper_arena";

function TestShaperInner() {
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [entry, setEntry] = useState<ShaperEntry>("south");
  const [resetCount, setResetCount] = useState(0);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  const layout = SHAPER_LAYOUTS[layoutIndex];
  // Build the (randomized) labyrinth once per selection — not on every render,
  // or the maze would reshuffle mid-play. Reset re-rolls a fresh one.
  const initialState = useMemo(
    () => buildShaperArena(layout, entry),
    [layout, entry, resetCount]
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
          <h1 className="text-2xl font-bold mb-2">Boss Prototype: The Shaper</h1>
          <p className="text-sm text-gray-300 mb-1">
            Reach the Shaper across the marsh and strike it &mdash; the crossing
            is the fight. It reshapes the terrain at you every few turns
            (telegraphed a turn ahead):
          </p>
          <ul className="text-xs text-gray-400 text-left mx-auto inline-block mt-1 space-y-0.5">
            <li>
              <span className="text-orange-400">Ember wall</span> (red tiles)
              &mdash; becomes LAVA (instant death). Throw a rock to cool it into a
              stepping stone.
            </li>
            <li>
              <span className="text-blue-400">Flood</span> (blue tiles) &mdash;
              floods to water and deepens shallow&rarr;deep. Deep water snuffs
              your torch &mdash; you swim blind.
            </li>
            <li>
              Wade shallow water freely. Rock a deep tile into a dry stepping
              stone. Stay lit; step near lava glow to relight.
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 justify-center bg-black/70 rounded-lg p-3 backdrop-blur-sm">
          {SHAPER_LAYOUTS.map((l, i) => (
            <button
              key={l.name}
              onClick={() => {
                setLayoutIndex(i);
                setOutcome("none");
              }}
              className={`px-3 py-1 rounded text-sm ${
                layoutIndex === i
                  ? "bg-amber-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {l.name}
            </button>
          ))}
          <span className="w-px bg-gray-600 mx-1" />
          <span className="text-xs text-gray-400 self-center">Enter from:</span>
          {SHAPER_ENTRIES.map((e) => (
            <button
              key={e}
              onClick={() => {
                setEntry(e);
                setOutcome("none");
              }}
              className={`px-3 py-1 rounded text-sm capitalize ${
                entry === e
                  ? "bg-sky-700 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {e}
            </button>
          ))}
          <span className="w-px bg-gray-600 mx-1" />
          <button
            onClick={reset}
            className="px-3 py-1 rounded text-sm bg-red-700 text-white hover:bg-red-600"
          >
            Reset
          </button>
        </div>

        {outcome === "lost" && (
          <div className="bg-red-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            The terrain claimed you. Hit Reset to try again.
          </div>
        )}
        {outcome === "won" && (
          <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            You reached the Shaper and broke it. Hit Reset to duel again.
          </div>
        )}

        <TilemapGrid
          key={`${layoutIndex}-${entry}-${resetCount}`}
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
          storageSlot="test"
          onWin={() => setOutcome("won")}
          onDeath={() => setOutcome("lost")}
        />
      </div>
    </div>
  );
}

export default function TestShaperPage() {
  return (
    <Suspense fallback={null}>
      <TestShaperInner />
    </Suspense>
  );
}
