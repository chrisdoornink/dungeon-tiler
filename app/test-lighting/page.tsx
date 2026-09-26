"use client";

// Tuning harness for the torchlight light pass (lib/light_pass.ts): a real daily cave floor
// you can walk around, with the pass flipped on and off in place (button or the L key),
// every knob on a slider, and the three page backdrops. "Copy settings" puts the current
// knobs on the clipboard as JSON, ready to paste back as new defaults. Real runs have the
// pass on by default (`?light=0` opts out and persists; `?light=1` opts back in), plus
// `?bg=classic|dark|distant` for the backdrop.

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TilemapGrid } from "../../components/TilemapGrid";
import { LightPassBackdrop } from "../../components/LightPassLayers";
import { tileTypes } from "../../lib/map";
import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";
import { assetUrl } from "../../lib/asset_url";
import {
  DEFAULT_LIGHT_PASS,
  LIGHT_BACKDROPS,
  type LightBackdrop,
  type LightPassConfig,
} from "../../lib/light_pass";

type NumericKey = Exclude<keyof LightPassConfig, "flicker">;

const SLIDERS: Array<{
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  section?: string;
}> = [
  { key: "ambient", label: "Ambient", min: 0.25, max: 1, step: 0.01, hint: "far-field brightness (1 = no falloff)" },
  { key: "coolness", label: "Coolness", min: 0, max: 2, step: 0.05, hint: "how blue-green the dark leans" },
  { key: "heroRadius", label: "Torch reach", min: 2, max: 14, step: 0.25, hint: "tiles until the hero's light fades" },
  { key: "heroWarmth", label: "Torch warmth", min: 0, max: 1, step: 0.01, hint: "amber soft-light pool" },
  { key: "heroGlow", label: "Torch glow", min: 0, max: 0.6, step: 0.01, hint: "hot core at the flame" },
  { key: "wallRadius", label: "Sconce reach", min: 0.5, max: 5, step: 0.1, hint: "tiles a wall torch lights" },
  { key: "wallWarmth", label: "Sconce warmth", min: 0, max: 1, step: 0.01, hint: "wall torch pool" },
  { key: "actorCeiling", label: "Actor highlights", min: 0.4, max: 1, step: 0.01, hint: "brightest a sprite may get (1 = off)" },
  { key: "actorSaturation", label: "Actor saturation", min: 0.3, max: 1.2, step: 0.01, hint: "1 = unchanged" },
  { key: "shadows", label: "Contact shadows", min: 0, max: 1, step: 0.01, hint: "0 = none" },
  { key: "darkAmbient", label: "Dark ambient", min: 0, max: 0.3, step: 0.01, hint: "unlit floor with the torch out (0 = black)", section: "Torch out (K toggles the torch)" },
  { key: "darkHeroRadius", label: "Hero glow reach", min: 1, max: 4, step: 0.1, hint: "tiles of the snuffed hero's own glow" },
  { key: "darkHeroLevel", label: "Hero glow level", min: 0.2, max: 1, step: 0.01, hint: "brightness at his feet" },
  { key: "darkWallRadius", label: "Dark sconce reach", min: 1, max: 6, step: 0.1, hint: "tiles a wall torch lights in the dark" },
];

const FLOORS = [1, 2, 3] as const;
const BACKDROP_LABELS: Record<LightBackdrop, string> = {
  classic: "Classic brick",
  dark: "A: dark glow",
  distant: "B: distant brick",
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

const buttonStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "#6b4a22" : "#222",
  color: "#fff",
  border: `1px solid ${active ? "#d9a15a" : "#555"}`,
  padding: "3px 10px",
  cursor: "pointer",
  fontSize: "12px",
  fontFamily: "monospace",
});

