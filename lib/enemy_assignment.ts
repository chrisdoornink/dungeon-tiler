import { Enemy } from "./enemy";

/**
 * Assign enemy kinds based on simple probability distribution.
 * Current distribution:
 * - goblin: 60%
 * - ghost: 20%
 * - stone-exciter: 20%
 *
 * For future expansion, this function can accept additional context such as
 * map grid, enemy positions, spacing requirements, or biome modifiers.
 */
export function enemyTypeAssignement(
  enemies: Enemy[],
  opts?: { rng?: () => number }
): void {
  const rng = opts?.rng ?? Math.random;
  for (const e of enemies) {
    const r = rng();
    if (r < 0.6) {
      e.kind = "goblin";
    } else if (r < 0.8) {
      e.kind = "ghost";
    } else {
      e.kind = "stone-exciter";
    }
  }
}
