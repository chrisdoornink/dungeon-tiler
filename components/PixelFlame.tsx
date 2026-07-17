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

// "warm" matches the baked flames on the original sprites; "blue" is the cold
// spirit fire shown when a wisp snuffs the hero's torch; "lava" is the hot
// molten palette used by the tile-fire lava frames (see LAVA_FRAMES).
export type FlamePalette = "warm" | "blue" | "lava";
const PALETTES: Record<FlamePalette, Record<string, string>> = {
  warm: {
    Y: "#FFEFB4", // pale core
    G: "#FFC94D", // gold
    O: "#FF8C1E", // orange
    o: "#E86A14", // deep orange
    D: "#C24E12", // dark base
  },
  blue: {
    Y: "#EAF6FF", // pale core
    G: "#9CD8FF", // light blue
    O: "#5AA8FF", // blue
    o: "#3B78E0", // deep blue
    D: "#284F9E", // dark base
  },
  lava: {
    Y: "#FFE8A6", // pale-yellow hottest core
    G: "#FFC246", // gold
    O: "#FF8A24", // orange
    o: "#F0640F", // deep orange
    D: "#B23C0A", // dark molten base
  },
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

// Lava is a BUBBLING molten surface, not a tall flame. Reuses the torch's 4-frame
// box-shadow cycle, but the frames are sparse bubbles spread across the whole
// molten surface (three loose bands: top/middle/bottom) that swell and pop. Pass with palette="lava", frames={LAVA_FRAMES}, frameSetId="lava". A finer
// 20x20 grid (cell=2 in Tile.tsx = 40px, filling the tile) keeps the resolution in line
// with the rest of the game and the sparse frames keep the box-shadow cheap.
export const LAVA_COLS = 20;
export const LAVA_ROWS = 20;
export const LAVA_FRAMES: string[][] = [
  ["....................","..........O.........",".........GYG........",".........o.o........","...oOo..............","................o...","....................","....................","....................","..G.........oOo.....",".OGO..............O.","..o.....o........GYG",".................o.o","....................","...........O......G.","..........GYG....OGO","..........o.o.....o.","...o...G............","......OGO.....oOo...",".......o............"],
  ["....................","....................","....................","....G.....o.........","...OGO..............","....o..........oOo..","....................","....................","..O..........G......",".GYG........OGO.....",".o.o.........o......",".......oOo..........","..................o.","..................O.",".................GYG",".................o.o",".......O...o........","..oOo.GYG......G....","......o.o.....OGO...","...............o...."],
  ["....................","....................","....O...............","...GYG...oOo........","...o.o..........G...","...............OGO..","................o...",".............O......","............GYG.....","............o.o.....","..o.....G...........",".......OGO..........","........o........oOo","....................","....................","..................o.","...G......oOo..O....","..OGO.........GYG...","...o...o......o.o...","...................."],
  ["....................","....................","..........G.........",".........OGO....O...","....o.....o....GYG..","...............o.o..","....................","....................","....................","........O....o......",".oOo...GYG..........",".......o.o........G.",".................OGO","..................o.","....................","...O.......G.....oOo","..GYG.....OGO.......","..o.o......o........","......oOo......o....","...................."],
];

// box-shadow strings are pure functions of (frameSet, frame, cell, palette); cache
// them since many tiles render flames with the same cell size every frame.
const shadowCache = new Map<string, string>();

function frameShadow(
  frames: string[][],
  frameSetId: string,
  frame: number,
  cell: number,
  palette: FlamePalette = "warm"
): string {
  const key = `${frameSetId}|${frame}|${cell}|${palette}`;
  const cached = shadowCache.get(key);
  if (cached) return cached;
  const colors = PALETTES[palette];
  const parts: string[] = [];
  frames[frame].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x]];
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
  /** Flame color palette; "blue" is the snuffed-spirit fire, "lava" is molten */
  palette?: FlamePalette;
  /** Frame set to animate (defaults to the tall torch flame) */
  frames?: string[][];
  /** Stable id for the frame set — keys the box-shadow cache */
  frameSetId?: string;
  /** Grid width/height in cells (defaults to the torch 7x9) */
  cols?: number;
  rows?: number;
  className?: string;
  style?: React.CSSProperties;
};

export default function PixelFlame({
  cell,
  seed = 0,
  glow = false,
  palette = "warm",
  frames = FRAMES,
  frameSetId = "torch",
  cols = FLAME_COLS,
  rows = FLAME_ROWS,
  className,
  style,
}: PixelFlameProps) {
  const delay = `${-((((seed % 13) + 13) % 13) / 13) * CYCLE_S}s`;
  return (
    <div
      className={`${styles.flame}${className ? ` ${className}` : ""}`}
      style={{ width: cols * cell, height: rows * cell, ...style }}
      aria-hidden="true"
      data-testid="pixel-flame"
    >
      {glow && <div className={styles.glow} style={{ animationDelay: delay }} />}
      {frames.map((_, i) => (
        <div
          key={i}
          className={`${styles.px} ${styles[`f${i}`]}`}
          style={{
            left: -cell,
            top: -cell,
            width: cell,
            height: cell,
            boxShadow: frameShadow(frames, frameSetId, i, cell, palette),
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
