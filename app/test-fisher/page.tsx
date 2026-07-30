"use client";

import React, { Suspense, useState, useMemo } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import {
  FISHER_LAYOUTS,
  buildFisherArena,
} from "../../lib/bosses/fisher_arena";

function TestFisherInner() {
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  const layout = FISHER_LAYOUTS[layoutIndex];
  // Build once per selection — rocks and ponds are rolled at build time, so rebuilding
  // on every render would reshuffle the arena mid-fight. Reset re-rolls.
  const initialState = useMemo(
    () => buildFisherArena(layout),
    [layout, resetCount]
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
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">Boss Prototype: The Fisher</h1>
          <p className="text-sm text-gray-300 mb-2">
            A heron on the far side of a bed of spikes you can never cross. It throws
            spears from a quiver on its back &mdash; straight lines only, but{" "}
            <strong>unlimited range</strong>, flying until they hit something. It has
            infinite spears and you can&rsquo;t pick them up.
          </p>
          <ul className="text-xs text-gray-400 text-left mx-auto inline-block space-y-1">
            <li>
              <span className="text-amber-300">
                WATCH ITS STANCE &mdash; there is no tile warning.
              </span>{" "}
              When it draws a spear back over its shoulder, the throw lands next
              turn. Read the bird, not the board.
            </li>
            <li>
              <strong>Step sideways out of its line</strong> and the throw misses.
            </li>
            <li>
              <span className="text-green-400">A miss leaves it off balance</span> for 2
              turns &mdash; it over-committed. Step back into line and throw. That
              window is your whole offense.
            </li>
            <li>
              <span className="text-sky-300">It has to brace to throw</span>, so it can
              only attack from the water&rsquo;s edge &mdash; which is exactly where your
              rocks can reach. While it wades its back rows it&rsquo;s untouchable, but
              also harmless.
            </li>
            <li>
              <span className="text-sky-300">Leave a rock on the ground</span> where the
              beak will land &mdash; it shatters on stone and stays stuck a turn longer.
              Rocks are ammo <em>and</em> traps.
            </li>
            <li>
              <span className="text-red-400">Deny it a shot and it arms itself.</span>{" "}
              Hide behind a tree or hang back and it spends every turn plucking snakes
              out of its shallows and lobbing them at you. Cover is not free &mdash;
              it just changes which weapon you hand it.
            </li>
            <li>
              <span className="text-red-400">At half health it panics</span> &mdash;
              breaks off, grabs three more snakes and throws them, then{" "}
              <strong>has to come back and fight</strong>. It only gets one such
              retreat for the whole fight.
            </li>
            <li>
              It <em>strides two tiles a turn</em>, so you cannot out-walk it
              sideways. Tempo and cover are your only edge.
            </li>
            <li>
              8 HP, rocks deal 2 &mdash; four clean hits. ~20 rocks lie around the
              ponds; walking back to restock is the second pressure.
            </li>
            <li>
              Spikes refuse the move and cost 1 HP. Trees and{" "}
              <em>flower patches</em> eat a thrown rock &mdash; mind your lane.
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 justify-center bg-black/70 rounded-lg p-3 backdrop-blur-sm">
          {FISHER_LAYOUTS.map((l, i) => (
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
          <button
            onClick={reset}
            className="px-3 py-1 rounded text-sm bg-red-700 text-white hover:bg-red-600"
          >
            Reset
          </button>
        </div>

        {outcome === "lost" && (
          <div className="bg-red-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            The Fisher had you. Hit Reset to try again.
          </div>
        )}
        {outcome === "won" && (
          <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            It fell across the spikes and you walked out over it.
          </div>
        )}

        <TilemapGrid
          key={`${layoutIndex}-${resetCount}`}
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

export default function TestFisherPage() {
  return (
    <Suspense fallback={null}>
      <TestFisherInner />
    </Suspense>
  );
}
