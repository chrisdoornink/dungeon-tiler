"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, type GameState } from "../../lib/map";
import { initializeGameStateForMultiTier, advanceToNextFloor } from "../../lib/map/game-state";
import { stampCipherRoom } from "../../lib/map/cipher_room";
import { mulberry32, withPatchedMathRandom, hashStringToSeed } from "../../lib/rng";
import { toggleStateColor } from "../../lib/map/machinery";
import { ColorGlyph } from "../../components/ColorGlyph";
import { TileSubtype } from "../../lib/map/constants";
import type { ColorLock } from "../../lib/map/types";

/**
 * Bench for stampCipherRoom: the mural cipher puzzle DISTRIBUTED into a real generated L2/L3 floor —
 * staggered switches, a gated loose-item reward, and the mural placed ~11 tiles away so it is offscreen
 * from the switches. The fog is left on so the mural and switches are never on screen together (the
 * memory challenge). The mini-map is a debug overview of where everything landed.
 *
 * URL: ?floor=2|3  ?seed=NNN. Enemies are stripped so placement/navigation can be judged calmly.
 */
const CIPHER_SALT = 0xc1_5e; // separate stamp stream (a real live integration would salt off the date)

type Built = { state: GameState; lock: ColorLock; seed: number };

function build(seed: number, floor: number): Built | null {
  const f1 = withPatchedMathRandom(mulberry32(seed), () => initializeGameStateForMultiTier(1));
  let s = f1;
  for (let i = 2; i <= floor; i++) s = advanceToNextFloor(s, seed);
  const lock = stampCipherRoom(s.mapData, mulberry32(seed ^ CIPHER_SALT));
  if (!lock) return null;
  const state: GameState = {
    ...s,
    colorLocks: [lock],
    enemies: [],
    hasSword: true,
    hasShield: true,
    heroHealth: 12,
    heroMaxHealth: 12,
    heroTorchLit: true,
    showFullMap: false, // fog on — the mural is meant to be offscreen from the switches
    mode: "normal",
  };
  return { state, lock, seed };
}

function findSeed(from: number, floor: number): number {
  for (let s = from; s < from + 600; s++) if (build(s, floor)) return s;
  return from;
}