function TestLightingInner() {
  // ?floor=3&date=2026-09-25&bg=distant&light=0 pre-selects a comparison.
  const params = useSearchParams();
  const [floor, setFloor] = useState<number>(() => {
    const f = Number(params.get("floor"));
    return FLOORS.includes(f as 1 | 2 | 3) ? f : 3;
  });
  const [date, setDate] = useState(() => params.get("date") ?? todayDateStr());
  const [lightOn, setLightOn] = useState(() => params.get("light") !== "0");
  // The torch changes live through TilemapGrid's externalAction, so the snuff/relight
  // transition plays instead of the floor remounting. The action SETS the wanted state
  // rather than toggling: a remounted grid (new floor, restart) replays the latest action,
  // and replaying a toggle would flip the torch behind your back.
  const [torchAction, setTorchAction] = useState<{
    seq: number;
    lit: boolean;
    apply: (s: GameState) => GameState;
  }>({ seq: 0, lit: true, apply: (s) => s });
  const toggleTorch = () =>
    setTorchAction((a) => {
      const lit = !a.lit;
      return { seq: a.seq + 1, lit, apply: (s) => ({ ...s, heroTorchLit: lit }) };
    });
  const [backdrop, setBackdrop] = useState<LightBackdrop>(() => {
    const b = params.get("bg") as LightBackdrop | null;
    return b && LIGHT_BACKDROPS.includes(b) ? b : "dark";
  });
  const [config, setConfig] = useState<LightPassConfig>(DEFAULT_LIGHT_PASS);
  const [panelOpen, setPanelOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  // Bumped on a win or a death so the floor restarts in place instead of the default
  // non-daily redirect to /end.
  const [run, setRun] = useState(0);

  // L flips the pass in place, the quickest way to see what it changes. Arrow keys still
  // belong to the game (sliders blur themselves on release so they don't eat them).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "l" || e.key === "L") setLightOn((v) => !v);
      if (e.key === "k" || e.key === "K") toggleTorch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const state = useMemo(() => buildFloor(date, floor), [date, floor]);

  const changed = (Object.keys(DEFAULT_LIGHT_PASS) as Array<keyof LightPassConfig>).filter(
    (k) => config[k] !== DEFAULT_LIGHT_PASS[k]
  );

  const copySettings = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ ...config, backdrop }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  // The page mirrors GameView's wrapper so the backdrop sits where it does in a real run.
  const showBackdrop = lightOn ? backdrop : "classic";

  return (
    <div
      className="min-h-screen flex flex-col items-center p-4 max-[600px]:p-2 text-white relative"
      style={
        showBackdrop === "classic"
          ? {
              backgroundImage: `url(${assetUrl("/images/presentational/wall-up-close.png")})`,
              backgroundRepeat: "repeat",
              backgroundSize: "auto",
            }
          : undefined
      }
    >
      {showBackdrop === "classic" ? (
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      ) : (
        <LightPassBackdrop kind={showBackdrop} />
      )}

      {/* Top bar: what to look at */}
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
          style={{ ...buttonStyle(lightOn), fontWeight: "bold" }}
          onClick={(e) => {
            setLightOn((v) => !v);
            e.currentTarget.blur();
          }}
        >
          Light pass: {lightOn ? "ON" : "OFF"} (L)
        </button>
        <span style={{ color: "#666" }}>|</span>
        {FLOORS.map((f) => (
          <button key={f} style={buttonStyle(floor === f)} onClick={() => setFloor(f)}>
            Cave F{f}
          </button>
        ))}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ background: "#222", color: "#fff", border: "1px solid #555", padding: "1px 4px", fontSize: "12px" }}
        />
        <button
          style={buttonStyle(false)}
          onClick={(e) => {
            toggleTorch();
            e.currentTarget.blur();
          }}
        >
          Douse / relight torch (K)
        </button>
        <span style={{ color: "#666" }}>|</span>
        {LIGHT_BACKDROPS.map((b) => (
          <button key={b} style={buttonStyle(backdrop === b)} onClick={() => setBackdrop(b)}>
            {BACKDROP_LABELS[b]}
          </button>
        ))}
      </div>

      {/* Knobs */}
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
            {SLIDERS.map((s) => (
              <div key={s.key} style={{ marginTop: 8, opacity: lightOn ? 1 : 0.45 }}>
                {s.section && (
                  <div style={{ margin: "14px 0 6px", color: "#d9a15a", borderTop: "1px solid #444", paddingTop: 8 }}>
                    {s.section}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: config[s.key] !== DEFAULT_LIGHT_PASS[s.key] ? "#f0c070" : "#fff" }}>
                    {s.label}
                  </span>
                  <span>{config[s.key].toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={config[s.key]}
                  onChange={(e) => setConfig((c) => ({ ...c, [s.key]: Number(e.target.value) }))}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  style={{ width: "100%" }}
                />
                <div style={{ color: "#888" }}>{s.hint}</div>
              </div>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: 8 }}>
              <input
                type="checkbox"
                checked={config.flicker}
                onChange={(e) => setConfig((c) => ({ ...c, flicker: e.target.checked }))}
              />
              Flicker
            </label>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button style={buttonStyle(false)} onClick={() => setConfig(DEFAULT_LIGHT_PASS)}>
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

      <div className="relative z-10" style={{ paddingTop: "44px" }}>
        <TilemapGrid
          key={`${date}-${floor}-${run}`}
          tileTypes={tileTypes}
          initialGameState={state}
          storageSlot="test"
          lightPass={lightOn ? config : false}
          externalAction={torchAction}
          onWin={() => setRun((r) => r + 1)}
          onDeath={() => setRun((r) => r + 1)}
        />
      </div>
    </div>
  );
}

export default function TestLightingPage() {
  return (
    <Suspense fallback={<div style={{ color: "#fff", padding: 40 }}>Loading...</div>}>
      <TestLightingInner />
    </Suspense>
  );
}
