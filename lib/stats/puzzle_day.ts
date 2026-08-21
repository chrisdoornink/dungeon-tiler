// The day's PUZZLES, recomputed from the daily seed the same way boss_day.ts recomputes the boss and
// daily_chest.ts recomputes the Level 2 chests — a deterministic fact about the DAY, reliable even if
// nobody that day reached the floor to record it in analytics.
//
// FORWARD-ONLY: recomputation reflects the CURRENT generator, so a day whose live generator differed
// would be misreported. The cipher-room variant shipped 2026-08-21, so tracking starts there; older
// days return { tracked: false } rather than a guess. Any later change to puzzle generation must bump
// this date (or date-version the generator), exactly like the chest-pool discipline.
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../rng";
import {
  initializeGameStateForMultiTier,
  advanceToNextFloor,
  type GameState,
} from "../map/game-state";
import { SWITCH_GATE_START_DATE } from "../map";

export const PUZZLE_TRACKING_START_DATE = "2026-08-21";

export type ColorPuzzleKind = "all-same" | "cipher";

export interface PuzzleDayInfo {
  /** False for days before PUZZLE_TRACKING_START_DATE — not shown rather than guessed. */
  tracked: boolean;
  /** The run's one colour-switch puzzle (mandatory exit gate), or null. */
  colorPuzzle: { floor: number; kind: ColorPuzzleKind } | null;
  /** The run's rock/boot switch-gate (shortcut spike bed), or null. */
  switchGate: { floor: number; access: string } | null;
}

function colorPuzzleOf(s: GameState, floor: number): { floor: number; kind: ColorPuzzleKind } | null {
  const lock = (s.colorLocks ?? [])[0];
  if (!lock) return null;
  // "match" is the cipher room (a mural code); "allEqual" is the all-same-colour puzzle.
  return { floor, kind: lock.rule === "match" ? "cipher" : "all-same" };
}

export function puzzleDayInfoForDate(dateStr: string): PuzzleDayInfo {
  if (dateStr < PUZZLE_TRACKING_START_DATE) {
    return { tracked: false, colorPuzzle: null, switchGate: null };
  }
  const seed = hashStringToSeed(dateStr);
  // Enable switch gates exactly as the live daily does (date-gated) so the recomputed gate matches.
  // The switch gate is the floor's LAST shared-rng draw and the colour puzzle uses its own stream, so
  // enabling it never disturbs the colour-puzzle read.
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1, { switchGates: dateStr >= SWITCH_GATE_START_DATE })
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  // One colour-switch puzzle per run: floor 1 wins if it has one, else floor 2.
  const colorPuzzle = colorPuzzleOf(f1, 1) ?? colorPuzzleOf(f2, 2);
  // The switch gate is carried forward to the last floor.
  const sg = f3.switchGate;
  const switchGate = sg ? { floor: sg.floor, access: sg.access } : null;
  return { tracked: true, colorPuzzle, switchGate };
}
