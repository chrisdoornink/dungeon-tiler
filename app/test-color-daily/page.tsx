"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, TileSubtype, type GameState } from "../../lib/map";
import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
} from "../../lib/map/game-state";
import { mulberry32, withPatchedMathRandom, hashStringToSeed } from "../../lib/rng";

/**
 * Preview harness for the daily FLOOR-2 colour-switch puzzle. Builds a real daily floor 2 through the
 * exact seeded path the game uses (initializeGameStateForMultiTier(1) -> advanceToNextFloor), so the
 * puzzle that appears is the one players get. It rolls on only ~35% of days, so this auto-scans
 * forward for a seed that carries one. Enemies are stripped and the hero armed so the puzzle can be
 * studied calmly — in the real daily the floor's enemies are the difficulty.
 *
 * URL: ?seed=123 (defaults to the first puzzle seed at/after today's daily seed).
 */
const SWITCH_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308"]; // one per colour index 0..3

function buildF2(seed: number): GameState {
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1)
  );
  return advanceToNextFloor(f1, seed);
}
const hasPuzzle = (s: GameState): boolean => (s.colorLocks ?? []).length > 0;

/** First seed at/after `from` whose floor 2 carries the puzzle (bounded scan). */
function findPuzzleSeed(from: number): number {
  for (let s = from; s < from + 400; s++) if (hasPuzzle(buildF2(s))) return s;
  return from;
}

/** Strip enemies + arm the hero so the puzzle is calmly explorable. */
function forPreview(s: GameState): GameState {
  return {
    ...s,
    mode: "normal", // avoid daily floor-advance side effects in the preview harness
    enemies: [],
    hasSword: true,
    hasShield: true,
    heroHealth: 20,
    heroMaxHealth: 20,
    showFullMap: true,
  };
}

function MiniMap({ state }: { state: GameState }) {
  const { tiles, subtypes } = state.mapData;
  const swColor = new Map<string, number>();
  for (const l of state.colorLocks ?? [])
    l.switches.forEach(([y, x], i) => swColor.set(`${y},${x}`, l.states[i] ?? 0));
  const cellFor = (y: number, x: number): { bg: string; title: string; ring?: boolean } => {
    const subs = subtypes[y][x] ?? [];
    if (subs.includes(TileSubtype.TOGGLE_SWITCH))
      return { bg: SWITCH_COLORS[swColor.get(`${y},${x}`) ?? 0] ?? "#fff", title: "colour switch", ring: true };
    if (subs.includes(TileSubtype.SPIKES)) return { bg: "#7f1d1d", title: "gate (shut)" };
    if (subs.includes(TileSubtype.SPIKE_HOLES)) return { bg: "#3b2020", title: "gate (open)" };
    if (subs.includes(TileSubtype.EXITKEY))
      return { bg: "#fde047", title: "exit key (sealed behind the gate)", ring: true };
    if (subs.includes(TileSubtype.LAVA)) return { bg: "#ff5a1e", title: "lava" };
    if (subs.includes(TileSubtype.DEEP_WATER)) return { bg: "#1e4e7a", title: "water" };
    if (subs.includes(TileSubtype.PLAYER)) return { bg: "#ffffff", title: "hero" };
    if (subs.includes(TileSubtype.EXIT)) return { bg: "#34d399", title: "exit" };
    if (subs.includes(TileSubtype.CHEST)) return { bg: "#a16207", title: "chest" };
    if (subs.includes(TileSubtype.KEY)) return { bg: "#eab308", title: "chest key" };
    if (subs.includes(TileSubtype.POT)) return { bg: "#8d7350", title: "pot" };
    if (subs.includes(TileSubtype.ROCK)) return { bg: "#9ca3af", title: "rock" };
    if (tiles[y][x] === 1) return { bg: "#3f4a3f", title: "wall" };
    return { bg: "#6b7a5e", title: "floor" };
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${tiles[0].length}, 12px)`,
        gap: 1,
        background: "#222",
        padding: 4,
        width: "fit-content",
      }}
    >
      {tiles.map((row, y) =>
        row.map((_, x) => {
          const { bg, title, ring } = cellFor(y, x);
          return (
            <div
              key={`${y}-${x}`}
              title={`${title} (${y},${x})`}
              style={{
                width: 12,
                height: 12,
                background: bg,
                boxShadow: ring ? "inset 0 0 0 2px #000" : undefined,
              }}
            />
          );
        })
      )}
    </div>
  );
}

function Inner() {
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const todaySeed = hashStringToSeed(
    typeof window !== "undefined" ? new Date().toLocaleDateString("en-CA") : "2026-08-20"
  );
  const urlSeed = params?.get("seed") ? Number(params.get("seed")) : null;
  const seed = urlSeed ?? findPuzzleSeed(todaySeed);
  const [resetKey, setResetKey] = useState(0);

  const f2 = useMemo(() => buildF2(seed), [seed]);
  const has = hasPuzzle(f2);
  const state = useMemo(() => forPreview(f2), [f2]);
  const lock = f2.colorLocks?.[0];

  const link = (s: number) => `/test-color-daily?seed=${s}`;
  const nextPuzzle = findPuzzleSeed(seed + 1);
  const prevPuzzle = (() => {
    for (let s = seed - 1; s > seed - 400 && s > 0; s--) if (hasPuzzle(buildF2(s))) return s;
    return seed;
  })();

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-3">
      <div className="text-center bg-black/70 rounded-lg p-3 max-w-3xl">
        <h1 className="text-xl font-bold">Daily Floor-2 Colour Puzzle — preview</h1>
        <p className="text-xs text-gray-300 mt-1">
          A real daily floor 2 (enemies stripped, hero armed). Turn all <b>four colour switches</b> to
          the <b>same colour</b> — the corner-dot palette shows each one&apos;s colour — to drop the{" "}
          <b>gate</b> and reach the <b>exit key</b> (you can&apos;t leave the floor without it, so the
          puzzle is mandatory). In the live daily the floor&apos;s enemies are the difficulty; it rolls
          on only ~15-20% of days.
        </p>
        <p className="text-xs mt-2">
          seed <b>{seed}</b>
          {seed === todaySeed ? " (today)" : ""} ·{" "}
          {has ? (
            <span className="text-emerald-300">
              puzzle present · {lock?.switches.length} switches · {lock?.colors} colours
            </span>
          ) : (
            <span className="text-amber-300">no puzzle on this seed</span>
          )}
        </p>
        <p className="text-xs text-gray-300 mt-2 space-x-3">
          <a className="underline" href={link(prevPuzzle)}>
            ← prev puzzle seed
          </a>
          <a className="underline" href={link(nextPuzzle)}>
            next puzzle seed →
          </a>
          <a className="underline" href={link(findPuzzleSeed(todaySeed))}>
            today
          </a>
          <button className="underline" onClick={() => setResetKey((k) => k + 1)}>
            restart
          </button>
        </p>
      </div>

      {has && (
        <div className="text-xs text-gray-400">
          whole floor — switches ringed in black show their current colour; the gate is dark red
        </div>
      )}
      <MiniMap state={state} />
      <TilemapGrid
        key={`${seed}-${resetKey}`}
        tileTypes={tileTypes}
        initialGameState={state}
        forceDaylight={true}
        storageSlot="test"
      />
    </div>
  );
}

export default function TestColorDailyPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
