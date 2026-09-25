"use client";

// Harness for the open-abyss pit (.abyssPit in components/Tile.module.css): a room of
// cracked floors that can be flipped open, so the crack and the hole it breaks into can
// be compared at many rotations (each tile's rotation comes from its position). Pressing
// "Break open" remounts the grid with every crack opened, which replays the real break
// animation. Includes a pit with a wall below (its bottom is covered by the wall's top
// face) and pits against side walls. ?open=1&floor=classic&light=0 set the initial state.

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TilemapGrid } from "../../components/TilemapGrid";
import { Direction, TileSubtype, tileTypes, type GameState } from "../../lib/map";
import type { FloorStyle } from "../../lib/floor_sheet";

const FLOOR = 0;
const WALL = 1;
const W = 14;
const H = 10;

// Cracks: two rows across the room at every column, plus a few against walls. Row 7's
// crack at column 6 has a wall directly below it.
const CRACKS: Array<[number, number]> = [
  ...Array.from({ length: 10 }, (_, i) => [2, i + 2] as [number, number]),
  ...Array.from({ length: 10 }, (_, i) => [4, i + 2] as [number, number]),
  [7, 1],
  [7, 6],
  [7, 12],
  [6, 9],
];

function buildRoom(open: boolean): GameState {
  const tiles: number[][] = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (y === 0 || x === 0 || y === H - 1 || x === W - 1 ? WALL : FLOOR))
  );
  // A stub of wall under one crack, so its pit meets a wall's top face.
  tiles[8][5] = WALL;
  tiles[8][6] = WALL;
  tiles[8][7] = WALL;
  const subtypes: number[][][] = tiles.map((row) => row.map(() => [] as number[]));
  for (const [y, x] of CRACKS) {
    subtypes[y][x] = [open ? TileSubtype.OPEN_ABYSS : TileSubtype.FAULTY_FLOOR];
  }
  subtypes[6][2] = [TileSubtype.PLAYER];

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: true,
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 0,
    runeCount: 0,
    bombCount: 0,
    foodCount: 0,
    potionCount: 0,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
  };
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

function TestAbyssPitInner() {
  const params = useSearchParams();
  const [open, setOpen] = useState(() => params.get("open") === "1");
  const [style, setStyle] = useState<FloorStyle>(() =>
    params.get("floor") === "classic" ? "classic" : "generated"
  );
  const [fullLight, setFullLight] = useState(() => params.get("light") !== "0");
  // Bumped by "Break open" so the grid remounts and the break animation replays.
  const [breakCount, setBreakCount] = useState(0);
  const state = useMemo(() => buildRoom(open), [open]);

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
        <button style={buttonStyle(!open)} onClick={() => setOpen(false)}>
          Cracked
        </button>
        <button
          style={buttonStyle(open)}
          onClick={() => {
            setOpen(true);
            setBreakCount((n) => n + 1);
          }}
        >
          Break open
        </button>
        <span style={{ color: "#666" }}>|</span>
        <button style={buttonStyle(style === "generated")} onClick={() => setStyle("generated")}>
          Generated floor
        </button>
        <button style={buttonStyle(style === "classic")} onClick={() => setStyle("classic")}>
          Classic floor
        </button>
        <span style={{ color: "#666" }}>|</span>
        <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={fullLight} onChange={(e) => setFullLight(e.target.checked)} />
          Full light
        </label>
      </div>

      <div style={{ paddingTop: "48px" }}>
        <TilemapGrid
          key={`${open}-${breakCount}-${fullLight}`}
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

export default function TestAbyssPitPage() {
  return (
    <Suspense fallback={<div style={{ color: "#fff", padding: 40 }}>Loading...</div>}>
      <TestAbyssPitInner />
    </Suspense>
  );
}
