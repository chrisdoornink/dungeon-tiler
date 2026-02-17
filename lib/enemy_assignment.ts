import { Enemy } from "./enemy";
import { type EnemyKind } from "./enemies/registry";

/**
 * Assign enemy kinds for a level:
 * - 4–6 goblins, each randomly chosen with equal probability from all goblin types
 * - 1–2 ghosts
 * - 0–1 snakes (handled separately by addSnakesPerRules)
 *
 * Rune pots for stone-goblins are handled downstream by addRunePotsForStoneExciters,
 * which counts the actual stone-goblins in the enemies array.
 */

const GOBLIN_KINDS: EnemyKind[] = [
  "fire-goblin",
  "water-goblin",
  "water-goblin-spear",
  "earth-goblin",
  "earth-goblin-knives",
  "stone-goblin",
];

export function enemyTypeAssignement(
  enemies: Enemy[],
  opts?: { rng?: () => number }
): void {
  const rng = opts?.rng ?? Math.random;
  const target = enemies.length;
  if (target === 0) return;

  // Determine goblin count: 4–6
  const goblinCount = Math.min(target, 4 + Math.floor(rng() * 3)); // 4, 5, or 6
  // Remaining slots go to ghosts (1–2, clamped to available)
  const ghostCount = Math.min(target - goblinCount, 1 + (rng() < 0.5 ? 0 : 1));

  // Build pool: random goblin types with equal chance
  const pool: EnemyKind[] = [];
  for (let i = 0; i < goblinCount; i++) {
    const idx = Math.floor(rng() * GOBLIN_KINDS.length);
    pool.push(GOBLIN_KINDS[idx]);
  }
  for (let i = 0; i < ghostCount; i++) {
    pool.push("ghost");
  }

  // If pool is still smaller than target, fill with random goblins
  while (pool.length < target) {
    const idx = Math.floor(rng() * GOBLIN_KINDS.length);
    pool.push(GOBLIN_KINDS[idx]);
  }

  // Shuffle pool with Fisher–Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Assign kinds to enemies in order
  for (let i = 0; i < enemies.length; i++) {
    enemies[i].kind = pool[i] ?? "fire-goblin"; // safety fallback
  }
}
