"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, type GameState } from "../../lib/map";
import { initializeGameStateFromMap } from "../../lib/map/game-state";
import { buildCipherRoomFloor, type CipherLegendStyle } from "../../lib/map/cipher_room";
import { toggleStateColor } from "../../lib/map/machinery";

/**
 * Bench for the prescribed colour-cipher puzzle room (lib/map/cipher_room.ts). Two legend styles:
 *
 *  - mural (default): the code is a painted wall mural in a SEPARATE chamber. Read it, remember it,
 *    walk up to the switch room and set the switches from memory. Limited to the torch's field of view
 *    so the mural and the switches are never on screen together — the difficulty is memory.
 *  - torches (?style=torches): the code is lit torches right above the switches (the gentle version).
 *
 * No enemies here; the debug panel shows the answer (in a real room you would only know it from the
 * legend). Colours are the game palette: blue / green / violet / rose.
 */
const COLOR_NAMES = ["blue", "green", "violet", "rose"];

function forBench(style: CipherLegendStyle): { state: GameState; target: number[] } {
  const { mapData, colorLocks } = buildCipherRoomFloor({ legendStyle: style });
  const base = initializeGameStateFromMap(mapData);
  const state: GameState = {
    ...base,
    colorLocks,
    enemies: [],
    hasSword: true,
    hasShield: true,
    heroHealth: 10,
    heroMaxHealth: 10,
    heroTorchLit: true,
    // Mural: keep the fog on so the mural chamber and the switch chamber are never visible at once —
    // that IS the puzzle. Torch version reveals the whole (single) room.
    showFullMap: style === "torches",
    mode: "normal",
  };
  return { state, target: colorLocks[0].target ?? [] };
}

function Inner() {
  // Client-only: the game (and its map build) must not render during SSR — the heavy TilemapGrid
  // touches browser-only APIs on the limited-FOV path, which makes static prerender flaky. Mounting
  // first keeps the build bulletproof; the server just emits the loader below.
  const [mounted, setMounted] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => setMounted(true), []);

  const style: CipherLegendStyle =
    mounted &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("style") === "torches"
      ? "torches"
      : "mural";
  const built = useMemo(
    () => (mounted ? forBench(style) : null),
    // resetKey is a manual rebuild trigger (not read in the body) — intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounted, style, resetKey]
  );

  if (!built) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-black/90 text-sm">
        Loading cipher room…
      </div>
    );
  }
  const { state, target } = built;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-3">
      <div className="text-center bg-black/70 rounded-lg p-3 max-w-2xl">
        <h1 className="text-xl font-bold">
          Colour-Cipher Room — {style === "mural" ? "mural" : "torches"}
        </h1>
        {style === "mural" ? (
          <p className="text-xs text-gray-300 mt-1">
            You start in the lower chamber with a painted <b>mural</b> — four colours in order, the
            combination. Memorise it, climb the corridor to the <b>switch room</b> (the mural is out of
            sight up there), and set each switch to match. All four correct → the <b>spikes</b> retract
            and the reward is yours. Forget the code? Walk back down and look again.
          </p>
        ) : (
          <p className="text-xs text-gray-300 mt-1">
            Walk over each <b>torch</b> to light it (a lit torch shows that switch&apos;s target colour),
            set every <b>switch</b> above to match, and the <b>spikes</b> retract.
          </p>
        )}
        <p className="text-xs mt-2">
          answer (debug):{" "}
          {target.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 mr-2">
              <span
                style={{ background: toggleStateColor(c) }}
                className="inline-block w-3 h-3 rounded-sm border border-black/40"
              />
              {COLOR_NAMES[c] ?? c}
            </span>
          ))}
        </p>
        <p className="text-xs text-gray-400 mt-2 space-x-3">
          <a className="underline text-sky-300" href={`/test-cipher-room?style=${style === "mural" ? "torches" : "mural"}`}>
            → try the {style === "mural" ? "torch" : "mural"} version
          </a>
          <button className="underline" onClick={() => setResetKey((k) => k + 1)}>
            restart
          </button>
        </p>
      </div>

      <TilemapGrid
        key={`${style}-${resetKey}`}
        tileTypes={tileTypes}
        initialGameState={state}
        forceDaylight={style === "torches"}
        storageSlot="test"
      />
    </div>
  );
}

export default function TestCipherRoomPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
