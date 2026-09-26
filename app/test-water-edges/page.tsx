"use client";

// A/B harness for the terrain sheets (lib/terrain_sheet.ts): water and lava drawn as one
// map-sized image per floor with organic edges, against the classic per-tile textures,
// flipped in place (button or C), with every shape knob on a slider ("Copy settings" puts
// them on the clipboard as JSON, ready to paste back as new defaults). "Edge cases" is a hand-built room covering the shapes
// that are hard to get right: a lake with a shallow ring and a deep core, lone tiles,
// diagonal pairs, water squeezed between walls, deep water meeting the shore directly, a
// stepping stone, and a lava pool with an obsidian slab. The daily floors show real
// generated water (it lands on roughly half of F2/F3 days). Real runs use the sheets by
// default; `?terrain=classic` on /daily-new or /endless brings back the old tiles.

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TilemapGrid } from "../../components/TilemapGrid";
import { TileSubtype, tileTypes } from "../../lib/map";
import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import {
  DEFAULT_TERRAIN_SHAPE,
  type TerrainShapeConfig,
  type TerrainStyle,
} from "../../lib/terrain_sheet";

type MapChoice = "edges" | "daily-2" | "daily-3";

type NumericShapeKey = Exclude<keyof TerrainShapeConfig, "waterStyle">;

const SLIDERS: Array<{
  key: NumericShapeKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  section?: string;
}> = [
  { key: "cornerPx", label: "Corner rounding", min: 0.5, max: 16, step: 0.5, hint: "px a convex corner rounds over (16 = half a tile)", section: "Shoreline (32 px = 1 tile)" },
  { key: "wobblePx", label: "Shore wobble", min: 0, max: 6, step: 0.1, hint: "px the shore can drift off the tile edge" },
  { key: "wobbleTiles", label: "Wobble length", min: 0.3, max: 6, step: 0.1, hint: "tiles per drift: longer = smoother lines" },
  { key: "deepWobblePx", label: "Deep edge wobble", min: 0, max: 6, step: 0.1, hint: "px the shallow/deep boundary drifts" },
  { key: "ledgePx", label: "Ledge width", min: 0, max: 4, step: 1, hint: "px of stepped ledge each side of the drop-off", section: "Details" },
  { key: "bankPx", label: "Bank shadow", min: 0, max: 8, step: 1, hint: "px of shadow on the water below its top shore / a wall" },
  { key: "bank", label: "Bank darkness", min: 0, max: 0.8, step: 0.05, hint: "shadow strength at the shore" },
  { key: "foamPx", label: "Rim width", min: 0, max: 3, step: 1, hint: "px of lighter rim at the waterline" },
  { key: "foam", label: "Rim strength", min: 0, max: 1, step: 0.05, hint: "0 = none (a still pool doesn't foam)" },
  { key: "wetPx", label: "Damp margin", min: 0, max: 6, step: 1, hint: "px of wet floor outside the water" },
  { key: "lavaCornerPx", label: "Lava corner rounding", min: 1, max: 16, step: 0.5, hint: "px (16 = half a tile, fully rounded)", section: "Lava" },
  { key: "lavaWobble", label: "Lava edge wobble", min: 0, max: 0.45, step: 0.01, hint: "how far lava's soft edge wanders" },
  { key: "heatPx", label: "Lava heat glow", min: 0, max: 12, step: 1, hint: "px of glow on the floor around lava" },
];

// . floor  # wall  s shallow  d deep  t stepping stone  L lava  O obsidian  @ hero
const EDGE_CASES = [
  "####################",
  "#..................#",
  "#..sss.....s.......#",
  "#.sdddss...........#",
  "#.sdddds...s.s.....#",
  "#.ssddss....s......#",
  "#..sssts...........#",
  "#...............@..#",
  "#..ss.....LLL......#",
  "#.#ss#....LOLL..L..#",
  "#..dd..............#",
  "#..ss....sddds.....#",
  "#........sdddds....#",
  "#.........ssss.....#",
  "####################",
];

const CELL_SUBTYPES: Record<string, number[]> = {
  s: [TileSubtype.SHALLOW_WATER],
  d: [TileSubtype.DEEP_WATER],
  t: [TileSubtype.STEPPING_STONE],
  L: [TileSubtype.LAVA],
  O: [TileSubtype.OBSIDIAN],
  "@": [TileSubtype.PLAYER],
};

function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA");
}

function buildFloor(dateStr: string, floor: number): GameState {
  const seed = hashStringToSeed(dateStr);
  let gs = withPatchedMathRandom(mulberry32(seed), () => initializeGameStateForMultiTier(1));
  for (let i = 1; i < floor; i++) gs = advanceToNextFloor(gs, seed);
  return gs;
}

// The edge-case room, borrowing everything but the map from a real floor 1 (no enemies:
// this page is for looking at the shoreline, not fighting on it).
function buildEdgeCases(dateStr: string): GameState {
  const base = buildFloor(dateStr, 1);
  const tiles = EDGE_CASES.map((line) => [...line].map((ch) => (ch === "#" ? 1 : 0)));
  const subtypes = EDGE_CASES.map((line) => [...line].map((ch) => [...(CELL_SUBTYPES[ch] ?? [])]));
  return {
    ...base,
    mapData: { tiles, subtypes, environment: "cave" },
    enemies: [],
    npcs: [],
  };
}

const buttonStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "#23506b" : "#222",
  color: "#fff",
  border: `1px solid ${active ? "#6fb1d6" : "#555"}`,
  padding: "3px 10px",
  cursor: "pointer",
  fontSize: "12px",
  fontFamily: "monospace",
});

