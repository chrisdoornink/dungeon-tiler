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

// Base spawn weights by difficulty (easier = higher weight):
//   earth-goblin:        20  (difficulty 2/10 — low HP, low attack)
//   fire-goblin:         17  (difficulty 3/10 — balanced baseline)
//   water-goblin:        17  (difficulty 3/10 — tanky but weak attack)
//   earth-goblin-knives: 12  (difficulty 4/10 — low HP, high attack)
//   water-goblin-spear:   9  (difficulty 6/10 — high HP + high attack; boosted late)
//   stone-goblin:         6  (difficulty 7/10 — 1 melee dmg, needs runes; avoidable)
//   pink-goblin:          8  (difficulty 8/10 — ranged, teleports; hardest to fight)
const BASE_GOBLIN_WEIGHTS: Array<{ kind: EnemyKind; weight: number }> = [
  { kind: "earth-goblin",        weight: 20 },
  { kind: "fire-goblin",         weight: 17 },
  { kind: "water-goblin",        weight: 17 },
  { kind: "earth-goblin-knives", weight: 12 },
  { kind: "water-goblin-spear",  weight:  9 },
  { kind: "stone-goblin",        weight:  6 },
  { kind: "pink-goblin",         weight:  8 },
];

/**
 * Get floor-adjusted goblin weights for 3-level daily mode.
 * - Floor 1: Only basic goblins (fire, water, earth) without weapons
 * - Floors 2–3: Mixed advanced goblins (pink, earth-knives, water-spear, stone, fire)
 */
function getFloorGoblinWeights(floor: number): Array<{ kind: EnemyKind; weight: number }> {
  return BASE_GOBLIN_WEIGHTS.map(({ kind, weight }) => {
    if (floor === 1) {
      // Floor 1: Only basic goblins (fire, water, earth) - no weapons
      if (kind === "earth-goblin-knives" || kind === "water-goblin-spear" ||
          kind === "stone-goblin" || kind === "pink-goblin") {
        return { kind, weight: 0 };
      }
    } else if (floor === 2 || floor === 3) {
      // Floors 2 & 3: Mixed advanced goblins (pink, earth-knives, water-spear, stone, fire)
      // Drop basic water and earth goblins to make room for advanced types
      if (kind === "water-goblin" || kind === "earth-goblin") {
        return { kind, weight: 0 };
      }
      // Equal weight for all advanced types
      return { kind, weight: 15 };
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
 * - 3-level daily mode (floors 1–3): 0–1 ghosts randomly
 * When no floor is provided (single-level daily), uses legacy 1–2 ghosts.
 */
function getGhostCount(floor: number | undefined, rng: () => number): number {
  if (floor === undefined) return 1 + (rng() < 0.5 ? 0 : 1); // legacy: 1–2
  // 3-level daily mode: 0–1 ghosts on any floor
  return Math.floor(rng() * 2); // 0 or 1
}

export function enemyTypeAssignement(
  enemies: Enemy[],
  opts?: { rng?: () => number; floor?: number }
): number {
  const rng = opts?.rng ?? Math.random;
  const floor = opts?.floor;
  const target = enemies.length;

  // Ghost count is additive — does not consume goblin slots
  const ghostCount = getGhostCount(floor, rng);

  if (target === 0) return ghostCount;

  // Get floor-adjusted goblin weights
  const goblinWeights = floor !== undefined
    ? getFloorGoblinWeights(floor)
    : BASE_GOBLIN_WEIGHTS;
  const totalGoblinWeight = goblinWeights.reduce((sum, g) => sum + g.weight, 0);

  // Fill all enemy slots with goblins
  const pool: EnemyKind[] = [];
  for (let i = 0; i < target; i++) {
    pool.push(pickWeightedGoblin(goblinWeights, totalGoblinWeight, rng));
  }

  // Shuffle pool with Fisher–Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Assign goblin kinds to enemies
  for (let i = 0; i < enemies.length; i++) {
    enemies[i].kind = pool[i] ?? "fire-goblin"; // safety fallback
  }

  // Return ghost count so callers can place additional ghost enemies
  return ghostCount;
}
