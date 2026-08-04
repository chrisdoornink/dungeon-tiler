"use client";

import React, { Suspense, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  TileSubtype,
  Direction,
  initializeGameStateForMultiTier,
  advanceToNextFloor,
  findPlayerPosition,
  type GameState,
} from "../../lib/map";
import {
  applySwitchGate,
  planSwitchGateBestEffort,
  SWITCH_GATE_FLOOR_CHANCE,
  type PlateAccess,
  type SwitchGatePlan,
} from "../../lib/map/switch-gates";
import { mulberry32, withPatchedMathRandom } from "../../lib/rng";

/**
 * Switch-gate feel test on RANDOM generated dailies.
 *
 * Deliberately not date-seeded like test-water-daily: the question here is not "what does a
 * given day look like" but "does this hold up across arbitrary floors", so Reroll picks a
 * fresh random seed and rebuilds all three floors through the real generation path
 * (withPatchedMathRandom(mulberry32(seed)) -> initializeGameStateForMultiTier(1), then
 * advanceToNextFloor). Every floor then gets one gate injected on top by
 * lib/map/switch-gates.ts.
 *
 * The floor buttons swap which floor you are standing in, so a reroll can be judged on F2
 * and F3 without playing through F1 first.
 *
 * TWO MODES. "every floor" forces a gate onto all three, which is the right view for judging
 * placement QUALITY across a lot of maps quickly. "daily cascade" runs the real shipped rule —
 * floor 1 rolls 30%, floor 2 rolls 30% if floor 1 missed, floor 3 takes whatever is left — so a
 * day gets at most one gate and ~1 in 15 gets none. Use that one to judge FREQUENCY.
 *
 * WHAT TO JUDGE
 *  - Do you notice the spikes, and do you work out the switch behind them without being told?
 *  - Is throwing a rock through the bed a satisfying "oh" or a chore?
 *  - Does the retracted lane ever actually matter later, or do you open it and forget it?
 *  - Is the walk-around alternative tempting enough that spending the rock feels like a
 *    choice rather than the only move?
 *  - Access = "on the path" is the control: a switch you just walk over, i.e. what this
 *    would be if it were only a second key. Compare the two.
 *
 * `detour` is the number of extra steps the shut bed adds to the longest route the run
 * actually needs. It is the honest measure of whether a gate is worth opening; a low number
 * means this particular floor had nothing worth gating and the placement is near-pointless.
 */

type GateMode = "every-floor" | "daily-cascade";

type FloorData = {
  floor: number;
  state: GameState;
  plan: SwitchGatePlan | null;
  hero: [number, number] | null;
};

/**
 * "daily cascade" goes through the real generator with switchGates on, so what you see is
 * exactly what a player gets. "every floor" builds the same day with the feature off and then
 * forces a gate onto each floor, which is not shippable behavior but is far faster to judge
 * placement on.
 */
function buildDay(seed: number, access: PlateAccess, mode: GateMode): FloorData[] {
  const cascade = mode === "daily-cascade";
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1, { switchGates: cascade })
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  return [f1, f2, f3].map((state, i) => {
    const hero = findPlayerPosition(state.mapData);
    let plan: SwitchGatePlan | null = null;
    if (cascade) {
      // Read back what the generator decided rather than planning again. The detour/throw
      // numbers are not persisted on the state, so they show as 0 in this mode.
      const g = state.gateGroups?.[0];
      if (g) {
        plan = { bed: g.gates, plate: g.plate, access: "behind-bed", detour: 0, throwDistance: 0 };
      }
    } else if (hero) {
      plan = planSwitchGateBestEffort(state.mapData, hero, { access });
      if (plan) applySwitchGate(state, state.mapData, plan);
    }
    return { floor: i + 1, state, plan, hero };
  });
}

