import { Enemy } from "./enemy";
import { type EnemyKind } from "./enemies/registry";

/**
 * Assign enemy kinds for a level:
 * - 4–6 goblins, weighted by difficulty (harder types spawn less often)
 * - 1–2 ghosts
 * - 0–1 snakes (handled separately by addSnakesPerRules)
 *
 * Rune pots for stone-goblins are handled downstream by addRunePotsForStoneExciters,
 * which counts the actual stone-goblins in the enemies array.
 */

// Spawn weights by difficulty (easier = higher weight, range 20–5):
//   earth-goblin:        20  (difficulty 2/10 — low HP, low attack)
//   fire-goblin:         17  (difficulty 3/10 — balanced baseline)
//   water-goblin:        17  (difficulty 3/10 — tanky but weak attack)
//   earth-goblin-knives: 12  (difficulty 4/10 — low HP, high attack)
//   water-goblin-spear:   8  (difficulty 6/10 — high HP + high attack)
//   stone-goblin:         6  (difficulty 7/10 — 1 melee dmg, needs runes)
//   pink-goblin:          5  (difficulty 8/10 — ranged, teleports)
const WEIGHTED_GOBLIN_KINDS: Array<{ kind: EnemyKind; weight: number }> = [
  { kind: "earth-goblin",        weight: 20 },
  { kind: "fire-goblin",         weight: 17 },
  { kind: "water-goblin",        weight: 17 },
  { kind: "earth-goblin-knives", weight: 12 },
  { kind: "water-goblin-spear",  weight:  8 },
  { kind: "stone-goblin",        weight:  6 },
  { kind: "pink-goblin",         weight:  5 },
];

const TOTAL_GOBLIN_WEIGHT = WEIGHTED_GOBLIN_KINDS.reduce((sum, g) => sum + g.weight, 0);

function pickWeightedGoblin(rng: () => number): EnemyKind {
  let roll = rng() * TOTAL_GOBLIN_WEIGHT;
  for (const { kind, weight } of WEIGHTED_GOBLIN_KINDS) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return WEIGHTED_GOBLIN_KINDS[0].kind; // safety fallback
}

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

  // Build pool: weighted goblin types (harder = less frequent)
  const pool: EnemyKind[] = [];
  for (let i = 0; i < goblinCount; i++) {
    pool.push(pickWeightedGoblin(rng));
  }
  for (let i = 0; i < ghostCount; i++) {
    pool.push("ghost");
  }

  // If pool is still smaller than target, fill with weighted goblins
  while (pool.length < target) {
    pool.push(pickWeightedGoblin(rng));
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
