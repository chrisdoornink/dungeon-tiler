import { Direction } from "./map";
import { assetUrl } from "./asset_url";

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
    // opt back out with ?smooth=0 and back in with ?smooth=1.
    try {
      window.localStorage.setItem("tb_smooth_movement", qp);
    } catch {
      // localStorage unavailable (private mode etc.) — param still applies now
    }
    return qp === "1";
  }
  // ON by default (signed off after full-run prod testing); an explicit
  // ?smooth=0 opt-out persists via localStorage until ?smooth=1 clears it.
  try {
    return window.localStorage.getItem("tb_smooth_movement") !== "0";
  } catch {
    return true;
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
  // Lit torch uses the flameless base sprite; PixelFlame supplies the fire
  const variant = torchLit ? "-noflame" : "-snuff";
  return assetUrl(`/images/hero/hero-${dir}${equip}${variant}-static.png`);
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
  // Multi-tile flight rather than a step: animate as a lobbed, tumbling arc instead of a
  // straight glide. Set for a snake the Fisher has thrown across the spikes — without it
  // the snake simply blinked to its landing tile and the throw was unreadable.
  arc?: boolean;
  /**
   * ms to hold before the slide starts. Used by moving platforms so the slab visibly moves AFTER
   * the hero and the enemies have finished theirs.
   *
   * This is the fix for a real legibility problem, not polish. A platform advances at the end of
   * the turn, after the player's move resolves — but with everything animating at once the player
   * could not see that, so they read "the slab will be there next turn, I'll step onto that tile"
   * and stepped into lava the slab had not reached yet. Sequencing the slide last makes the rule
   * visible: everything else moves, then the platform moves.
   */
  delay?: number;
};

/**
 * How platform slides are paced.
 *
 * `delayMs` sequences the slab after the hero/enemy slides rather than alongside them. `durMs` is
 * deliberately shorter than a footstep: the slide is already starting late, so a full-length tween
 * on top of that would make every ride feel sluggish.
 *
 * `snapAboveRateHz`: if turns are arriving faster than this — someone holding a direction down, or
 * mashing wait — the tween is abandoned and the slab snaps. Animating in that case would put the
 * slab permanently behind the game state, which is worse than not animating at all.
 */
export const PLATFORM_SLIDE = {
  delayMs: 90,
  durMs: 130,
  snapAboveRateHz: 5,
} as const;

const DIRECTION_DELTA: Record<Direction, readonly [number, number]> = {
  [Direction.UP]: [-1, 0],
  [Direction.DOWN]: [1, 0],
  [Direction.LEFT]: [0, -1],
  [Direction.RIGHT]: [0, 1],
};

/**
 * Decide whether a completed move was the hero BOARDING a moving platform.
 *
 * Boarding is a single turn that moves the hero TWO tiles: one step onto the deck, then a carry as
 * the platform advances. Animated as one tween that reads as a teleport-then-slide-underneath —
 * the camera snaps to the final tile and the deck slides in under a stationary hero. Splitting it
 * into a walk (to the stepped tile) and a ride (the carry) is what lets the hero walk on normally
 * and then travel with the deck.
 *
 * Returns the intermediate "stepped" tile — where the walk ends and the ride begins — or null when
 * the move was ordinary (or a teleport/warp). Pure geometry, so the decision is unit-tested away
 * from the rAF loop and the browser's animation clock (which can't be frame-sampled reliably).
 *
 * `endedOnPlatform` must be true only when the hero's FINAL tile carries a MOVING_PLATFORM — that
 * is what distinguishes a platform carry from any other two-tile position change.
 */
export function planBoardCarry(opts: {
  from: readonly [number, number];
  after: readonly [number, number];
  direction: Direction;
  endedOnPlatform: boolean;
}): { stepped: [number, number] } | null {
  const { from, after, direction, endedOnPlatform } = opts;
  if (!endedOnPlatform) return null;
  const rf: [number, number] = [Math.round(from[0]), Math.round(from[1])];
  const d = DIRECTION_DELTA[direction];
  const stepped: [number, number] = [rf[0] + d[0], rf[1] + d[1]];
  const net = Math.abs(after[0] - rf[0]) + Math.abs(after[1] - rf[1]);
  const carry = Math.abs(after[0] - stepped[0]) + Math.abs(after[1] - stepped[1]);
  if (net === 2 && carry === 1) return { stepped };
  return null;
}
