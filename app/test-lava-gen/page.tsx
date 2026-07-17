"use client";

import React, { Suspense } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, TileSubtype, type GameState, Direction } from "../../lib/map";
import { generateCompleteMapForFloor } from "../../lib/map/map-features";
import { mulberry32, withPatchedMathRandom, hashStringToSeed } from "../../lib/rng";

/**
 * Seed browser for daily lava generation. Renders a REAL floor-2/3 map through the
 * same seeded path advanceToNextFloor uses (withPatchedMathRandom(mulberry32(seed +
 * floor))), fully lit, no enemies — purely for eyeballing where lava pools land
 * relative to rooms, corridors, exit, and keys across seeds.
 *
 * URL knobs:
 *   ?seed=123   — base seed (defaults to today's real daily seed)
 *   ?floor=2    — 2 or 3 (the floors that carry lava)
 */
function buildFloor(seed: number, floor: number): GameState {
  // Mirror advanceToNextFloor: floorSeed = dailySeed + floor, one mulberry32 stream.
  const rng = mulberry32(seed + floor);
  const allocation =
    floor === 2
      ? {
          chests: 2,
          keys: 2,
          chestContents: [TileSubtype.SNAKE_MEDALLION, TileSubtype.EXTRA_HEART],
        }
      : { chests: 0, keys: 0, chestContents: [] };

  const mapData = withPatchedMathRandom(rng, () =>
    generateCompleteMapForFloor(allocation, floor, { includeLava: true })
  );

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: true,
    showFullMap: true,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [],
    heroHealth: 30,
    heroMaxHealth: 30,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 12,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData,
    recentDeaths: [],
    mode: "normal",
  };
}

function countLava(state: GameState): number {
  return state.mapData.subtypes
    .flat()
    .filter((subs) => subs.includes(TileSubtype.LAVA)).length;
}

/** Full-floor minimap: the game camera only shows ~15 tiles around the hero, which is
 *  useless for judging generation. One colored cell per tile. */
function MiniMap({ state }: { state: GameState }) {
  const { tiles, subtypes } = state.mapData;
  const cellFor = (y: number, x: number): { bg: string; title: string } => {
    const subs = subtypes[y][x] ?? [];
    if (subs.includes(TileSubtype.LAVA)) return { bg: "#ff5a1e", title: "lava" };
    if (subs.includes(TileSubtype.OBSIDIAN)) return { bg: "#4a3040", title: "obsidian" };
    if (subs.includes(TileSubtype.PLAYER)) return { bg: "#ffffff", title: "hero" };
    if (subs.includes(TileSubtype.EXIT)) return { bg: "#34d399", title: "exit" };
    if (subs.includes(TileSubtype.EXITKEY)) return { bg: "#fde047", title: "exit key" };
    if (subs.includes(TileSubtype.KEY)) return { bg: "#eab308", title: "chest key" };
    if (subs.includes(TileSubtype.CHEST)) return { bg: "#a16207", title: "chest" };
    if (subs.includes(TileSubtype.FAULTY_FLOOR)) return { bg: "#111111", title: "faulty" };
    if (subs.includes(TileSubtype.POT)) return { bg: "#8d7350", title: "pot" };
    if (subs.includes(TileSubtype.ROCK)) return { bg: "#9ca3af", title: "rock" };
    if (tiles[y][x] === 1) return { bg: "#3f4a3f", title: "wall" };
    return { bg: "#6b7a5e", title: "floor" };
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${tiles[0].length}, 11px)`,
        gap: 1,
        background: "#222",
        padding: 4,
      }}
    >
      {tiles.map((row, y) =>
        row.map((_, x) => {
          const { bg, title } = cellFor(y, x);
          return (
            <div
              key={`${y}-${x}`}
              title={`${title} (${y},${x})`}
              style={{ width: 11, height: 11, background: bg }}
            />
          );
        })
      )}
    </div>
  );
}

function TestLavaGenInner() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const todaySeed = hashStringToSeed(new Date().toLocaleDateString("en-CA"));
  const seed = params?.get("seed") ? Number(params.get("seed")) : todaySeed;
  const floor = params?.get("floor") === "3" ? 3 : 2;

  const state = buildFloor(seed, floor);
  const lavaCount = countLava(state);

  const link = (s: number, f: number) => `/test-lava-gen?seed=${s}&floor=${f}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-white bg-black/90">
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="text-center bg-black/70 rounded-lg p-3">
          <h1 className="text-xl font-bold">Daily Lava Generation Browser</h1>
          <p className="text-xs text-gray-300 mt-1">
            seed <b>{seed}</b>
            {seed === todaySeed ? " (today's daily)" : ""} · floor <b>{floor}</b> ·
            lava tiles: <b>{lavaCount}</b>
          </p>
          <p className="text-xs text-gray-300 mt-1 space-x-2">
            <a className="underline" href={link(seed - 1, floor)}>
              ← prev seed
            </a>
            <a className="underline" href={link(seed + 1, floor)}>
              next seed →
            </a>
            <a className="underline" href={link(seed, floor === 2 ? 3 : 2)}>
              switch to floor {floor === 2 ? 3 : 2}
            </a>
            <a className="underline" href={link(todaySeed, floor)}>
              today
            </a>
          </p>
        </div>
        <MiniMap state={state} />
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={state}
          forceDaylight={true}
        />
      </div>
    </div>
  );
}

export default function TestLavaGenPage() {
  return (
    <Suspense fallback={null}>
      <TestLavaGenInner />
    </Suspense>
  );
}
