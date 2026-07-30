// Reproduce which daily boss entrance a given date rolled, WITHOUT relying on any
// player's analytics — the entrance is fully deterministic from the date, so we can
// replay the exact generation chain and read it straight off, the same way
// daily_chest.ts replays allocateChestsAndKeys() for the Level 2 bomb question.
//
// This is more robust than reading it out of `game_complete` rows: a `bossEntranceKind`
// value only exists on a player's row if THAT player actually reached floor 3 that day.
// If nobody did (or nobody has played yet), the analytics-derived answer would be
// silently missing. Replaying the generator answers "what did today roll" independent
// of whether anyone got there.
//
// The chain matches the real daily flow exactly:
//   f1 = seeded initializeGameStateForMultiTier(1)
//   f2 = advanceToNextFloor(f1, seed)   -- floor 2, seeded floorSeed = seed + 2
//   f3 = advanceToNextFloor(f2, seed)   -- floor 3, where the boss entrance is rolled
// (components/TilemapGrid.tsx calls advanceToNextFloor(gameState, hashStringToSeed(day))
// at each exit, so this replay is byte-for-byte what every player's browser computed.)

import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
} from "../map/game-state";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../rng";
import { bossInfo, type BossKind } from "../bosses/boss_roster";

export type BossEntranceKind = "bomb" | "douse" | "moat-lava" | "moat-water";

export interface BossDayInfo {
  /** Which of the four doors today rolled; null on a day with no boss room at all. */
  entranceKind: BossEntranceKind | null;
  /** Which elemental Shaper arena that entrance opens into. Meaningless for the Fisher. */
  arenaSeed: "water" | "lava" | null;
  /**
   * WHICH boss the day holds. Replayed rather than read off analytics for the same reason as
   * the entrance: a player's row only carries it if that player reached floor 3, so on a day
   * nobody has played yet the analytics answer would be silently missing.
   */
  bossKind: BossKind | null;
  /** The boss's three-emoji signature, or null on a bossless day. */
  bossEmoji: string | null;
  /** Display name, e.g. "The Fisher". */
  bossName: string | null;
}

/**
 * Compute the day's boss-entrance kind for a daily run identified by its local date
 * string (YYYY-MM-DD, the same value stored on analytics as `date_seed`).
 */
export function bossDayInfoForDate(dateStr: string): BossDayInfo {
  const seed = hashStringToSeed(dateStr);
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1)
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  const bossKind = f3.dailyBossKind ?? null;
  const info = bossInfo(bossKind);
  return {
    entranceKind: f3.bossEntranceKind ?? null,
    arenaSeed: f3.bossArenaSeed ?? null,
    bossKind,
    bossEmoji: info ? info.emoji.join("") : null,
    bossName: info?.displayName ?? null,
  };
}
