import React from "react";
import styles from "./CoilwyrmStench.module.css";

/**
 * A thin green miasma rising off the Coilwyrm — idle ambience, so the creature looks alive
 * while the player is standing still thinking. Pure CSS after mount: a handful of soft wisps
 * drift up, fade, and loop.
 *
 * `seed` staggers phase, size, drift and position per tile, so a long coil reads as an uneven
 * organic haze rather than every segment puffing in lockstep. It must be DERIVED FROM THE TILE
 * (not random) or the wisps re-roll on every React re-render and the mist visibly twitches.
 */

// Wisps per emitter. Kept low on purpose: each one is a blurred, screen-blended element and a
// fully grown coil has an emitter on EVERY segment, so the budget goes on spreading the haze over
// many tiles rather than stacking it thickly on a few.

/** Tiny deterministic hash — same seed always gives the same mist. */
function hash(seed: number, salt: number): number {
  let h = (seed * 73856093) ^ (salt * 19349663);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type CoilwyrmStenchProps = {
  /** Stable per-tile value (e.g. row * 31 + col) used to stagger every wisp. */
  seed: number;
  /**
   * Overall strength. The head gets the full plume; body segments get a fainter one so a
   * 20-segment coil does not turn into a green wall.
   */
  strength?: number;
  /** How many wisps this tile emits. The head plumes; a body segment only needs one. */
  wisps?: number;
};

export const CoilwyrmStench: React.FC<CoilwyrmStenchProps> = ({
  seed,
  strength = 1,
  wisps = 1,
}) => {
  return (
    <div className={styles.stench} aria-hidden="true">
      {Array.from({ length: wisps }, (_, i) => {
        const r1 = hash(seed, i * 3 + 1);
        const r2 = hash(seed, i * 3 + 2);
        const r3 = hash(seed, i * 3 + 3);
        const size = 26 + r1 * 20; // % of a tile
        // Positioned by CENTRE, not by left edge. `left` places the edge, so combining it with a
        // percentage width pushed the average wisp centre to about two thirds across the tile —
        // the mist visibly hung off to the RIGHT of the creature on every tile.
        const center = 50 + (r2 - 0.5) * 22; // 39-61% across the tile
        return (
          <span
            key={i}
            className={styles.wisp}
            style={{
              width: `${size}%`,
              height: `${size}%`,
              left: `${center - size / 2}%`,
              // In container units, where 50% is the tile's top edge: start in the creature's
              // upper half and drift up out of the tile.
              bottom: `${30 + r3 * 20}%`,
              // Long, unequal cycles so the wisps never fall into a visible rhythm.
              animationDuration: `${3.1 + r1 * 2.6}s`,
              animationDelay: `${-r2 * 5}s`,
              ["--drift" as string]: `${(r3 - 0.5) * 16}px`,
              // ~0.34-0.54 at full strength. Eyeballed live in the arena: much below this and
              // the mist is invisible against green-grey stone, much above and it stops being
              // a smell and becomes a glowing blob.
              ["--peak" as string]: `${(0.34 + r1 * 0.2) * strength}`,
            }}
          />
        );
      })}
    </div>
  );
};

export default CoilwyrmStench;
