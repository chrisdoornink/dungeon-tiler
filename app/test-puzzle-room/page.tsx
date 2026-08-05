"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, Direction, type GameState } from "../../lib/map";
import { createEmptyByKind } from "../../lib/enemies/registry";
import {
  PUZZLE_ROOMS,
  describeRoom,
  parsePuzzleRoom,
} from "../../lib/puzzles/rooms";
import { TileSubtype } from "../../lib/map/constants";

/**
 * Prototype bench for TOGGLE SWITCHES and MOVING PLATFORMS.
 *
 * Four hand-authored rooms, each isolating one question about whether these are worth building a
 * puzzle-floor archetype around. The question a room is asking is printed above it — play it with
 * that question in mind rather than trying to "win", because a room that is easy to beat and dull
 * to beat is a failed room.
 *
 * PRESS `.` (or numpad 5) TO WAIT. That is not a convenience: a slab advances once per turn and
 * the hero must be aboard to be carried, so waiting is how you ride. There is no mobile button for
 * it yet.
 *
 * The first rooms are deliberately enemy-free so the mechanic is judged on its own. The last two
 * add fire-goblins: one where a hazard keeps them isolated (watch them near a moving platform
 * without chase pressure) and one where they chase (watch a platform work as an escape route).
 */

function roomToState(index: number, resetCount: number): GameState {
  const room = parsePuzzleRoom(PUZZLE_ROOMS[index]);
  void resetCount; // forces a fresh object on reset
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: room.enemies,
    npcs: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: room.rocks,
    runeCount: 0,
    foodCount: 0,
    potionCount: 0,
    mode: "normal",
    allowCheckpoints: false,
    mapData: room.mapData,
    toggleGroups: room.toggleGroups,
    platforms: room.platforms,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: createEmptyByKind(),
    },
    recentDeaths: [],
    diaryEntries: [],
  } as unknown as GameState;
}

