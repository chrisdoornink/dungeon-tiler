import { parsePuzzleRoom } from "../../lib/puzzles/rooms";
import { CHAIN_ROOMS } from "../../lib/puzzles/chain_rooms";
import { solvePuzzleRoom } from "../../lib/puzzles/solver";

/**
 * The multi-element calibration rooms. These are tuned by human playtest, so the test deliberately
 * does NOT pin difficulty or turn count (that would fight the feedback loop) — it only guards that
 * each room is well-formed and actually solvable, so a broken room never reaches the bench.
 */
describe("chain rooms", () => {
  for (const spec of CHAIN_ROOMS) {
    it(`${spec.name} parses and is solvable`, () => {
      const parsed = parsePuzzleRoom(spec);
      const r = solvePuzzleRoom(parsed, { maxStates: 300_000, maxTurns: 200 });
      expect(r.solvable).toBe(true);
      expect(r.capped).toBe(false);
    });
  }
});