const MAP_LABELS: Record<MapChoice, string> = {
  edges: "Edge cases",
  "daily-2": "Daily F2",
  "daily-3": "Daily F3",
};

function TestWaterEdgesInner() {
  // ?map=daily-3&date=2026-09-20&terrain=classic pre-selects a comparison.
  const params = useSearchParams();
  const [map, setMap] = useState<MapChoice>(() => {
    const m = params.get("map") as MapChoice | null;
    return m && m in MAP_LABELS ? m : "edges";
  });
  const [date, setDate] = useState(() => params.get("date") ?? todayDateStr());
  const [terrain, setTerrain] = useState<TerrainStyle>(() =>
    params.get("terrain") === "classic" ? "classic" : "sheet"
  );
  const [run, setRun] = useState(0);
  const [shape, setShape] = useState<TerrainShapeConfig>(DEFAULT_TERRAIN_SHAPE);
  const [panelOpen, setPanelOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const changed = (Object.keys(DEFAULT_TERRAIN_SHAPE) as Array<keyof TerrainShapeConfig>).filter(
    (k) => shape[k] !== DEFAULT_TERRAIN_SHAPE[k]
  );
  const copySettings = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(shape, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "c" || e.key === "C") setTerrain((v) => (v === "sheet" ? "classic" : "sheet"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const state = useMemo(
    () => (map === "edges" ? buildEdgeCases(date) : buildFloor(date, Number(map.slice(-1)))),
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
          background: "rgba(0,0,0,0.88)",
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
        <button
          style={{ ...buttonStyle(terrain === "sheet"), fontWeight: "bold" }}
          onClick={(e) => {
            setTerrain((v) => (v === "sheet" ? "classic" : "sheet"));
            e.currentTarget.blur();
          }}
        >
          Terrain: {terrain === "sheet" ? "SHEET (new)" : "CLASSIC"} (C)
        </button>
        <span style={{ color: "#666" }}>|</span>
        <span>Water:</span>
        {(["texture", "procedural"] as const).map((ws) => (
          <button
            key={ws}
            style={buttonStyle(shape.waterStyle === ws)}
            onClick={(e) => {
              setShape((c) => ({ ...c, waterStyle: ws }));
              e.currentTarget.blur();
            }}
          >
            {ws === "texture" ? "Textured" : "Procedural"}
          </button>
        ))}
        <span style={{ color: "#666" }}>|</span>
        {(Object.keys(MAP_LABELS) as MapChoice[]).map((m) => (
          <button key={m} style={buttonStyle(map === m)} onClick={() => setMap(m)}>
            {MAP_LABELS[m]}
          </button>
        ))}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ background: "#222", color: "#fff", border: "1px solid #555", padding: "1px 4px", fontSize: "12px" }}
        />
        <span style={{ color: "#777", fontSize: "11px" }}>
          Daily water lands on about half of F2/F3 days; try a few dates.
        </span>
      </div>

      {/* Shape knobs */}
      <div
        style={{
          position: "fixed",
          top: 44,
          right: 8,
          zIndex: 99999,
          width: panelOpen ? 270 : "auto",
          maxHeight: "calc(100vh - 56px)",
          overflowY: "auto",
          background: "rgba(0,0,0,0.85)",
          border: "1px solid #444",
          padding: "8px 10px",
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#ddd",
        }}
      >
        <button style={buttonStyle(false)} onClick={() => setPanelOpen((v) => !v)}>
          {panelOpen ? "Hide knobs" : "Knobs"}
        </button>
        {panelOpen && (
          <>
            {SLIDERS.map((sl) => (
              <div key={sl.key} style={{ marginTop: 8, opacity: terrain === "sheet" ? 1 : 0.45 }}>
                {sl.section && (
                  <div style={{ margin: "10px 0 6px", color: "#6fb1d6", borderTop: "1px solid #444", paddingTop: 8 }}>
                    {sl.section}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: shape[sl.key] !== DEFAULT_TERRAIN_SHAPE[sl.key] ? "#8fd0f0" : "#fff" }}>
                    {sl.label}
                  </span>
                  <span>{shape[sl.key]}</span>
                </div>
                <input
                  type="range"
                  min={sl.min}
                  max={sl.max}
                  step={sl.step}
                  value={shape[sl.key]}
                  onChange={(e) => setShape((c) => ({ ...c, [sl.key]: Number(e.target.value) }))}
                  // Release focus so arrow keys go back to walking the hero.
                  onPointerUp={(e) => e.currentTarget.blur()}
                  style={{ width: "100%" }}
                />
                <div style={{ color: "#888" }}>{sl.hint}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button style={buttonStyle(false)} onClick={() => setShape(DEFAULT_TERRAIN_SHAPE)}>
                Reset
              </button>
              <button style={buttonStyle(copied)} onClick={copySettings}>
                {copied ? "Copied" : "Copy settings"}
              </button>
            </div>
            <div style={{ color: "#888", marginTop: 6 }}>
              {changed.length === 0 ? "All defaults" : `Changed: ${changed.join(", ")}`}
            </div>
          </>
        )}
      </div>

      <div style={{ paddingTop: "48px" }}>
        <TilemapGrid
          key={`${date}-${map}-${run}`}
          tileTypes={tileTypes}
          initialGameState={state}
          storageSlot="test"
          terrainStyle={terrain}
          terrainShape={shape}
          onWin={() => setRun((r) => r + 1)}
          onDeath={() => setRun((r) => r + 1)}
        />
      </div>
    </>
  );
}

export default function TestWaterEdgesPage() {
  return (
    <Suspense fallback={<div style={{ color: "#fff", padding: 40 }}>Loading...</div>}>
      <TestWaterEdgesInner />
    </Suspense>
  );
}
