import { Enemy } from "./enemy";
import { type EnemyKind } from "./enemies/registry";

/**
 * Assign swarm IDs to white goblin enemies.
 * Each group of 4 white goblins shares a unique swarmId stored in behaviorMemory.
 * Also sets the sidewaysFront flag randomly per member for consistent sideways rendering.
 */
export function assignWhiteGoblinSwarmIds(
  enemies: Enemy[],
  opts?: { rng?: () => number }
): void {
  const rng = opts?.rng ?? Math.random;
  const whiteGoblins = enemies.filter(e => e.kind === 'white-goblin');
  // Group them into batches of 4 and assign a shared swarmId
  for (let i = 0; i < whiteGoblins.length; i += 4) {
    const swarmId = `swarm-${Math.floor(rng() * 1000000)}`;
    for (let j = i; j < Math.min(i + 4, whiteGoblins.length); j++) {
      whiteGoblins[j].behaviorMemory.swarmId = swarmId;
      // Random sideways rendering choice (50/50 front vs back) per member
      whiteGoblins[j].behaviorMemory.sidewaysFront = rng() < 0.5;
    }
  }
}

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

/**
 * Get white goblin swarm count for a given floor.
 * Floor 1: 0 swarms
 * Floor 2: 1 swarm (10% chance)
 * Floor 3: any swarms (26% chance) 
 *  - 1 swarm (20% chance), 
 *  - 2 swarms (5% chance), 
 *  - 3 swarms (1% chance)
 * 
 * Uses multiple rng() calls for floor 3 to ensure independence from floor 2.
 * Until ready to deploy I'm keeping this simple and just returning 0 for all floors.
 */
function getWhiteGoblinSwarmCount(floor: number | undefined, rng: () => number): number {  
  if (floor === 1) return 0;
  if (floor === 2) return rng() < 0.1 ? 1 : 0;
  if (floor === 3) {
    const roll = rng();
    if (roll >= 0.08 && roll < 0.28) return 1;
    if (roll >= 0.29 && roll < 0.34) return 2;
    if (roll >= 0.35 && roll < 0.36) return 3;
    return 0;
  }
  
  return 0;
}

export function enemyTypeAssignement(
  enemies: Enemy[],
  opts?: { rng?: () => number; floor?: number }
): { ghostCount: number; whiteGoblinCount: number } {
  const rng = opts?.rng ?? Math.random;
  const floor = opts?.floor;
  const target = enemies.length;

  // Ghost count is additive — does not consume goblin slots
  const ghostCount = getGhostCount(floor, rng);
  // White goblin swarm count (each swarm = 4 members)
  const swarmCount = getWhiteGoblinSwarmCount(floor, rng);
  const whiteGoblinCount = swarmCount * 4;

  if (target === 0) return { ghostCount, whiteGoblinCount };

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

  // Return counts so callers can place additional ghost/white-goblin enemies
  return { ghostCount, whiteGoblinCount };
}
