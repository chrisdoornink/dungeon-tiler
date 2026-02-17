import { Enemy } from "./enemy";
import { type EnemyKind } from "./enemies/registry";

/**
 * Assign enemy kinds for a level:
 * - Goblins weighted by difficulty (harder types spawn less often)
 * - Ghosts and snakes introduced on later floors
 * - 0–1 snakes also handled separately by addSnakesPerRules
 *
 * When `floor` is provided, the goblin pool and non-goblin counts scale
 * according to the difficulty progression defined in the feature doc.
 *
 * Rune pots for stone-goblins are handled downstream by addRunePotsForStoneExciters,
 * which counts the actual stone-goblins in the enemies array.
 */

// Base spawn weights by difficulty (easier = higher weight, range 20–5):
//   earth-goblin:        20  (difficulty 2/10 — low HP, low attack)
//   fire-goblin:         17  (difficulty 3/10 — balanced baseline)
//   water-goblin:        17  (difficulty 3/10 — tanky but weak attack)
//   earth-goblin-knives: 12  (difficulty 4/10 — low HP, high attack)
//   water-goblin-spear:   8  (difficulty 6/10 — high HP + high attack)
//   stone-goblin:         6  (difficulty 7/10 — 1 melee dmg, needs runes)
//   pink-goblin:          5  (difficulty 8/10 — ranged, teleports)
const BASE_GOBLIN_WEIGHTS: Array<{ kind: EnemyKind; weight: number }> = [
  { kind: "earth-goblin",        weight: 20 },
  { kind: "fire-goblin",         weight: 17 },
  { kind: "water-goblin",        weight: 17 },
  { kind: "earth-goblin-knives", weight: 12 },
  { kind: "water-goblin-spear",  weight:  8 },
  { kind: "stone-goblin",        weight:  6 },
  { kind: "pink-goblin",         weight:  5 },
];

/**
 * Get floor-adjusted goblin weights.
 * - Floors 1–2: Only earth, fire, water goblins
 * - Floors 3–4: Add earth-knives; water-spear at half weight; no stone/pink
 * - Floors 5–6: Normal weighted pool
 * - Floors 7–8: Double stone & pink weight
 * - Floors 9–10: Triple stone & pink weight
 */
function getFloorGoblinWeights(floor: number): Array<{ kind: EnemyKind; weight: number }> {
  return BASE_GOBLIN_WEIGHTS.map(({ kind, weight }) => {
    if (floor <= 2) {
      // Only earth, fire, water
      if (kind === "earth-goblin-knives" || kind === "water-goblin-spear" ||
          kind === "stone-goblin" || kind === "pink-goblin") {
        return { kind, weight: 0 };
      }
    } else if (floor <= 4) {
      // Add knives; spear at half; no stone/pink
      if (kind === "stone-goblin" || kind === "pink-goblin") {
        return { kind, weight: 0 };
      }
      if (kind === "water-goblin-spear") {
        return { kind, weight: Math.floor(weight / 2) };
      }
    } else if (floor <= 6) {
      // Normal weights — no adjustment
    } else if (floor <= 8) {
      // Double stone & pink
      if (kind === "stone-goblin" || kind === "pink-goblin") {
        return { kind, weight: weight * 2 };
      }
    } else {
      // Floors 9+: Triple stone & pink
      if (kind === "stone-goblin" || kind === "pink-goblin") {
        return { kind, weight: weight * 3 };
      }
    }
    return { kind, weight };
  }).filter(g => g.weight > 0);
}

function pickWeightedGoblin(
  weights: Array<{ kind: EnemyKind; weight: number }>,
  totalWeight: number,
  rng: () => number,
): EnemyKind {
  let roll = rng() * totalWeight;
  for (const { kind, weight } of weights) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return weights[0].kind; // safety fallback
}

/**
 * Get ghost count for a given floor.
 * - Floors 1–3: 0 ghosts
 * - Floor 4: 1 ghost
 * - Floors 5–6: 1 ghost
 * - Floors 7–8: 1–2 ghosts
 * - Floors 9–10: 2 ghosts
 * When no floor is provided (single-level daily), uses legacy 1–2 ghosts.
 */
function getGhostCount(floor: number | undefined, rng: () => number): number {
  if (floor === undefined) return 1 + (rng() < 0.5 ? 0 : 1); // legacy: 1–2
  if (floor <= 3) return 0;
  if (floor <= 6) return 1;
  if (floor <= 8) return 1 + (rng() < 0.5 ? 0 : 1); // 1–2
  return 2;
}

export function enemyTypeAssignement(
  enemies: Enemy[],
  opts?: { rng?: () => number; floor?: number }
): void {
  const rng = opts?.rng ?? Math.random;
  const floor = opts?.floor;
  const target = enemies.length;
  if (target === 0) return;

  // Get floor-adjusted goblin weights
  const goblinWeights = floor !== undefined
    ? getFloorGoblinWeights(floor)
    : BASE_GOBLIN_WEIGHTS;
  const totalGoblinWeight = goblinWeights.reduce((sum, g) => sum + g.weight, 0);

  // Determine goblin count: 4–6 (base), scaling with floor
  const baseGoblinCount = 4 + Math.floor(rng() * 3); // 4, 5, or 6
  const goblinCount = Math.min(target, baseGoblinCount);

  // Ghost count based on floor
  const ghostCount = Math.min(target - goblinCount, getGhostCount(floor, rng));

  // Build pool: weighted goblin types (harder = less frequent)
  const pool: EnemyKind[] = [];
  for (let i = 0; i < goblinCount; i++) {
    pool.push(pickWeightedGoblin(goblinWeights, totalGoblinWeight, rng));
  }
  for (let i = 0; i < ghostCount; i++) {
    pool.push("ghost");
  }

  // If pool is still smaller than target, fill with weighted goblins
  while (pool.length < target) {
    pool.push(pickWeightedGoblin(goblinWeights, totalGoblinWeight, rng));
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
