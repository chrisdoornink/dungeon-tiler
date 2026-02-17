import { Enemy } from "./enemy";
import { type EnemyKind, getDesiredCountRanges } from "./enemies/registry";

/**
 * Assign enemy kinds using controlled counts per level:
 * - fire-goblin: 2–3
 * - water-goblin: 1–2
 * - water-goblin-spear: 0–1
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
    fireGoblins: ranges["fire-goblin"].min,
    waterGoblins: ranges["water-goblin"].min,
    waterGoblinSpears: ranges["water-goblin-spear"].min,
    ghosts: ranges["ghost"].min,
    stones: ranges["stone-exciter"].min,
  } as const;
  const max = {
    fireGoblins: ranges["fire-goblin"].max,
    waterGoblins: ranges["water-goblin"].max,
    waterGoblinSpears: ranges["water-goblin-spear"].max,
    ghosts: ranges["ghost"].max,
    stones: ranges["stone-exciter"].max,
  } as const;

  // Sample desired counts within ranges (uniformly choose an endpoint)
  let fireGoblins = min.fireGoblins + (rng() < 0.5 ? 0 : Math.max(0, max.fireGoblins - min.fireGoblins));
  let waterGoblins = min.waterGoblins + (rng() < 0.5 ? 0 : Math.max(0, max.waterGoblins - min.waterGoblins));
  let waterGoblinSpears = min.waterGoblinSpears + (rng() < 0.5 ? 0 : Math.max(0, max.waterGoblinSpears - min.waterGoblinSpears));
  let ghosts = min.ghosts + (rng() < 0.5 ? 0 : Math.max(0, max.ghosts - min.ghosts));
  let stones = min.stones + (rng() < 0.5 ? 0 : Math.max(0, max.stones - min.stones));

  const target = enemies.length;
  const sum = () => fireGoblins + waterGoblins + waterGoblinSpears + ghosts + stones;

  // If we have fewer than needed, increase within ranges first, then beyond if required
  while (sum() < target) {
    if (fireGoblins < max.fireGoblins) fireGoblins++;
    else if (waterGoblins < max.waterGoblins) waterGoblins++;
    else if (waterGoblinSpears < max.waterGoblinSpears) waterGoblinSpears++;
    else if (ghosts < max.ghosts) ghosts++;
    else if (stones < max.stones) stones++;
    else fireGoblins++; // as last resort, exceed preferred range
  }

  // If we have more than needed, decrease within ranges in order of preference
  while (sum() > target) {
    if (waterGoblinSpears > min.waterGoblinSpears) waterGoblinSpears--;
    else if (waterGoblins > min.waterGoblins) waterGoblins--;
    else if (fireGoblins > min.fireGoblins) fireGoblins--;
    else if (ghosts > min.ghosts) ghosts--;
    else if (stones > min.stones) stones--;
    else fireGoblins--; // as last resort, go below preferred range
  }

  // Build an assignment pool
  const pool: EnemyKind[] = [];
  for (let i = 0; i < fireGoblins; i++) pool.push("fire-goblin");
  for (let i = 0; i < waterGoblins; i++) pool.push("water-goblin");
  for (let i = 0; i < waterGoblinSpears; i++) pool.push("water-goblin-spear");
  for (let i = 0; i < ghosts; i++) pool.push("ghost");
  for (let i = 0; i < stones; i++) pool.push("stone-exciter");

  // Shuffle pool with Fisher–Yates for variety
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Assign kinds to enemies in order
  for (let i = 0; i < enemies.length; i++) {
    enemies[i].kind = pool[i] ?? "fire-goblin"; // safety fallback
  }
}
