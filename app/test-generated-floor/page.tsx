"use client";

// A/B harness for the generated floor sheets (lib/floor_sheet.ts): the same real daily
// floor (or the outdoor grassland, or the pink realm) drawn with the classic single tiles
// or the generated sheet, flipped in place so the difference is easy to see. Real runs
// draw the generated floor by default; `?floor=classic` on /daily or /endless shows the
// old tiles.

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TilemapGrid } from "../../components/TilemapGrid";
import { Direction, TileSubtype, tileTypes } from "../../lib/map";
import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { buildOutsideWorld } from "../../lib/map/outside-world";
import { buildPinkRealm } from "../../lib/map/pink-realm";
import { findPlayerPosition } from "../../lib/map/player";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import type { FloorStyle } from "../../lib/floor_sheet";

type MapChoice = "cave-1" | "cave-2" | "cave-3" | "outdoor" | "pink";

function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA");
}

function buildFloor(dateStr: string, floor: number): GameState {
  const seed = hashStringToSeed(dateStr);
  let gs = withPatchedMathRandom(mulberry32(seed), () => initializeGameStateForMultiTier(1));
  for (let i = 1; i < floor; i++) gs = advanceToNextFloor(gs, seed);
  return gs;
}

// The grassland past a bombed outer wall, without its stone goblins: this page is for
// looking at the ground, not fighting on it.
function buildOutdoor(dateStr: string): GameState {
  const base = buildFloor(dateStr, 1);
  const height = base.mapData.tiles.length;
  const width = base.mapData.tiles[0].length;
  const { mapData, entry } = buildOutsideWorld(Direction.UP, width, height);
  const subtypes = mapData.subtypes.map((row) => row.map((cell) => [...cell]));
  subtypes[entry[0]][entry[1]].push(TileSubtype.PLAYER);
  return {
    ...base,
    mapData: { ...mapData, subtypes },
    enemies: [],
    npcs: [],
    inOutsideWorld: true,
    outsideDirection: Direction.UP,
  };
}

// The pink realm mirrors whatever floor it's entered from; floor 2 gives it rooms to show.
// Its prizes stay, its goblins don't.
function buildPink(dateStr: string): GameState {
  const base = buildFloor(dateStr, 2);
  const { mapData, entry } = buildPinkRealm(base.mapData, findPlayerPosition(base.mapData) ?? [1, 1]);
  const subtypes = mapData.subtypes.map((row) => row.map((cell) => [...cell]));
  subtypes[entry[0]][entry[1]].push(TileSubtype.PLAYER);
  return { ...base, mapData: { ...mapData, subtypes }, enemies: [], npcs: [] };
}

const buttonStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "#4c6f3a" : "#222",
  color: "#fff",
  border: `1px solid ${active ? "#8fbf6a" : "#555"}`,
  padding: "3px 10px",
  cursor: "pointer",
  fontSize: "12px",
  fontFamily: "monospace",
});

const MAP_CHOICES: MapChoice[] = ["cave-1", "cave-2", "cave-3", "outdoor", "pink"];
const MAP_LABELS: Record<MapChoice, string> = {
  "cave-1": "Cave F1",
  "cave-2": "Cave F2",
  "cave-3": "Cave F3",
  outdoor: "Outdoor grass",
  pink: "Pink realm",
};

function TestGeneratedFloorInner() {
  // Initial settings can come from the URL (?map=outdoor&style=classic&date=2026-09-24&light=0)
  // so a particular comparison can be linked to.
  const params = useSearchParams();
  const [style, setStyle] = useState<FloorStyle>(() =>
    params.get("style") === "classic" ? "classic" : "generated"
  );
  const [map, setMap] = useState<MapChoice>(() => {
    const m = params.get("map") as MapChoice | null;
    return m && MAP_CHOICES.includes(m) ? m : "cave-1";
  });
  const [date, setDate] = useState(() => params.get("date") ?? todayDateStr());
  const [fullLight, setFullLight] = useState(() => params.get("light") !== "0");

  const state = useMemo(
    () =>
      map === "outdoor"
        ? buildOutdoor(date)
        : map === "pink"
        ? buildPink(date)
        : buildFloor(date, Number(map.slice(-1))),
    [date, map]
  );

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          background: "rgba(0,0,0,0.9)",
          padding: "8px 16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px",
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#fff",
        }}
      >
        <span>Floor art:</span>
        <button style={buttonStyle(style === "classic")} onClick={() => setStyle("classic")}>
          Classic tiles
        </button>
        <button style={buttonStyle(style === "generated")} onClick={() => setStyle("generated")}>
          Generated sheet
        </button>

        <span style={{ color: "#666" }}>|</span>

        {MAP_CHOICES.map((m) => (
          <button key={m} style={buttonStyle(map === m)} onClick={() => setMap(m)}>
            {MAP_LABELS[m]}
          </button>
        ))}

        <span style={{ color: "#666" }}>|</span>

        <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={fullLight} onChange={(e) => setFullLight(e.target.checked)} />
          Full light
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ background: "#222", color: "#fff", border: "1px solid #555", padding: "1px 4px", fontSize: "12px" }}
        />
        <span style={{ color: "#777", fontSize: "11px" }}>Real runs: generated by default, ?floor=classic for the old tiles</span>
      </div>

      <div style={{ paddingTop: "48px" }}>
        <TilemapGrid
          key={`${date}-${map}-${fullLight}`}
          tileTypes={tileTypes}
          initialGameState={state}
          storageSlot="test"
          forceDaylight={fullLight}
          floorStyle={style}
        />
      </div>
    </>
  );
}

export default function TestGeneratedFloorPage() {
  return (
    <Suspense fallback={<div style={{ color: "#fff", padding: 40 }}>Loading...</div>}>
      <TestGeneratedFloorInner />
    </Suspense>
  );
}
