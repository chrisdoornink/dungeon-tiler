"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import {
  buildMoatApproach,
  buildDousePortalApproach,
  buildBombOutsideApproach,
} from "../../lib/bosses/boss_entrances";
import type { GameState } from "../../lib/map/game-state";

type Scenario = {
  key: string;
  label: string;
  build: () => GameState;
  blurb: React.ReactNode;
};

const SCENARIOS: Scenario[] = [
  {
    key: "moat-lava",
    label: "Moat: Lava",
    build: () => buildMoatApproach("lava"),
    blurb: (
      <>
        A wall of <span className="text-orange-400">lava</span> drowns the far side.
        Lava is instant death &mdash; <b>throw a rock</b> at the near edge to cool it
        into a walkable stepping stone, one tile at a time, until you&rsquo;ve bridged
        across (~8 rocks, most of a day&rsquo;s haul). The cave mouth waits beyond it.
      </>
    ),
  },
  {
    key: "moat-water",
    label: "Moat: Water",
    build: () => buildMoatApproach("water"),
    blurb: (
      <>
        A channel of <span className="text-blue-400">deep water</span> drowns the far
        side. You can simply <b>wade across</b> &mdash; but deep water snuffs your torch
        and you cross blind &mdash; or <b>throw rocks</b> into it to drop dry stepping
        stones and keep your light. The cave mouth waits beyond it.
      </>
    ),
  },
  {
    key: "douse",
    label: "Douse Portal",
    build: buildDousePortalApproach,
    blurb: (
      <>
        A dark cave. Somewhere ahead is a portal you cannot see while your torch burns.
        <b> Wade the deep-water channel</b> to snuff your torch &mdash; in the dark, a
        glowing entrance appears. Step into it. (Relight your torch and it vanishes and
        turns inert.)
      </>
    ),
  },
  {
    key: "bomb",
    label: "Bomb → Outside",
    build: buildBombOutsideApproach,
    blurb: (
      <>
        A sealed room with three bombs. <b>Throw a bomb at an outer wall</b> to blow a
        breach, step out into the grassland, then push past the stone goblins to the
        <b> opening carved in the far tree wall</b> &mdash; a path down into the boss
        room. (In the real daily this appears only for the first wall you breach.)
      </>
    ),
  },
];

function TestBossEntrancesInner() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  const scenario = SCENARIOS[scenarioIndex];
  // Build the approach level once per selection so it isn't rebuilt on every render.
  const initialState = useMemo(
    () => scenario.build(),
    [scenario, resetCount]
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
          <h1 className="text-2xl font-bold mb-2">Boss Entrances: getting in</h1>
          <p className="text-sm text-gray-300">
            Three organic ways to reach a boss room in a daily run. Each drops you into
            the Shaper fight once you get through. Pick one and try to reach it.
          </p>
          <p className="text-sm text-gray-200 mt-2">{scenario.blurb}</p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center bg-black/70 rounded-lg p-3 backdrop-blur-sm">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => {
                setScenarioIndex(i);
                setOutcome("none");
                setResetCount((c) => c + 1);
              }}
              className={`px-3 py-1 rounded text-sm ${
                scenarioIndex === i
                  ? "bg-amber-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {s.label}
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
            You died before reaching the boss. Hit Reset to try again.
          </div>
        )}
        {outcome === "won" && (
          <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            You got in and broke the Shaper. Hit Reset to try another way in.
          </div>
        )}

        <TilemapGrid
          key={`${scenario.key}-${resetCount}`}
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

export default function TestBossEntrancesPage() {
  return (
    <Suspense fallback={null}>
      <TestBossEntrancesInner />
    </Suspense>
  );
}
