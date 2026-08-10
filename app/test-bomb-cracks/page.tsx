"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { TileSubtype } from "../../lib/map/constants";

function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA");
}

function buildFloor3(dateStr: string): GameState {
  const seed = hashStringToSeed(dateStr);
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1)
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);

  return {
    ...f3,
    enemies: [],
    bombCount: 3,
    rockCount: 0,
    showFullMap: true,
  };
}

function countSub(state: GameState, sub: TileSubtype): number {
  return state.mapData.subtypes.flat().filter((s) => s.includes(sub)).length;
}

function findSubLocations(state: GameState, sub: TileSubtype): Array<{ y: number; x: number; subs: number[] }> {
  const locs: Array<{ y: number; x: number; subs: number[] }> = [];
  for (let y = 0; y < state.mapData.subtypes.length; y++) {
    for (let x = 0; x < state.mapData.subtypes[y].length; x++) {
      const subs = state.mapData.subtypes[y][x];
      if (subs.includes(sub)) {
        locs.push({ y, x, subs: [...subs] });
      }
    }
  }
  return locs;
}

function TestBombCracksInner() {
  const [date, setDate] = useState(todayDateStr);
  const [resetCount, setResetCount] = useState(0);

  const state = useMemo(() => buildFloor3(date), [date, resetCount]);

  const crackCount = countSub(state, TileSubtype.WALL_SEAL);
  const torchCount = countSub(state, TileSubtype.WALL_TORCH);
  const isBombDay = state.bossEntranceKind === "bomb";
  const entranceKind = state.bossEntranceKind ?? "none";
  const sealLocs = findSubLocations(state, TileSubtype.WALL_SEAL);
  const torchLocs = findSubLocations(state, TileSubtype.WALL_TORCH);
  const payloads = state.sealPayloads ?? {};

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
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm max-w-xl">
          <h1 className="text-2xl font-bold mb-2">Bomb Wall Crack Test</h1>
          <p className="text-sm text-gray-300">
            Today&rsquo;s floor 3 with no enemies, 3 bombs, and full map revealed.
            Walk around and inspect cracks. The real sealed doorway has{" "}
            <b>two torches flanking the crack</b>; decoys are bare.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 justify-center text-xs">
            <span className={`px-2 py-1 rounded ${isBombDay ? "bg-amber-700" : "bg-gray-700"}`}>
              Entrance: {entranceKind}
            </span>
            <span className="px-2 py-1 rounded bg-gray-700">
              Cracks: {crackCount}
            </span>
            <span className="px-2 py-1 rounded bg-gray-700">
              Wall torches: {torchCount}
            </span>
          </div>
        </div>

        <div className="bg-black/70 rounded-lg p-3 backdrop-blur-sm max-w-xl text-xs">
          <div className="mb-2 font-bold text-gray-400">Seal locations (WALL_SEAL tiles):</div>
          {sealLocs.map((loc) => {
            const key = `${loc.y},${loc.x}`;
            const payload = payloads[key];
            return (
              <div key={key} className="flex gap-2">
                <span className="text-gray-300">({loc.y}, {loc.x})</span>
                <span className="text-gray-500">subtypes: [{loc.subs.join(", ")}]</span>
                {payload && (
                  <span className={payload === "boss" ? "text-amber-400 font-bold" : "text-green-400"}>
                    payload: {payload}
                  </span>
                )}
              </div>
            );
          })}
          <div className="mt-2 mb-1 font-bold text-gray-400">Torch locations (WALL_TORCH tiles):</div>
          {torchLocs.map((loc) => (
            <div key={`${loc.y},${loc.x}`} className="text-gray-300">
              ({loc.y}, {loc.x})
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 justify-center bg-black/70 rounded-lg p-3 backdrop-blur-sm">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setResetCount((c) => c + 1);
            }}
            className="px-3 py-1 rounded text-sm bg-gray-800 text-white border border-gray-600"
          />
          <button
            onClick={() => setResetCount((c) => c + 1)}
            className="px-3 py-1 rounded text-sm bg-red-700 text-white hover:bg-red-600"
          >
            Reset
          </button>
        </div>

        <TilemapGrid
          key={`${date}-${resetCount}`}
          tileTypes={tileTypes}
          initialGameState={state}
          forceDaylight={true}
          storageSlot="test"
        />
      </div>
    </div>
  );
}

export default function TestBombCracksPage() {
  return (
    <Suspense fallback={null}>
      <TestBombCracksInner />
    </Suspense>
  );
}
