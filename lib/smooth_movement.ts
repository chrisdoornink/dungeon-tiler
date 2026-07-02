import { Direction } from "./map";

/**
 * Phase 1 of the smooth-movement port (prototyped at /test-animation):
 *  - hero rendered as a viewport-centered overlay instead of inside its tile
 *  - camera glides one tile per turn (rAF tween) instead of the CSS snap
 *  - chained inputs break into a run (faster cadence, bigger bounce)
 *
 * OFF by default (prod-safe): opt in with ?smooth=1, which persists to
 * localStorage (tb_smooth_movement) so it stays on across pages until ?smooth=0
 * turns it back off. Always OFF under Jest so existing tests exercise the
 * legacy path unchanged.
 */

// Tuning signed off in the sandbox review (walkStepMs bumped 270 -> 170 per
// prod-testing feedback: the walk cadence read as slightly too slow).
export const SMOOTH_TUNING = {
  walkStepMs: 170,
  runStepMs: 120,
  runThreshold: 1, // chained steps before running kicks in
  decayMs: 150, // idle gap (ms) that resets run momentum
  bobWalk: 0.5, // px
  bobRun: 3, // px
  tiltDeg: 4, // weight-shift tilt
  squash: 0.04, // squash/stretch amount
} as const;

// Regular goblins (fire/water/earth family) get a subtle bob + alternating
// tilt at the midpoint of their tile-to-tile slide — the flat slide alone
// read as sliding rather than walking. Ghosts, the pink goblin, white-goblin
// clusters, snakes, and the stone goblin keep the flat slide; their own
// movement language (hover, slither, heavy trudge) already reads correctly.
export const ENEMY_GAIT = {
  bobPx: 3,
  tiltDeg: 6,
} as const;

export const REGULAR_GOBLIN_KINDS = new Set([
  "fire-goblin",
  "water-goblin",
  "water-goblin-spear",
  "earth-goblin",
  "earth-goblin-knives",
]);

export function isSmoothMovementEnabled(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  if (typeof window === "undefined") return false;
  const qp = new URLSearchParams(window.location.search).get("smooth");
  if (qp === "0" || qp === "1") {
    // Persist the explicit choice so it sticks across page navigations —
    // testers opt in once with ?smooth=1 and back out with ?smooth=0.
    try {
      window.localStorage.setItem("tb_smooth_movement", qp);
    } catch {
      // localStorage unavailable (private mode etc.) — param still applies now
    }
    return qp === "1";
  }
  try {
    return window.localStorage.getItem("tb_smooth_movement") === "1";
  } catch {
    return false;
  }
}

// Mirrors the hero-image path logic in components/Tile.tsx (equip order is
// shield-then-sword when both are present).
export function heroSpritePath(
  direction: Direction,
  hasSword: boolean,
  hasShield: boolean,
  torchLit: boolean
): string {
  let dir = "front";
  switch (direction) {
    case Direction.UP:
      dir = "back";
      break;
    case Direction.RIGHT:
    case Direction.LEFT:
      dir = "right";
      break;
    case Direction.DOWN:
    default:
      dir = "front";
  }
  const equip =
    hasSword && hasShield
      ? "-shield-sword"
      : hasShield
      ? "-shield"
      : hasSword
      ? "-sword"
      : "";
  const snuff = torchLit ? "" : "-snuff";
  return `/images/hero/hero-${dir}${equip}${snuff}-static.png`;
}

export const smoothEaseInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// Phase 2: one-tile slide for an enemy/NPC sprite. The sprite renders in its
// DESTINATION tile; dy/dx are the tile offset back toward where it came from
// (prev - current). `seq` keys the sprite element so a fresh arrival on the
// same tile restarts the CSS animation. Applied via the `smoothStepSlide`
// keyframes in globals.css.
export type SmoothEntityStep = {
  dy: number;
  dx: number;
  dur: number; // ms — matches the hero's current step duration
  ease: "linear" | "ease-in-out"; // linear while the hero is running
  seq: number;
};
