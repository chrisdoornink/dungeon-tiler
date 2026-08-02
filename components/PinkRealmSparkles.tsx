"use client";

import { useMemo } from "react";
import { FLOOR } from "../lib/map/constants";
import {
  PINK_SPARKLE_COUNT,
  type RenderQuality,
} from "../lib/render_quality";
import styles from "./PinkRealmSparkles.module.css";

const TILE_SIZE = 40;

interface Sparkle {
  key: number;
  left: number; // px in map space
  top: number; // px in map space
  size: number;
  duration: number; // seconds for the full fade in + out
  delay: number; // seconds before the first cycle starts
  peakOpacity: number;
}

let nextKey = 0;

function spawnSparkle(tiles: number[][]): Sparkle {
  // pick a random floor tile, then a random offset within it
  let y = 0;
  let x = 0;
  for (let attempt = 0; attempt < 50; attempt++) {
    y = Math.floor(Math.random() * tiles.length);
    x = Math.floor(Math.random() * (tiles[0]?.length ?? 0));
    if (tiles[y]?.[x] === FLOOR) break;
  }
  return {
    key: nextKey++,
    left: x * TILE_SIZE + Math.random() * TILE_SIZE,
    top: y * TILE_SIZE + Math.random() * TILE_SIZE,
    size: 2 + Math.random() * 3,
    duration: 2.5 + Math.random() * 2.5,
    // Stagger the first appearance so the field doesn't pulse in lockstep. Because the
    // animation now loops rather than respawning, this offset is what keeps the sparkles
    // out of phase with each other forever, not just on the first cycle.
    delay: Math.random() * 5,
    peakOpacity: 0.55 + Math.random() * 0.4,
  };
}

export function PinkRealmSparkles({
  tiles,
  dark = false,
  quality = "full",
}: {
  tiles: number[][];
  dark?: boolean;
  quality?: RenderQuality;
}) {
  // Positions are rolled ONCE per mount and never again. `tiles` is a fresh array on most
  // parent renders, so deriving from it on every render would re-roll every sparkle and
  // make the whole field visibly twitch (the same trap documented in CoilwyrmStench).
  // The pool is always full-size; the tier just decides how much of it gets rendered, so
  // dropping to reduced never disturbs the sparkles already on screen.
  const pool = useMemo(
    () => Array.from({ length: PINK_SPARKLE_COUNT.full }, () => spawnSparkle(tiles)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const sparkles = pool.slice(0, PINK_SPARKLE_COUNT[quality]);
  // box-shadow blur is a paint-time cost on every frame the sparkle is visible, and it is
  // the single most expensive thing about a sparkle. The radial gradient already reads as
  // a glow without it, so the reduced tier drops the halo and keeps the dot.
  const halo = quality === "full";

  return (
    <div className={styles.layer} aria-hidden="true">
      {sparkles.map((s) => (
        <div
          key={s.key}
          className={styles.sparkle}
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            background: dark
              ? "radial-gradient(circle, #1a0c22 0%, #07030c 60%, transparent 100%)"
              : "radial-gradient(circle, #ffd6f0 0%, #ff9ee0 60%, transparent 100%)",
            boxShadow: halo
              ? dark
                ? `0 0 ${s.size * 2}px ${s.size}px rgba(0, 0, 0, 0.65)`
                : `0 0 ${s.size * 2}px ${s.size}px rgba(255, 180, 230, 0.7)`
              : undefined,
            ["--sparkle-duration" as string]: `${s.duration}s`,
            ["--sparkle-delay" as string]: `${s.delay}s`,
            ["--sparkle-peak" as string]: s.peakOpacity,
          }}
        />
      ))}
    </div>
  );
}
