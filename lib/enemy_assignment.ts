import { Enemy } from "./enemy";
import { getSpawnWeights, type EnemyKind } from "./enemies/registry";

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
  const weights = getSpawnWeights();
  const total = weights.reduce((s, w) => s + w.weight, 0);
  const pick = (): EnemyKind => {
    let r = rng() * total;
    for (const w of weights) {
      if (r < w.weight) return w.kind;
      r -= w.weight;
    }
    return weights[weights.length - 1].kind;
  };
  for (const e of enemies) {
    e.kind = pick();
  }
}