function MiniMap({ state, lock }: { state: GameState; lock: ColorLock }) {
  const { tiles, subtypes } = state.mapData;
  const sw = new Map<string, number>();
  lock.switches.forEach(([y, x], i) => sw.set(`${y},${x}`, (lock.target ?? [])[i] ?? 0));
  const mural = new Set((lock.mural?.tiles ?? []).map(([y, x]) => `${y},${x}`));
  const cell = (y: number, x: number): string => {
    const subs = subtypes[y][x] ?? [];
    if (sw.has(`${y},${x}`)) return toggleStateColor(sw.get(`${y},${x}`)!);
    if (mural.has(`${y},${x}`)) return "#e9c46a"; // mural = gold
    if (subs.includes(TileSubtype.SPIKES)) return "#7f1d1d"; // gate
    if (subs.includes(TileSubtype.EXTRA_HEART) || subs.includes(TileSubtype.BOMB)) return "#ec4899"; // reward
    if (subs.includes(TileSubtype.PLAYER)) return "#ffffff";
    if (subs.includes(TileSubtype.EXITKEY)) return "#fde047";
    if (subs.includes(TileSubtype.EXIT)) return "#34d399";
    if (subs.includes(TileSubtype.CHEST)) return "#a16207";
    if (subs.includes(TileSubtype.LAVA)) return "#ff5a1e";
    if (subs.includes(TileSubtype.DEEP_WATER)) return "#1e4e7a";
    if (tiles[y][x] === 1) return "#39433a";
    return "#5f6d54";
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${tiles[0].length}, 9px)`,
        gap: 1,
        background: "#222",
        padding: 4,
        width: "fit-content",
      }}
    >
      {tiles.map((row, y) =>
        row.map((_, x) => {
          const ring = sw.has(`${y},${x}`) || mural.has(`${y},${x}`);
          return (
            <div
              key={`${y}-${x}`}
              title={`${y},${x}`}
              style={{ width: 9, height: 9, background: cell(y, x), boxShadow: ring ? "inset 0 0 0 1.5px #000" : undefined }}
            />
          );
        })
      )}
    </div>
  );
}

function Inner() {
  const [mounted, setMounted] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showMap, setShowMap] = useState(false); // full-floor overview hidden by default
  const [daylight, setDaylight] = useState(false); // false = the daily's torch FOV
  useEffect(() => setMounted(true), []);

  const { floor, urlSeed } = useMemo(() => {
    if (!mounted || typeof window === "undefined") return { floor: 2, urlSeed: null as number | null };
    const p = new URLSearchParams(window.location.search);
    return { floor: p.get("floor") === "3" ? 3 : 2, urlSeed: p.get("seed") ? Number(p.get("seed")) : null };
  }, [mounted]);

  const built = useMemo(() => {
    if (!mounted) return null;
    const today = hashStringToSeed(new Date().toLocaleDateString("en-CA"));
    const seed = urlSeed ?? findSeed(today, floor);
    return build(seed, floor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, floor, urlSeed, resetKey]);

  if (!built) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-black/90 text-sm">
        Loading cipher floor…
      </div>
    );
  }
  const { state, lock, seed } = built;
  const target = lock.target ?? [];
  // switch-centroid -> mural distance for the readout
  const rows = lock.switches.map(([y]) => y);
  const cy = rows.reduce((a, b) => a + b, 0) / rows.length;
  const cx = lock.switches.reduce((a, [, x]) => a + x, 0) / lock.switches.length;
  const m0 = lock.mural?.tiles[0] ?? [0, 0];
  const dist = Math.hypot(m0[0] - cy, m0[1] - cx);
  const other = floor === 2 ? 3 : 2;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white bg-black/90 gap-3">
      <div className="text-center bg-black/70 rounded-lg p-3 max-w-2xl">
        <h1 className="text-xl font-bold">Cipher room in a real Floor {floor}</h1>
        <p className="text-xs text-gray-300 mt-1">
          The puzzle is stamped into a live daily floor: <b>staggered switches</b> (one per column),
          a <b>gated reward</b>, and the <b>mural</b> ~{dist.toFixed(0)} tiles away — offscreen, so you
          read it, remember it, and walk back. The game view below uses the daily&apos;s <b>torch FOV</b>
          (enemies stripped). Toggle the overview if you want to see where everything landed.
        </p>
        <p className="text-xs mt-2 flex items-center justify-center gap-3 flex-wrap">
          <span>
            code:{" "}
            {target.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", width: 18, height: 18, verticalAlign: "middle" }}>
                <ColorGlyph colorIndex={c} color={toggleStateColor(c)} size={18} strokeWidth={2} />
              </span>
            ))}
          </span>
          <span className="text-gray-400">seed {seed} · mural {dist.toFixed(1)} tiles away</span>
        </p>
        <p className="text-xs text-gray-400 mt-2 space-x-3">
          <a className="underline text-sky-300" href={`/test-cipher-daily?floor=${other}`}>→ floor {other}</a>
          <a className="underline" href={`/test-cipher-daily?floor=${floor}&seed=${findSeed(seed + 1, floor)}`}>next floor →</a>
          <button className="underline" onClick={() => setResetKey((k) => k + 1)}>restart</button>
          <button className="underline" onClick={() => setShowMap((v) => !v)}>{showMap ? "hide" : "show"} overview</button>
          <button className="underline" onClick={() => setDaylight((v) => !v)}>lighting: {daylight ? "full" : "torch FOV"}</button>
        </p>
      </div>

      {showMap && (
        <>
          <div className="text-xs text-gray-400">whole-floor overview (debug)</div>
          <MiniMap state={state} lock={lock} />
        </>
      )}

      <TilemapGrid
        key={`${floor}-${seed}-${resetKey}-${daylight}`}
        tileTypes={tileTypes}
        initialGameState={state}
        forceDaylight={daylight}
        storageSlot="test"
      />
    </div>
  );
}

export default function TestCipherDailyPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
