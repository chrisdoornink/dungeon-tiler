"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, type GameState } from "../../lib/map";
import {
  describeRoom,
  parsePuzzleRoom,
  puzzleRoomToGameState,
} from "../../lib/puzzles/rooms";
import { solutionStates } from "../../lib/puzzles/solver";
import {
  generateDungeonRoom,
  type GeneratedDungeon,
} from "../../lib/puzzles/generate_dungeon";
import { TileSubtype } from "../../lib/map/constants";

/**
 * RANDOMLY GENERATED dungeon puzzles — a fresh one on every refresh.
 *
 * The LAYOUT-FIRST generator (lib/puzzles/generate_dungeon.ts): a normal dungeon of rooms joined by
 * corridors, with puzzle blockades FITTED onto its natural chokepoints (v1: barred doors on
 * corridors, opened by switches, plus a key the exit needs). Every room is solver-checked before it
 * is shown, so it is always solvable; the seed is displayed so a good room can be reproduced.
 */

/** Full-room minimap. The camera only shows a window, which is useless for reading a puzzle. */
function MiniMap({ state, cell = 12 }: { state: GameState; cell?: number }) {
  const { tiles, subtypes } = state.mapData;
  const cellFor = (y: number, x: number): { bg: string; title: string } => {
    const subs = subtypes[y][x] ?? [];
    if (subs.includes(TileSubtype.MOVING_PLATFORM))
      return { bg: "#d4d8de", title: "SLAB (safe to stand on)" };
    if (subs.includes(TileSubtype.TOGGLE_SWITCH))
      return { bg: "#38bdf8", title: "switch" };
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
        : { bg: "#1e4e7a", title: "deep water (swimmable)" };
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
  // Seed is chosen client-side AFTER mount (SSR renders the "rolling" placeholder), both to avoid a
  // hydration mismatch and so every refresh genuinely rolls a new room.
  const [seed, setSeed] = useState<number | null>(null);
  const [seedField, setSeedField] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  useEffect(() => {
    if (seed === null) setSeed(1 + Math.floor(Math.random() * 999_999));
  }, [seed]);

  // Generation + certification runs the real solver a couple of times, so a room can take a few
  // seconds — the placeholder below covers it. Deterministic: the same seed always rebuilds the
  // identical room, which is what makes the seed shareable.
  const generated: GeneratedDungeon | { error: string } | null = useMemo(() => {
    if (seed === null) return null;
    try {
      return generateDungeonRoom(seed);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [seed]);
  const room = generated && !("error" in generated) ? generated : null;

  const parsed = useMemo(() => (room ? parsePuzzleRoom(room.spec) : null), [room]);
  const state = useMemo(() => {
    void resetCount; // a restart re-parses the same spec into a fresh, unplayed world
    return room ? puzzleRoomToGameState(parsePuzzleRoom(room.spec)) : null;
  }, [room, resetCount]);
  // The intended line, replayed on the goblin-stripped variant the solver certified. Goblins are
  // not rendered by the minimap anyway (they live on the game state, not the tiles), so the
  // playback looks identical to the real room.
  const playback = useMemo(
    () =>
      room ? solutionStates(parsePuzzleRoom(room.spec), room.solution) : null,
    [room]
  );
  const [playStep, setPlayStep] = useState<number | null>(null);

  useEffect(() => {
    if (playStep === null || !playback || playStep >= playback.length - 1) return;
    const t = setTimeout(() => setPlayStep((s) => (s === null ? null : s + 1)), 450);
    return () => clearTimeout(t);
  }, [playStep, playback]);

  useEffect(() => {
    setPlayStep(null);
  }, [seed, resetCount]);

  const shownState = playStep !== null && playback ? playback[playStep] : state;

  const reroll = () => {
    setOutcome("none");
    setSeed(1 + Math.floor(Math.random() * 999_999));
  };
  const loadSeed = () => {
    const n = parseInt(seedField, 10);
    if (Number.isFinite(n) && n > 0) {
      setOutcome("none");
      setSeed(n);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-4">
      <div className="text-center bg-black/70 rounded-lg p-3 w-full max-w-3xl">
        <h1 className="text-xl font-bold">Generated Dungeon Puzzles</h1>
        <p className="text-xs text-gray-300 mt-1">
          A <b>new dungeon on every refresh</b> — a normal layout of rooms and corridors, with puzzle
          blockades fitted onto it and checked solvable before you see it. Walk onto a{" "}
          <b>switch</b> to drop the barred door it controls; fetch the <b>key</b>, then reach the{" "}
          <b>exit</b>. The seed reproduces a dungeon exactly — note it if one is worth talking about.
        </p>

        <div className="flex flex-wrap gap-2 justify-center items-center mt-3">
          <button
            onClick={reroll}
            className="px-3 py-1 rounded text-sm bg-emerald-700 hover:bg-emerald-600 font-bold"
          >
            New room
          </button>
          <button
            onClick={() => {
              setOutcome("none");
              setResetCount((c) => c + 1);
            }}
            className="px-3 py-1 rounded text-sm bg-red-700 hover:bg-red-600"
          >
            Restart this room
          </button>
          <span className="w-px bg-gray-600 mx-1 self-stretch" />
          <input
            value={seedField}
            onChange={(e) => setSeedField(e.target.value)}
            placeholder="seed"
            inputMode="numeric"
            className="w-24 px-2 py-1 rounded text-sm bg-gray-800 border border-gray-600 text-white"
          />
          <button
            onClick={loadSeed}
            className="px-3 py-1 rounded text-sm bg-gray-700 hover:bg-gray-600"
          >
            Load seed
          </button>
        </div>
      </div>

      {generated === null && (
        <div className="bg-black/60 rounded-lg px-4 py-3 text-sm text-gray-300">
          Rolling a room…
        </div>
      )}
      {generated && "error" in generated && (
        <div className="bg-red-900/80 rounded-lg px-4 py-3 text-sm max-w-2xl">
          <div className="font-bold">Generation failed for this seed.</div>
          <div className="text-xs mt-1 text-red-200">{generated.error}</div>
        </div>
      )}

      {room && parsed && (
        <div className="bg-black/60 rounded-lg p-3 max-w-3xl text-sm">
          <div className="font-bold text-amber-300">
            {room.spec.name}{" "}
            <span className="text-xs font-normal text-gray-400">
              seed {room.seed} · {room.meta.rooms} rooms · {room.meta.gates} gates
              {room.meta.keyDetour ? " · key off the path" : ""}
            </span>
          </div>
          <div className="text-gray-300 mt-1">{room.spec.asks}</div>
          <div className="text-xs text-gray-500 mt-2">{describeRoom(parsed)}</div>
          <div className="text-xs mt-1">
            <span className="text-emerald-300">certified:</span> solvable in{" "}
            <b>{room.minTurns}</b> turns ·{" "}
            <span className="uppercase tracking-wide">{room.tier}</span>
          </div>
        </div>
      )}

      {outcome === "lost" && (
        <div className="bg-red-900/90 rounded-lg px-4 py-2 text-sm font-bold">
          Died. Restart to try the room again — or roll a new one.
        </div>
      )}
      {outcome === "won" && (
        <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold">
          Solved — how did it rate? Note the seed if it&apos;s worth discussing.
        </div>
      )}

      {room && shownState && state && (
        <div className="flex flex-wrap gap-4 items-start justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs text-gray-400">
              whole room{playStep !== null ? " · solver playback" : ""}
            </div>
            <MiniMap state={shownState} />
            <button
              onClick={() => setPlayStep(0)}
              className="px-3 py-1 rounded text-xs bg-emerald-700 hover:bg-emerald-600"
            >
              {playStep === null ? "▶" : "↻"} Watch the intended line ({room.minTurns} turns)
            </button>
            <div className="text-xs text-gray-400 h-4">
              {playStep !== null ? `turn ${playStep} / ${room.minTurns}` : ""}
            </div>
          </div>
          <TilemapGrid
            key={`${room.seed}-${resetCount}`}
            tileTypes={tileTypes}
            initialGameState={state}
            forceDaylight={true}
            storageSlot="test"
            onWin={() => setOutcome("won")}
            onDeath={() => setOutcome("lost")}
          />
        </div>
      )}
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
