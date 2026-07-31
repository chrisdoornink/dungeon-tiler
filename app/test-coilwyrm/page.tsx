"use client";

import React, { Suspense, useState, useMemo } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import {
  COILWYRM_LAYOUTS,
  buildCoilwyrmArena,
} from "../../lib/bosses/coilwyrm_arena";
import { COILWYRM_START_SEGMENTS } from "../../lib/bosses/coilwyrm";

const SEGMENT_CHOICES = [3, 5, 7];
// Surge cadence in turns; 0 = never. The surge is the only reason running away is futile — at
// equal speed a head can never close on a fleeing hero — so "Never" is genuinely a different
// fight, not just a gentler one.
const SURGE_CHOICES: Array<[string, number]> = [
  ["3", 3],
  ["5", 5],
  ["8", 8],
  ["Never", 0],
];
// Turns between new segments, as a min-max range. With double-moves settled off this is the
// fight's main difficulty dial, and it is a genuine cliff rather than a slider: growth has to stay
// slower than the rate you can sever body, and at every-3-to-5 it outpaced cutting about three to
// one. 8-11 is the shipped cadence; the faster rows are there to find where it tips.
// "Never" is a cadence longer than any fight rather than a special case — 0 would mean a countdown
// that is already expired, i.e. growth EVERY turn. Note it only stops NATURAL growth: swallowing a
// loose rock still adds two lengths, because that is the hero's own doing.
const GROWTH_CHOICES: Array<[string, number, number]> = [
  ["4-6", 4, 6],
  ["6-8", 6, 8],
  ["8-11", 8, 11],
  ["12-16", 12, 16],
  ["Never", 999, 999],
];

