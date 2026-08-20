"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, type GameState } from "../../lib/map";
import { initializeGameStateFromMap } from "../../lib/map/game-state";
import { buildCipherRoomFloor } from "../../lib/map/cipher_room";
import { toggleStateColor } from "../../lib/map/machinery";

/**
 * Bench for the prescribed colour-cipher puzzle room (lib/map/cipher_room.ts). Builds the standalone
 * room and drops you in with a lit torch and no enemies, so the puzzle can be walked in isolation:
 * step over each CODE_TORCH to light it (revealing that switch's target colour), set each switch above
 * to match, and the spike gate retracts to free the two hearts behind it.
 *
 * The panel shows the answer for debugging — in a real room you would only know it from the flames.
 */
const COLOR_NAMES = ["blue", "green", "violet", "rose"];

function forBench(): { state: GameState; target: number[] } {
  const { mapData, colorLocks } = buildCipherRoomFloor();
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
    showFullMap: true,
    mode: "normal",
  };
  return { state, target: colorLocks[0].target ?? [] };
}

function Inner() {
  const [resetKey, setResetKey] = useState(0);
  const { state, target } = useMemo(() => forBench(), []);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-3">
      <div className="text-center bg-black/70 rounded-lg p-3 max-w-2xl">
        <h1 className="text-xl font-bold">Colour-Cipher Room — bench</h1>
        <p className="text-xs text-gray-300 mt-1">
          Walk over each <b>torch</b> to light it — a lit torch burns in that switch&apos;s{" "}
          <b>target colour</b>. Set every <b>switch</b> (step on it to cycle) to match the torch below
          it, and the <b>spikes</b> retract so you can take the two hearts. No enemies here; in a real
          level the room&apos;s surroundings are the pressure.
        </p>
        <p className="text-xs mt-2">
          answer (debug):{" "}
          {target.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 mr-2">
              <span
                style={{ background: toggleStateColor(c) }}
                className="inline-block w-3 h-3 rounded-full border border-black/40"
              />
              {COLOR_NAMES[c] ?? c}
            </span>
          ))}
        </p>
        <p className="text-xs text-gray-400 mt-2">
          <button className="underline" onClick={() => setResetKey((k) => k + 1)}>
            restart
          </button>
        </p>
      </div>

      <TilemapGrid
        key={resetKey}
        tileTypes={tileTypes}
        initialGameState={state}
        forceDaylight={true}
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
