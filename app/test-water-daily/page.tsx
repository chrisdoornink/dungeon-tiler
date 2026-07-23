"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  TileSubtype,
  Direction,
  initializeGameStateForMultiTier,
  advanceToNextFloor,
  type GameState,
} from "../../lib/map";
import { rollWaterPlan, type WaterPlan } from "../../lib/map/map-features";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { DateUtils } from "../../lib/date_utils";

/**
 * Daily WATER generation browser, keyed by DATE. Pick a past date and this rebuilds
 * that day's real 3-floor daily run through the exact seeded path the game uses
 * (withPatchedMathRandom(mulberry32(seed)) → initializeGameStateForMultiTier(1), then
 * advanceToNextFloor for floors 2-3), so you see precisely how water (semi-random,
 * ~1-in-3 floors, weighted size tiers) would land that day — and how the rock count
 * scales with it. Floor 1 is the element-free teaching floor.
 *
 * The rolled water plan (tier / pool count / target coverage) is shown per floor by
 * re-running the same seeded roll in an isolated stream — it matches what the map
 * builder rolled because the water roll is the first RNG draw for each floor.
 *
 * Only past-or-today dates are allowed (future dates would spoil upcoming dailies).
 */

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function countSub(state: GameState, sub: TileSubtype): number {
  return state.mapData.subtypes.flat().filter((s) => s.includes(sub)).length;
}

type FloorData = {
  floor: number;
  state: GameState;
  plan: WaterPlan | null;
  deep: number;
  shallow: number;
  lava: number;
  rocks: number;
};

function buildDay(dateStr: string): FloorData[] {
  const seed = hashStringToSeed(dateStr);
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1)
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  const states = [f1, f2, f3];
  // Re-run the water roll in an isolated stream per floor — the roll is the first RNG
  // draw inside advanceToNextFloor's mulberry32(seed + floor) stream, so this matches.
  const plans: (WaterPlan | null)[] = [
    null,
    withPatchedMathRandom(mulberry32(seed + 2), () => rollWaterPlan(2)),
    withPatchedMathRandom(mulberry32(seed + 3), () => rollWaterPlan(3)),
  ];
  return states.map((state, i) => ({
    floor: i + 1,
    state,
    plan: plans[i],
    deep: countSub(state, TileSubtype.DEEP_WATER),
    shallow: countSub(state, TileSubtype.SHALLOW_WATER),
    lava: countSub(state, TileSubtype.LAVA),
    rocks: countSub(state, TileSubtype.ROCK),
  }));
}

/** Full-floor minimap: one colored cell per tile (the game camera only shows a small
 *  window, useless for judging generation). */
