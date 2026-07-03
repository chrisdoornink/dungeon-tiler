import React from "react";
import styles from "./PixelFlame.module.css";

// Animated pixel-art torch flame. Four hand-drawn frames on a 7x9 grid are
// painted with box-shadow "pixels" and cycled by stepped CSS keyframes, so a
// single component instance animates forever with zero JS after mount.
//
// `cell` is the size of one flame pixel in CSS px; the whole flame is
// (7*cell) x (9*cell). Position it via `style`/`className` from the caller.
// `seed` staggers the animation phase so nearby flames don't flicker in sync.

export const FLAME_COLS = 7;
export const FLAME_ROWS = 9;

// Must match animation-duration in PixelFlame.module.css
const CYCLE_S = 0.52;

// Palette matches the baked flames on the original sprites
const COLORS: Record<string, string> = {
  Y: "#FFEFB4", // pale core
  G: "#FFC94D", // gold
  O: "#FF8C1E", // orange
  o: "#E86A14", // deep orange
  D: "#C24E12", // dark base
};

const FRAMES: string[][] = [
  [
    "...o...",
    "...O...",
    "..OOo..",
    "..OGO..",
    ".oGYGo.",
    ".OGYYO.",
    ".oGYGO.",
    "..GYG..",
    "..oDo..",
  ],
  [
    "....o..",
    "...Oo..",
    "..oOO..",
    ".oOGOo.",
    ".OGYGO.",
    ".oGYYO.",
    "..GYGo.",
    "..oGO..",
    "...D...",
  ],
  [
    ".o.....",
    "..O.o..",
    "..OOO..",
    ".oOGO..",
    ".OGYGo.",
    ".OGYYO.",
    "..GYGO.",
    "..OGo..",
    "..oD...",
  ],
  [
    "...o...",
    "..oO...",
    ".oOOo..",
    ".OGGOo.",
    ".OGYGO.",
    ".oGYYGo",
    "..GYYG.",
    "..oGGo.",
    "...D...",
  ],
];

// box-shadow strings are pure functions of (frame, cell); cache them since
// many tiles render flames with the same cell size every frame.
const shadowCache = new Map<string, string>();

function frameShadow(frame: number, cell: number): string {
  const key = `${frame}|${cell}`;
  const cached = shadowCache.get(key);
  if (cached) return cached;
  const parts: string[] = [];
  FRAMES[frame].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = COLORS[row[x]];
      // Offsets start at +1 cell because outer box-shadows don't paint under
      // the element's own box; the element is parked one cell up-left.
      if (color) parts.push(`${(x + 1) * cell}px ${(y + 1) * cell}px 0 0 ${color}`);
    }
  });
  const shadow = parts.join(", ");
  shadowCache.set(key, shadow);
  return shadow;
}

export type PixelFlameProps = {
  /** Size of one flame pixel in CSS px */
  cell: number;
  /** Staggers animation phase so flames don't flicker in sync */
  seed?: number;
  /** Adds a soft pulsing warm halo behind the flame */
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function PixelFlame({
  cell,
  seed = 0,
  glow = false,
  className,
  style,
}: PixelFlameProps) {
  const delay = `${-((((seed % 13) + 13) % 13) / 13) * CYCLE_S}s`;
  return (
    <div
      className={`${styles.flame}${className ? ` ${className}` : ""}`}
      style={{ width: FLAME_COLS * cell, height: FLAME_ROWS * cell, ...style }}
      aria-hidden="true"
      data-testid="pixel-flame"
    >
      {glow && <div className={styles.glow} style={{ animationDelay: delay }} />}
      {FRAMES.map((_, i) => (
        <div
          key={i}
          className={`${styles.px} ${styles[`f${i}`]}`}
          style={{
            left: -cell,
            top: -cell,
            width: cell,
            height: cell,
            boxShadow: frameShadow(i, cell),
            animationDelay: delay,
          }}
        />
      ))}
    </div>
  );
}

// Flame anchor points (percent of the 40px tile) for sprites that hold a
// torch, keyed by sprite direction. Shared by the in-tile hero, the
// smooth-movement hero overlay, and the fire goblin.
export const HERO_FLAME_ANCHOR: Record<
  "front" | "right" | "back",
  { left: string; bottom: string }
> = {
  front: { left: "76%", bottom: "62%" },
  right: { left: "75%", bottom: "62%" },
  back: { left: "26%", bottom: "64%" },
};

export const GOBLIN_FLAME_ANCHOR: Record<
  "front" | "right" | "back",
  { left: string; bottom: string }
> = {
  front: { left: "76%", bottom: "62%" },
  right: { left: "80%", bottom: "62%" },
  back: { left: "78%", bottom: "65%" },
};
