import { Enemy } from "./enemy";
import { type EnemyKind, getDesiredCountRanges } from "./enemies/registry";

/**
 * Assign enemy kinds using controlled counts per level:
 * - goblin: 3–4
 * - ghost: 1–2
 * - stone-exciter: 1–2
 *
 * The exact counts are sampled uniformly within each range, then adjusted to
 * match the provided enemies.length if needed (prefer staying in-range, but
 * will exceed minima/maxima as a last resort to satisfy the array length).
 */
export function enemyTypeAssignement(
  enemies: Enemy[],
  opts?: { rng?: () => number }
): void {
  const rng = opts?.rng ?? Math.random;

  // Pull desired ranges from the registry
  const ranges = getDesiredCountRanges();
  const min = {
    goblins: ranges["goblin"].min,
    ghosts: ranges["ghost"].min,
    stones: ranges["stone-exciter"].min,
    mimics: ranges["mimic"].min,
  } as const;
  const max = {
    goblins: ranges["goblin"].max,
    ghosts: ranges["ghost"].max,
    stones: ranges["stone-exciter"].max,
    mimics: ranges["mimic"].max,
  } as const;

  // Sample desired counts within ranges (uniformly choose an endpoint)
  let goblins = min.goblins + (rng() < 0.5 ? 0 : Math.max(0, max.goblins - min.goblins));
  let ghosts = min.ghosts + (rng() < 0.5 ? 0 : Math.max(0, max.ghosts - min.ghosts));
  let stones = min.stones + (rng() < 0.5 ? 0 : Math.max(0, max.stones - min.stones));
  let mimics = min.mimics + (rng() < 0.5 ? 0 : Math.max(0, max.mimics - min.mimics));

  const target = enemies.length;
  const sum = () => goblins + ghosts + stones + mimics;

  // If we have fewer than needed, increase within ranges first, then beyond if required
  while (sum() < target) {
    if (goblins < max.goblins) goblins++;
    else if (ghosts < max.ghosts) ghosts++;
    else if (stones < max.stones) stones++;
    else if (mimics < max.mimics) mimics++;
    else goblins++; // as last resort, exceed preferred range
  }

  // If we have more than needed, decrease within ranges in order of preference
  while (sum() > target) {
    if (goblins > min.goblins) goblins--;
    else if (ghosts > min.ghosts) ghosts--;
    else if (stones > min.stones) stones--;
    else if (mimics > min.mimics) mimics--;
    else goblins--; // as last resort, go below preferred range
  }

  // Build an assignment pool
  const pool: EnemyKind[] = [];
  for (let i = 0; i < goblins; i++) pool.push("goblin");
  for (let i = 0; i < ghosts; i++) pool.push("ghost");
  for (let i = 0; i < stones; i++) pool.push("stone-exciter");
  for (let i = 0; i < mimics; i++) pool.push("mimic");

  // Shuffle pool with Fisher–Yates for variety
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Assign kinds to enemies in order
  for (let i = 0; i < enemies.length; i++) {
    enemies[i].kind = pool[i] ?? "goblin"; // safety fallback
  }
}