/** Full-floor minimap — the game camera only shows a window, useless for judging placement. */
function MiniMap({
  state,
  plan,
  cell = 8,
}: {
  state: GameState;
  plan: SwitchGatePlan | null;
  cell?: number;
}) {
  const { tiles, subtypes } = state.mapData;
  const bedKeys = new Set((plan?.bed ?? []).map(([y, x]) => `${y},${x}`));
  const cellFor = (y: number, x: number): { bg: string; title: string } => {
    const subs = subtypes[y][x] ?? [];
    if (subs.includes(TileSubtype.PRESSURE_PLATE))
      return { bg: "#f472b6", title: "SWITCH (unthrown)" };
    if (subs.includes(TileSubtype.PRESSURE_PLATE_PRESSED))
      return { bg: "#9d174d", title: "switch (thrown)" };
    if (subs.includes(TileSubtype.SPIKES)) return { bg: "#e11d48", title: "SPIKE BED (shut)" };
    if (subs.includes(TileSubtype.SPIKE_HOLES))
      return { bg: "#7f1d1d", title: "spike holes (retracted)" };
    if (bedKeys.has(`${y},${x}`)) return { bg: "#fb7185", title: "bed (opened)" };
    if (subs.includes(TileSubtype.LAVA)) return { bg: "#ff5a1e", title: "lava" };
    if (subs.includes(TileSubtype.OBSIDIAN)) return { bg: "#4a3040", title: "obsidian" };
    if (subs.includes(TileSubtype.DEEP_WATER)) return { bg: "#1e4e7a", title: "deep water" };
    if (subs.includes(TileSubtype.SHALLOW_WATER))
      return { bg: "#4a7f9c", title: "shallow water" };
    if (subs.includes(TileSubtype.PLAYER)) return { bg: "#ffffff", title: "hero" };
    if (subs.includes(TileSubtype.EXIT)) return { bg: "#34d399", title: "exit" };
    if (subs.includes(TileSubtype.EXITKEY)) return { bg: "#fde047", title: "exit key" };
    if (subs.includes(TileSubtype.KEY)) return { bg: "#eab308", title: "chest key" };
    if (subs.includes(TileSubtype.CHEST)) return { bg: "#a16207", title: "chest" };
    if (subs.includes(TileSubtype.FAULTY_FLOOR)) return { bg: "#111111", title: "crack" };
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

function detourTone(detour: number): string {
  if (detour >= 10) return "text-emerald-300";
  if (detour >= 5) return "text-amber-300";
  return "text-red-300";
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
        Floor {fd.floor} {selected ? "◂ playing" : ""}
      </button>
      <div className="text-[11px] text-gray-300 text-center leading-tight">
        {fd.plan ? (
          <>
            {fd.plan.detour > 0 ? (
              <div className={detourTone(fd.plan.detour)}>
                detour <b>{fd.plan.detour}</b> steps
              </div>
            ) : (
              <div className="text-emerald-300">gated</div>
            )}
            <div className="mt-0.5">
              bed <b>{fd.plan.bed.length}</b> wide
              {fd.plan.throwDistance > 0 ? (
                <>
                  {" "}
                  · throw <b>{fd.plan.throwDistance}</b>
                </>
              ) : null}
            </div>
            <div className="text-gray-400">
              switch {fd.plan.plate[0]},{fd.plan.plate[1]}
            </div>
          </>
        ) : (
          <div className="text-gray-500">no gate on this floor</div>
        )}
      </div>
      <MiniMap state={fd.state} plan={fd.plan} cell={6} />
    </div>
  );
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

function TestSwitchDailyInner() {
  const [seed, setSeed] = useState<number>(() => randomSeed());
  const [access, setAccess] = useState<PlateAccess>("behind-bed");
  const [mode, setMode] = useState<GateMode>("every-floor");
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  const day = useMemo(() => buildDay(seed, access, mode), [seed, access, mode]);
  const selected = day[selectedFloor - 1];
  const cascade = mode === "daily-cascade";

  const reroll = () => {
    setOutcome("none");
    setSeed(randomSeed());
  };

  const gated = day.filter((f) => f.plan).length;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-4">
      <div className="text-center bg-black/70 rounded-lg p-3 w-full max-w-3xl">
        <h1 className="text-xl font-bold">Switch Gates on a Random Daily</h1>
        <p className="text-xs text-gray-300 mt-1">
          A real 3-floor generated daily with one spike bed + switch injected per floor. The
          bed is always a <b>shortcut, never a lock</b> — the exit, both keys and every chest
          stay reachable with it shut, so you can ignore it entirely and still win.
        </p>
        <p className="text-xs text-gray-300 mt-2">
          The switch sits on the <b>far</b> side of the spikes. Two ways through:{" "}
          <span className="text-amber-300">throw a rock over the bed</span> (spikes are a floor
          overlay, so rocks fly over and a rock landing on a switch holds it down), or{" "}
          <span className="text-sky-300">walk the long way round</span> and press it by boot.
          Spending the rock or spending the steps is the whole decision.
        </p>

        <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
          <button
            className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-sm font-bold"
            onClick={reroll}
          >
            Reroll (new random daily)
          </button>
          <span className="w-px bg-gray-600 mx-1 self-stretch" />
          <span className="text-xs text-gray-400 self-center">Mode:</span>
          <button
            className={`px-2 py-1 rounded text-sm ${
              mode === "every-floor"
                ? "bg-emerald-700 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            onClick={() => {
              setMode("every-floor");
              setOutcome("none");
            }}
          >
            every floor
          </button>
          <button
            className={`px-2 py-1 rounded text-sm ${
              mode === "daily-cascade"
                ? "bg-emerald-700 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            onClick={() => {
              setMode("daily-cascade");
              setOutcome("none");
            }}
          >
            daily cascade (real)
          </button>
          <span className="w-px bg-gray-600 mx-1 self-stretch" />
          <span className="text-xs text-gray-400 self-center">Switch access:</span>
          <button
            className={`px-2 py-1 rounded text-sm ${
              access === "behind-bed"
                ? "bg-sky-700 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            onClick={() => {
              setAccess("behind-bed");
              setOutcome("none");
            }}
          >
            behind the spikes
          </button>
          <button
            className={`px-2 py-1 rounded text-sm ${
              access === "open"
                ? "bg-sky-700 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            onClick={() => {
              setAccess("open");
              setOutcome("none");
            }}
          >
            on the path (control)
          </button>
        </div>

        <p className="text-xs text-gray-300 mt-2">
          seed <b>{seed}</b> · floors with a gate <b>{gated}/3</b> ·{" "}
          {cascade
            ? `real rule: F1 ${Math.round(SWITCH_GATE_FLOOR_CHANCE * 100)}%, then F2 ${Math.round(
                SWITCH_GATE_FLOOR_CHANCE * 100
              )}%, then F3 takes what is left`
            : "forcing one onto every floor — not shippable, just faster to judge"}
        </p>
        <p className="text-xs text-gray-300 mt-1">
          {access === "behind-bed"
            ? "switch behind the spikes: rock throw or long walk"
            : "switch on the path: just walk over it — the “second key with extra steps” version"}
          {cascade ? " (access applies in every-floor mode only)" : ""}
        </p>
        <p className="text-[11px] text-gray-500 mt-1">
          <b>detour</b> = extra steps the shut bed adds to the longest route the run needs. Low
          means this floor had nothing worth gating.
          {cascade ? " Not recorded on the game state, so it reads 0 in cascade mode." : ""}
        </p>
      </div>

      <div className="flex gap-3 flex-wrap justify-center max-w-full overflow-x-auto">
        {day.map((fd) => (
          <FloorColumn
            key={fd.floor}
            fd={fd}
            selected={fd.floor === selectedFloor}
            onSelect={() => {
              setSelectedFloor(fd.floor);
              setOutcome("none");
            }}
          />
        ))}
      </div>

      {outcome === "lost" && (
        <div className="bg-red-900/90 rounded-lg px-4 py-2 text-sm font-bold">
          You died. Reroll, or pick another floor.
        </div>
      )}
      {outcome === "won" && (
        <div className="bg-green-900/90 rounded-lg px-4 py-2 text-sm font-bold">
          Floor cleared.
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-gray-300">
          Playing floor {selectedFloor}
          {selected.plan
            ? ` — bed at ${selected.plan.bed
                .map(([y, x]) => `${y},${x}`)
                .join(" ")}, switch at ${selected.plan.plate[0]},${selected.plan.plate[1]}`
            : " — no gate here"}
        </div>
        <TilemapGrid
          key={`${seed}-${access}-${selectedFloor}`}
          tileTypes={tileTypes}
          initialGameState={{
            ...selected.state,
            playerDirection: Direction.DOWN,
            mode: "normal",
          }}
          storageSlot="test"
          onWin={() => setOutcome("won")}
          onDeath={() => setOutcome("lost")}
        />
      </div>
    </div>
  );
}

export default function TestSwitchDailyPage() {
  return (
    <Suspense fallback={null}>
      <TestSwitchDailyInner />
    </Suspense>
  );
}
