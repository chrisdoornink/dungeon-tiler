/**
 * Server-side plausibility validation for endless-mode runs.
 *
 * The leaderboard score is the floor count the SERVER witnessed via sequential
 * checkpoints — never the client's claim. These checks bound each checkpoint
 * against what the game's own generation rules make possible. Violations flag
 * the run silently (shadow-flag) rather than rejecting loudly, so a forger
 * gets no feedback about which rule tripped.
 *
 * All bounds are derived from lib/map/endless.ts and deliberately GENEROUS —
 * a false flag on a real player is far worse than a cheater slipping past
 * these and into the timing/sequence checks.
 */

export interface CheckpointStats {
  steps: number;
  enemiesDefeated: number;
  damageDealt: number;
  damageTaken: number;
  hasSword: boolean;
  hasShield: boolean;
  heroMaxHealth: number;
}

export interface RunRecord {
  playerId: string;
  floor: number; // highest floor the server has verified entry into
  startedAt: number; // ms epoch
  lastCheckpointAt: number; // ms epoch
  steps: number;
  enemiesDefeated: number;
  damageDealt: number;
  damageTaken: number;
  flags: string[];
  submittedAt?: number;
}

// A floor takes real time: even a speedrunner holding run must cross the map,
// find the exit key, and reach the exit. Turn-based movement at ~10 moves/sec
// over a minimum ~10-15 tile route makes 4s a very conservative lower bound.
export const MIN_SECONDS_PER_FLOOR = 4;

// Minimum steps to clear any floor: spawn → exit key → exit on a 16x16+ map.
// Real routes run 20+; 8 tolerates absurd luck.
export const MIN_STEPS_PER_FLOOR = 8;

/**
 * Maximum enemies that can possibly exist on endless floor f, with margin:
 * goblins min(1+f,12)+1, ghosts (2 corner wisps on f1; 1-2 early, 2-3 deep),
 * white goblin swarms (phase 2: 1x4, phase 3: up to 3x4), snakes (up to 3 deep).
 */
export function maxKillsOnFloor(floor: number): number {
  const goblins = Math.min(1 + floor, 12) + 1;
  const ghosts = floor === 1 ? 2 : floor <= 6 ? 2 : 3;
  const swarmGoblins = floor <= 2 ? 0 : floor <= 6 ? 4 : 12;
  const snakes = floor === 1 ? 0 : floor <= 6 ? 1 : 3;
  return goblins + ghosts + swarmGoblins + snakes;
}

/** Cumulative kill ceiling through the end of floor f (inclusive). */
export function maxKillsThroughFloor(floor: number): number {
  let total = 0;
  for (let f = 1; f <= floor; f++) total += maxKillsOnFloor(f);
  return total;
}

/**
 * Max hearts by the time the hero ENTERS `floor`: base 5, +1 per extra-heart
 * chest (every 5th completed floor), +1 margin for mechanics beyond this
 * module's knowledge (e.g. secret-realm rewards).
 */
export function maxHeartsEnteringFloor(floor: number): number {
  return 5 + Math.floor((floor - 1) / 5) + 1;
}

/**
 * Validate a checkpoint claiming entry into `floor`, against the last verified
 * run state. Returns flags (empty = clean). The caller advances the verified
 * floor ONLY when clean; a flagged run keeps its old verified floor.
 */
export function validateCheckpoint(
  run: RunRecord,
  floor: number,
  stats: CheckpointStats,
  now: number
): string[] {
  const flags: string[] = [];

  // Floors only ever advance. A gap of more than one floor is tolerated (a
  // dropped checkpoint request must not poison an honest run) — but the
  // timing and step minimums below must then cover the WHOLE gap, so gaps
  // never let a forger advance faster than real play allows.
  const gap = floor - run.floor;
  if (gap < 1) {
    flags.push(`sequence:${run.floor}->${floor}`);
  }

  // Faster than any human path through the intervening floor(s).
  const elapsedSec = (now - run.lastCheckpointAt) / 1000;
  if (gap >= 1 && elapsedSec < gap * MIN_SECONDS_PER_FLOOR) {
    flags.push(`timing:${elapsedSec.toFixed(1)}s/${gap}f`);
  }

  // Stats only ever accumulate.
  if (
    stats.steps < run.steps ||
    stats.enemiesDefeated < run.enemiesDefeated ||
    stats.damageDealt < run.damageDealt ||
    stats.damageTaken < run.damageTaken
  ) {
    flags.push("stats:regressed");
  }

  // Must have walked the intervening floor(s).
  if (gap >= 1 && stats.steps - run.steps < gap * MIN_STEPS_PER_FLOOR) {
    flags.push(`steps:+${stats.steps - run.steps}/${gap}f`);
  }

  // Can't have killed more than could ever have spawned so far.
  if (stats.enemiesDefeated > maxKillsThroughFloor(floor - 1)) {
    flags.push(`kills:${stats.enemiesDefeated}`);
  }

  // Item legality: sword chest lands on floors 2-4, shield 3-6 — entering
  // floor f means floors 1..f-1 are complete, so the earliest carry-ins are
  // f>=3 and f>=4 respectively.
  if (stats.hasSword && floor < 3) flags.push("item:sword-early");
  if (stats.hasShield && floor < 4) flags.push("item:shield-early");

  if (stats.heroMaxHealth > maxHeartsEnteringFloor(floor)) {
    flags.push(`hearts:${stats.heroMaxHealth}`);
  }

  return flags;
}

/**
 * Validate the final submission against the last verified checkpoint state.
 * The score is run.floor regardless — these flags only decide whether the
 * run may enter the public board.
 */
export function validateSubmission(
  run: RunRecord,
  finalStats: CheckpointStats
): string[] {
  const flags: string[] = [];
  if (run.submittedAt) flags.push("submit:duplicate");
  if (
    finalStats.steps < run.steps ||
    finalStats.enemiesDefeated < run.enemiesDefeated
  ) {
    flags.push("submit:stats-regressed");
  }
  // Death on the verified floor can add at most one more floor's worth of kills.
  if (finalStats.enemiesDefeated > maxKillsThroughFloor(run.floor)) {
    flags.push(`submit:kills:${finalStats.enemiesDefeated}`);
  }
  return flags;
}

/** Display-name hygiene: trim, strip angle brackets/control chars, cap length. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[<>\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}
