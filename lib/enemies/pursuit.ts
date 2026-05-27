// Shared pursuit-movement helpers for enemies.
//
// Historically, enemies always tried to close the horizontal gap to the player
// before the vertical gap. That made their approach perfectly predictable: you
// could read exactly which tile they would step onto and line them up with
// cracks or walls. This helper instead biases toward the axis with the larger
// remaining gap (so pursuit still looks sensible) while keeping the choice
// randomized so enemies can no longer be read with certainty.

export type Step = [number, number]; // [dy, dx]

/**
 * Decide the order in which to attempt axis-aligned steps toward a target.
 *
 * Returns up to two candidate steps (`[dy, dx]`). The caller should try them in
 * order and take the first walkable one (this preserves the existing
 * "fall back to the other axis if the first is blocked" behavior).
 *
 * - If the target shares a row or column, there is only one meaningful step and
 *   no randomness is involved.
 * - If the target is diagonal, the axis with the larger remaining gap (the
 *   "dominant" axis) is favored, but only probabilistically: a coin flip when
 *   the gaps are equal, leaning harder toward the dominant axis as the gap
 *   widens, and capped so the minor axis always keeps a real chance.
 */
export function orderPursuitSteps(
  dyRaw: number,
  dxRaw: number,
  rng: () => number = Math.random
): Step[] {
  const stepY = dyRaw === 0 ? 0 : dyRaw > 0 ? 1 : -1;
  const stepX = dxRaw === 0 ? 0 : dxRaw > 0 ? 1 : -1;
  const moveX: Step = [0, stepX];
  const moveY: Step = [stepY, 0];

  // Already aligned: at most one axis to move along.
  if (stepX === 0 && stepY === 0) return [];
  if (stepX === 0) return [moveY];
  if (stepY === 0) return [moveX];

  // Diagonal: favor the dominant (larger-gap) axis, but keep it unpredictable.
  const absDx = Math.abs(dxRaw);
  const absDy = Math.abs(dyRaw);
  const dominantShare = Math.max(absDx, absDy) / (absDx + absDy); // 0.5 .. 1.0

  // Map the gap ratio to a probability in [0.5, 0.85]:
  //   equal gaps      -> 0.50 (true coin flip, no tell)
  //   widening gap    -> leans toward the dominant axis
  //   extreme gap     -> ~0.85 max, so the minor axis still fires ~15% of the time
  const pDominant = 0.5 + (dominantShare - 0.5) * 0.7;

  const dominantIsX = absDx >= absDy;
  const dominantMove = dominantIsX ? moveX : moveY;
  const minorMove = dominantIsX ? moveY : moveX;

  return rng() < pDominant
    ? [dominantMove, minorMove]
    : [minorMove, dominantMove];
}
