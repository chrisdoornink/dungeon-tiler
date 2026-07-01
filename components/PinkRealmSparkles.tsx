"use client";

import { useCallback, useState } from "react";
import { FLOOR } from "../lib/map/constants";

const TILE_SIZE = 40;
const COUNT = 40;

interface Sparkle {
  key: number;
  left: number; // px in map space
  top: number; // px in map space
  size: number;
  duration: number; // seconds for the full fade in + out
  delay: number; // seconds before the cycle starts
  peakOpacity: number;
}

let nextKey = 0;

function spawnSparkle(tiles: number[][], withDelay: boolean): Sparkle {
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
    // initial sparkles stagger their first appearance; respawns start soon
    delay: withDelay ? Math.random() * 5 : Math.random() * 0.8,
    peakOpacity: 0.55 + Math.random() * 0.4,
  };
}

export function PinkRealmSparkles({
  tiles,
  dark = false,
}: {
  tiles: number[][];
  dark?: boolean;
}) {
  const [sparkles, setSparkles] = useState<Sparkle[]>(() =>
    Array.from({ length: COUNT }, () => spawnSparkle(tiles, true))
  );

  // when a sparkle's one-shot animation ends, replace it with a fresh one elsewhere
  const handleEnded = useCallback(
    (key: number) => {
      setSparkles((prev) =>
        prev.map((s) => (s.key === key ? spawnSparkle(tiles, false) : s))
      );
    },
    [tiles]
  );

  return (
    <>
      <style>{`
        @keyframes pink-sparkle-once {
          0%   { opacity: 0; transform: scale(0.6); }
          50%  { opacity: var(--peak-opacity); transform: scale(1); }
          100% { opacity: 0; transform: scale(0.6); }
        }
      `}</style>
      <div className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
        {sparkles.map((s) => (
          <div
            key={s.key}
            onAnimationEnd={() => handleEnded(s.key)}
            style={{
              position: "absolute",
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              borderRadius: "50%",
              opacity: 0,
              background: dark
                ? "radial-gradient(circle, #1a0c22 0%, #07030c 60%, transparent 100%)"
                : "radial-gradient(circle, #ffd6f0 0%, #ff9ee0 60%, transparent 100%)",
              boxShadow: dark
                ? `0 0 ${s.size * 2}px ${s.size}px rgba(0, 0, 0, 0.65)`
                : `0 0 ${s.size * 2}px ${s.size}px rgba(255, 180, 230, 0.7)`,
              ["--peak-opacity" as string]: s.peakOpacity,
              animation: `pink-sparkle-once ${s.duration}s ease-in-out ${s.delay}s 1 both`,
            }}
          />
        ))}
      </div>
    </>
  );
}
