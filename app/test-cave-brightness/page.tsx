"use client";

import React, { Suspense, useCallback, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";

function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA");
}

function buildFloor(dateStr: string, floor: number): GameState {
  const seed = hashStringToSeed(dateStr);
  let gs = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1)
  );
  for (let i = 1; i < floor; i++) {
    gs = advanceToNextFloor(gs, seed);
  }
  return { ...gs, showFullMap: true };
}

function TestCaveBrightnessInner() {
  const [date, setDate] = useState(todayDateStr);
  const [floor, setFloor] = useState(1);
  const [brightness, setBrightness] = useState(1.7);
  const [resetCount, setResetCount] = useState(0);

  const state = useMemo(() => buildFloor(date, floor), [date, floor, resetCount]);

  const applyBrightness = useCallback((val: number) => {
    setBrightness(val);
    const grid = document.querySelector(".cave-env") as HTMLElement | null;
    if (grid) {
      grid.style.setProperty("--cave-brightness", String(val));
    }
  }, []);

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff" }}>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          background: "rgba(0,0,0,0.85)",
          padding: "12px 16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "16px",
          fontFamily: "monospace",
          fontSize: "14px",
        }}
      >
        <label>
          Date:{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setResetCount((c) => c + 1); }}
            style={{ background: "#222", color: "#fff", border: "1px solid #555", padding: "2px 6px" }}
          />
        </label>

        <label>
          Floor:{" "}
          <select
            value={floor}
            onChange={(e) => { setFloor(Number(e.target.value)); setResetCount((c) => c + 1); }}
            style={{ background: "#222", color: "#fff", border: "1px solid #555", padding: "2px 6px" }}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 300px" }}>
          Brightness:
          <input
            type="range"
            min="0.8"
            max="1.8"
            step="0.01"
            value={brightness}
            onChange={(e) => applyBrightness(Number(e.target.value))}
            style={{ flex: 1, minWidth: "120px" }}
          />
          <span style={{ minWidth: "3ch" }}>{brightness.toFixed(2)}</span>
        </label>

        <button
          onClick={() => applyBrightness(1.0)}
          style={{ background: "#333", color: "#fff", border: "1px solid #555", padding: "4px 10px", cursor: "pointer" }}
        >
          1.00 (original)
        </button>
        <button
          onClick={() => applyBrightness(1.7)}
          style={{ background: "#333", color: "#fff", border: "1px solid #555", padding: "4px 10px", cursor: "pointer" }}
        >
          1.70 (default)
        </button>
      </div>

      <div style={{ paddingTop: "60px" }}>
        <TilemapGrid
          key={`${date}-${floor}-${resetCount}`}
          tileTypes={tileTypes}
          initialGameState={state}
          forceDaylight={true}
          storageSlot="test"
        />
      </div>
    </div>
  );
}

export default function TestCaveBrightnessPage() {
  return (
    <Suspense fallback={<div style={{ color: "#fff", padding: 40 }}>Loading...</div>}>
      <TestCaveBrightnessInner />
    </Suspense>
  );
}
