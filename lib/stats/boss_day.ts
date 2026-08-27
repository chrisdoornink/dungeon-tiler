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
import { dailyTuningV2ForDate } from "../map/daily_tuning";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../rng";
import { bossInfo, fisherRetiredForDate, type BossKind } from "../bosses/boss_roster";

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
 * Correct a replayed day against what players' clients actually rolled that morning.
 *
 * The replay below is only faithful while BOSS_ROSTER is the same SIZE it was on the date in
 * question: rollDailyBossKind is `floor(rand * BOSS_KINDS.length)`, so adding a boss re-indexes
 * the same seeded draw and silently rewrites history. Taking the roster from 2 to 4 (the
 * Coilwyrm and the Quarrymaster) moved 2026-07-30 from the Shaper to the Fisher, and would
 * have shown days as bosses that did not exist yet on those days.
 *
 * A player's stored `daily_boss_kind` is not a replay — it is what their browser computed under
 * the roster that was live — so it is authoritative and wins whenever we have one. Majority
 * rather than first-seen so a single malformed row cannot relabel a day.
 *
 * Falls back to the replay when no row that day carries a value, which is the case the replay
 * exists for: nobody reached floor 3, or nobody has played yet.
 */
export function reconcileBossDay(
  replayed: BossDayInfo,
  recorded: Array<string | null | undefined>
): BossDayInfo {
  const tally = new Map<string, number>();
  for (const kind of recorded) {
    if (!kind) continue;
    if (!bossInfo(kind)) continue; // ignore values no longer in the roster
    tally.set(kind, (tally.get(kind) ?? 0) + 1);
  }
  if (tally.size === 0) return replayed;

  let best: string | null = null;
  let bestCount = 0;
  for (const [kind, count] of tally) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  const info = bossInfo(best);
  if (!info) return replayed;

  return {
    ...replayed,
    bossKind: info.kind,
    bossEmoji: info.emoji.join(""),
    bossName: info.displayName,
  };
}

/**
 * Compute the day's boss-entrance kind for a daily run identified by its local date
 * string (YYYY-MM-DD, the same value stored on analytics as `date_seed`).
 */
export function bossDayInfoForDate(dateStr: string): BossDayInfo {
  const seed = hashStringToSeed(dateStr);
  // tuningV2 must mirror what players' clients ran on that date: it changes draws
  // mid-stream (extra enemy placements) and can even change which entrance PLACED via the
  // moat-variance fallback path, so replaying a post-gate date without it reconstructs a
  // floor 3 nobody saw. Switch gates stay un-passed here on purpose — they are the floor's
  // LAST draw and cannot move anything this replay reads.
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1, {
      tuningV2: dailyTuningV2ForDate(dateStr),
      fisherRetired: fisherRetiredForDate(dateStr),
    })
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