function TestCoilwyrmInner() {
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [segments, setSegments] = useState(COILWYRM_START_SEGMENTS);
  const [resetCount, setResetCount] = useState(0);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");
  // Rules start collapsed: expanded, the panel is tall enough to push a 15x15 arena
  // most of the way off-screen, and you cannot playtest a board you have to scroll to.
  const [showRules, setShowRules] = useState(false);
  // Defaults are the playtested-preferred fight: 5 segments, one tile per turn, no surge.
  // `lunges` off kills every double-move at once (the periodic surge AND the post-cut thrash),
  // so the Surge control below only does anything with lunges back on. Measurement backs this
  // up as a taste call rather than a balance one — cutter win rate is flat across every surge
  // setting; the surge only adds pressure against a hero who does nothing but run.
  const [lunges, setLunges] = useState(false);
  const [surgeEvery, setSurgeEvery] = useState(5);
  // Growth cadence, the main dial now that double-moves are settled off. Index into
  // GROWTH_CHOICES; starts on the shipped 8-11.
  const [growthIndex, setGrowthIndex] = useState(2);

  const layout = COILWYRM_LAYOUTS[layoutIndex];
  const [, growMin, growMax] = GROWTH_CHOICES[growthIndex];
  // Built once per selection (Reset re-rolls the growth cadence and coil id) so the
  // arena can't reshuffle underneath a fight in progress.
  const initialState = useMemo(
    () =>
      buildCoilwyrmArena(layout, Math.random, segments, {
        lungeTiles: lunges ? 2 : 1,
        surgeEvery: lunges ? surgeEvery : 0,
        growMin,
        growMax,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, segments, resetCount, lunges, surgeEvery, growMin, growMax]
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
        <div className="text-center bg-black/70 rounded-lg px-4 py-2 backdrop-blur-sm max-w-xl">
          <h1 className="text-lg font-bold">
            Boss Prototype: The Coilwyrm{" "}
            <button
              onClick={() => setShowRules((v) => !v)}
              className="ml-2 align-middle px-2 py-0.5 rounded text-xs font-normal bg-gray-700 text-gray-200 hover:bg-gray-600"
            >
              {showRules ? "Hide rules" : "Rules"}
            </button>
          </h1>
          <p className="text-xs text-gray-300">
            Snake, and <em>you</em> are the food. Cut the coil{" "}
            <span className="text-amber-400">anywhere</span> &mdash; everything
            behind the cut dies. Aim{" "}
            <span className="text-sky-300">where the body is going</span>, not
            where it is.
          </p>
          {showRules && (
          <ul className="text-xs text-gray-400 text-left mx-auto inline-block mt-2 space-y-0.5">
            <li>
              <span className="text-amber-400">Chop the coil anywhere</span> and
              everything <em>behind</em> the cut dies with it. The closer to the
              head you cut, the more of it you kill.
            </li>
            <li>
              <span className="text-sky-300">Strike where the body is going</span>,
              not where it is: the wyrm moves before your blow lands, so aim at the
              tile the body is flowing into.
            </li>
            <li>
              The body follows <em>exactly</em> where the head went, and blocks like
              a wall until you cut it. The head <span className="text-red-400">bites</span>
              , then has to rear back &mdash; that pause is your opening.
            </li>
            <li>
              It grows from the tail every 8&ndash;11 turns and{" "}
              <span className="text-red-400">surges two tiles</span> when you get
              distance. Running only buys time.
            </li>
            <li>
              Every severed length drops a{" "}
              <span className="text-amber-400">rock</span>.
            </li>
            <li>
              <span className="text-red-400">Two hits kill a head</span> &mdash; but a
              body of four or more behind it grows a new one. Cut it into lengths of
              three or fewer first, then take the head and carry its gold key to the
              exit.
            </li>
          </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-center bg-black/70 rounded-lg p-3 backdrop-blur-sm">
          {COILWYRM_LAYOUTS.map((l, i) => (
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
          <span className="text-xs text-gray-400 self-center">Segments:</span>
          {SEGMENT_CHOICES.map((n) => (
            <button
              key={n}
              onClick={() => {
                setSegments(n);
                setOutcome("none");
              }}
              className={`px-3 py-1 rounded text-sm ${
                segments === n
                  ? "bg-sky-700 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {n}
            </button>
          ))}
          <span className="w-px bg-gray-600 mx-1" />
          <span className="text-xs text-gray-400 self-center">Double moves:</span>
          <button
            onClick={() => {
              setLunges((v) => !v);
              setOutcome("none");
            }}
            className={`px-3 py-1 rounded text-sm ${
              lunges
                ? "bg-red-800 text-white"
                : "bg-emerald-800 text-white"
            }`}
          >
            {lunges ? "On" : "Off (1 tile/turn)"}
          </button>
          {lunges && (
            <>
              <span className="text-xs text-gray-400 self-center">Surge every:</span>
              {SURGE_CHOICES.map(([label, n]) => (
                <button
                  key={label}
                  onClick={() => {
                    setSurgeEvery(n);
                    setOutcome("none");
                  }}
                  className={`px-3 py-1 rounded text-sm ${
                    surgeEvery === n
                      ? "bg-sky-700 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </>
          )}
          <span className="w-px bg-gray-600 mx-1" />
          <span className="text-xs text-gray-400 self-center">
            Grows every:
          </span>
          {GROWTH_CHOICES.map(([label], i) => (
            <button
              key={label}
              onClick={() => {
                setGrowthIndex(i);
                setOutcome("none");
              }}
              className={`px-3 py-1 rounded text-sm ${
                growthIndex === i
                  ? "bg-amber-700 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {label}
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
            The coil closed on you. Hit Reset to try again.
          </div>
        )}
        {outcome === "won" && (
          <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold backdrop-blur-sm">
            You cut it down to the head and killed it. Hit Reset to hunt again.
          </div>
        )}

        <TilemapGrid
          // EVERY tuning control belongs in this key. `initialGameState` is only read when the
          // grid mounts, so a control missing from here rebuilds the arena object and then has no
          // effect until something else forces a remount — the double-move and surge toggles were
          // silently in that state, only taking hold after a Reset or a segment-count change.
          key={`${layoutIndex}-${segments}-${resetCount}-${lunges}-${surgeEvery}-${growthIndex}`}
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

export default function TestCoilwyrmPage() {
  return (
    <Suspense fallback={null}>
      <TestCoilwyrmInner />
    </Suspense>
  );
}
