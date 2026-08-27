// The daily-tuning v2 date gate: one switch for the 2026-08 balance patch, so the whole
// batch arrives together and history stays replayable.
//
// What v2 turns on (each mechanism lives with its own knobs, all gated on this flag):
//   - boosted white-goblin swarm rates            (lib/enemy_assignment.ts)
//   - path-biased enemy placement                 (lib/map/game-state.ts)
//   - water-goblin ambushers in big pools         (lib/map/game-state.ts)
//   - varied moat-water size/shape/corner         (lib/bosses/boss_entrances.ts)
//   - switch-gate near/far split, raised detour
//     ladder, and chest-target gates              (lib/map/switch-gates.ts)
//
// Why one gate instead of shipping raw: the daily map is generated CLIENT-SIDE from the
// date seed, so an ungated generation change splits the player base on deploy day — players
// who loaded before the deploy hold a different map from players after it, for the same
// date. Same rule as SWITCH_GATE_START_DATE (see the essay there): the date MUST be the day
// AFTER the merge that ships it, re-checked at merge time (pre-promote checklist).
//
// Unlike the switch-gate flag, v2 changes draws MID-STREAM (extra enemy placements shift
// every later roll on the floor), so the historical replayers in lib/stats must pass this
// flag per replayed date — boss_day.ts and puzzle_day.ts do. A replay with the wrong flag
// silently reconstructs a map nobody played.
export const DAILY_TUNING_V2_START_DATE = "2026-08-28";

/** Whether a daily date (YYYY-MM-DD, local) runs with the v2 tuning. */
export function dailyTuningV2ForDate(dateStr: string): boolean {
  return dateStr >= DAILY_TUNING_V2_START_DATE;
}