/** Full-room minimap. The camera only shows a window, which is useless for reading a puzzle. */
function MiniMap({ state, cell = 12 }: { state: GameState; cell?: number }) {
  const { tiles, subtypes } = state.mapData;
  const cellFor = (y: number, x: number): { bg: string; title: string } => {
    const subs = subtypes[y][x] ?? [];
    if (subs.includes(TileSubtype.MOVING_PLATFORM))
      return { bg: "#d4d8de", title: "SLAB (safe to stand on)" };
    if (subs.includes(TileSubtype.TOGGLE_SWITCH))
      return { bg: "#38bdf8", title: "toggle switch" };
    if (subs.includes(TileSubtype.SPIKES)) return { bg: "#e11d48", title: "spikes (up)" };
    if (subs.includes(TileSubtype.SPIKE_HOLES))
      return { bg: "#7f1d1d", title: "spikes (retracted — walkable)" };
    if (subs.includes(TileSubtype.LAVA)) {
      return subs.includes(TileSubtype.PLATFORM_TRACK)
        ? { bg: "#b3491c", title: "lava on the platform's route" }
        : { bg: "#ff5a1e", title: "lava" };
    }
    if (subs.includes(TileSubtype.DEEP_WATER)) {
      return subs.includes(TileSubtype.PLATFORM_TRACK)
        ? { bg: "#17384f", title: "deep water on the platform's route" }
        : { bg: "#1e4e7a", title: "deep water" };
    }
    if (subs.includes(TileSubtype.PLATFORM_TRACK))
      return { bg: "#5b6472", title: "platform route" };
    if (subs.includes(TileSubtype.PLAYER)) return { bg: "#ffffff", title: "hero" };
    if (subs.includes(TileSubtype.EXIT)) return { bg: "#34d399", title: "exit" };
    if (subs.includes(TileSubtype.EXITKEY)) return { bg: "#fde047", title: "exit key" };
    if (subs.includes(TileSubtype.ROCK)) return { bg: "#9ca3af", title: "rock" };
    if (subs.includes(TileSubtype.POT)) return { bg: "#8d7350", title: "pot" };
    if (tiles[y][x] === 1) return { bg: "#3f4a3f", title: "wall" };
    return { bg: "#6b7a5e", title: "floor" };
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${tiles[0].length}, ${cell}px)`,
        gap: 1,
        background: "#222",
        padding: 3,
        width: "fit-content",
      }}
    >
      {tiles.map((row, y) =>
        row.map((_, x) => {
          const { bg, title } = cellFor(y, x);
          return (
            <div
              key={`${y}-${x}`}
              title={`${title} (${y},${x})`}
              style={{ width: cell, height: cell, background: bg }}
            />
          );
        })
      )}
    </div>
  );
}

function TestPuzzleRoomInner() {
  const [index, setIndex] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  const state = useMemo(() => roomToState(index, resetCount), [index, resetCount]);
  const room = useMemo(() => parsePuzzleRoom(PUZZLE_ROOMS[index]), [index]);
  const spec = PUZZLE_ROOMS[index];

  const reset = () => {
    setOutcome("none");
    setResetCount((c) => c + 1);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-4">
      <div className="text-center bg-black/70 rounded-lg p-3 w-full max-w-3xl">
        <h1 className="text-xl font-bold">Puzzle Machinery Prototype</h1>
        <p className="text-xs text-gray-300 mt-1">
          Toggle switches and moving platforms in hand-authored rooms. Most are{" "}
          <b>enemy-free</b> to isolate the mechanic; the last two (<b>Behind Glass</b>,{" "}
          <b>The Getaway</b>) add fire-goblins to see how they read around a moving platform —
          isolated by a hazard in one, actively chasing in the other.
        </p>
        <p className="text-sm mt-2 rounded bg-sky-900/50 px-3 py-2">
          Press <b className="font-mono">.</b> (or numpad <b className="font-mono">5</b>) to{" "}
          <b>wait a turn</b>, or tap either <b>hourglass</b> in the top corners of the on-screen
          d-pad. A deck moves once per turn and carries whoever is standing on it — but a rider
          keeps their place on the deck, so crossing means riding <i>and</i> walking forward along
          it, not waiting alone.
        </p>

        <div className="flex flex-wrap gap-2 justify-center mt-3">
          {PUZZLE_ROOMS.map((r, i) => (
            <button
              key={r.name}
              onClick={() => {
                setIndex(i);
                setOutcome("none");
              }}
              className={`px-3 py-1 rounded text-sm ${
                i === index
                  ? "bg-sky-700 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {r.name}
            </button>
          ))}
          <span className="w-px bg-gray-600 mx-1 self-stretch" />
          <button
            onClick={reset}
            className="px-3 py-1 rounded text-sm bg-red-700 hover:bg-red-600"
          >
            Restart
          </button>
        </div>
      </div>

      <div className="bg-black/60 rounded-lg p-3 max-w-3xl text-sm">
        <div className="font-bold text-amber-300">{spec.name}</div>
        <div className="text-gray-300 mt-1">{spec.asks}</div>
        <div className="text-xs text-gray-500 mt-2">{describeRoom(room)}</div>
      </div>

      {outcome === "lost" && (
        <div className="bg-red-900/90 rounded-lg px-4 py-2 text-sm font-bold">
          Died. Restart to try the room again.
        </div>
      )}
      {outcome === "won" && (
        <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold">
          Solved — was it interesting, or just fiddly?
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-start justify-center">
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs text-gray-400">whole room</div>
          <MiniMap state={state} />
        </div>
        <TilemapGrid
          key={`${index}-${resetCount}`}
          tileTypes={tileTypes}
          initialGameState={state}
          forceDaylight={true}
          storageSlot="test"
          onWin={() => setOutcome("won")}
          onDeath={() => setOutcome("lost")}
        />
      </div>
    </div>
  );
}

export default function TestPuzzleRoomPage() {
  return (
    <Suspense fallback={null}>
      <TestPuzzleRoomInner />
    </Suspense>
  );
}