function MiniMap({ state, cell = 8 }: { state: GameState; cell?: number }) {
  const { tiles, subtypes } = state.mapData;
  const cellFor = (y: number, x: number): { bg: string; title: string } => {
    const subs = subtypes[y][x] ?? [];
    if (subs.includes(TileSubtype.LAVA)) return { bg: "#ff5a1e", title: "lava" };
    if (subs.includes(TileSubtype.OBSIDIAN)) return { bg: "#4a3040", title: "obsidian" };
    if (subs.includes(TileSubtype.DEEP_WATER)) return { bg: "#1e4e7a", title: "deep water" };
    if (subs.includes(TileSubtype.SHALLOW_WATER)) return { bg: "#4a7f9c", title: "shallow water" };
    if (subs.includes(TileSubtype.STEPPING_STONE)) return { bg: "#8a8f94", title: "stepping stone" };
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

function planLabel(fd: FloorData): string {
  if (fd.floor === 1) return "teaching floor — no elements";
  if (!fd.plan) return "dry (no water rolled)";
  const cov = Math.round(fd.plan.coverage * 100);
  const pools = fd.plan.poolCount === 1 ? "1 pool" : `${fd.plan.poolCount} pools`;
  return `${fd.plan.tier} · ${pools} · target ${cov}%`;
}

function FloorColumn({
  fd,
  selected,
  onSelect,
}: {
  fd: FloorData;
  selected: boolean;
  onSelect: () => void;
}) {
  const watered = fd.deep > 0 || fd.shallow > 0;
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg p-2"
      style={{
        background: selected ? "rgba(59,130,246,0.18)" : "rgba(0,0,0,0.5)",
        border: selected ? "1px solid #3b82f6" : "1px solid #333",
      }}
    >
      <button
        onClick={onSelect}
        className="text-sm font-bold underline-offset-2 hover:underline"
      >
        Floor {fd.floor} {selected ? "◂ viewing" : ""}
      </button>
      <div className="text-[11px] text-gray-300 text-center leading-tight">
        <div className={watered ? "text-sky-300" : "text-gray-400"}>{planLabel(fd)}</div>
        <div className="mt-1">
          deep <b>{fd.deep}</b> · shallow <b>{fd.shallow}</b>
        </div>
        <div>
          lava <b>{fd.lava}</b> · rocks <b>{fd.rocks}</b>
        </div>
      </div>
      <MiniMap state={fd.state} cell={7} />
    </div>
  );
}

function TestWaterDailyInner() {
  const today = DateUtils.getTodayString();
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialDate = (() => {
    const q = params?.get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= today) return q;
    return today;
  })();

  const [date, setDate] = useState(initialDate);
  const [selectedFloor, setSelectedFloor] = useState(2); // F2 is the first water candidate

  const day = useMemo(() => buildDay(date), [date]);

  const clampPast = (d: string) => (d > today ? today : d);
  const wateredFloors = day.filter((f) => f.deep > 0 || f.shallow > 0).length;
  const totalDeep = day.reduce((n, f) => n + f.deep, 0);

  const selected = day[selectedFloor - 1];
  const gridState: GameState = {
    ...selected.state,
    enemies: [],
    npcs: [],
    showFullMap: true,
    playerDirection: Direction.DOWN,
    mode: "normal",
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-4">
      <div className="text-center bg-black/70 rounded-lg p-3 w-full max-w-3xl">
        <h1 className="text-xl font-bold">Daily Water Generation Browser</h1>
        <p className="text-xs text-gray-300 mt-1">
          Rebuilds a past day&apos;s real 3-floor daily. Water is semi-random: ~1-in-3
          floors, mostly small, rarely a ~50% flood. Rocks scale with water.
        </p>
        <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
          <button
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-sm"
            onClick={() => setDate((d) => shiftDate(d, -1))}
          >
            ← prev day
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(clampPast(e.target.value))}
            className="bg-white/10 rounded px-2 py-1 text-sm"
          />
          <button
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-sm disabled:opacity-30"
            disabled={date >= today}
            onClick={() => setDate((d) => clampPast(shiftDate(d, 1)))}
          >
            next day →
          </button>
          <button
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-sm"
            onClick={() => setDate(today)}
          >
            today
          </button>
        </div>
        <p className="text-xs text-gray-300 mt-2">
          <b>{date}</b>
          {date === today ? " (today's daily)" : ""} · seed{" "}
          <b>{hashStringToSeed(date)}</b> · watered floors <b>{wateredFloors}/3</b> · total
          deep-water tiles <b>{totalDeep}</b>
        </p>
      </div>

      <div className="flex gap-3 flex-wrap justify-center max-w-full overflow-x-auto">
        {day.map((fd) => (
          <FloorColumn
            key={fd.floor}
            fd={fd}
            selected={fd.floor === selectedFloor}
            onSelect={() => setSelectedFloor(fd.floor)}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-gray-300">
          Full view — Floor {selectedFloor} ({planLabel(selected)})
        </div>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={gridState}
          forceDaylight={true}
        />
      </div>
    </div>
  );
}

export default function TestWaterDailyPage() {
  return (
    <Suspense fallback={null}>
      <TestWaterDailyInner />
    </Suspense>
  );
}
