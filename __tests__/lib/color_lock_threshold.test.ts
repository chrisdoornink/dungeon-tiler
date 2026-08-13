import { colorLockSatisfied } from "../../lib/map/machinery";
import type { ColorLock } from "../../lib/map/types";
import { parsePuzzleRoom, type PuzzleRoomSpec } from "../../lib/puzzles/rooms";
import { solvePuzzleRoom } from "../../lib/puzzles/solver";

/**
 * The `threshold` colour-lock rule — the OR / k-of-n gate. It fills the one combinational gap in the
 * machinery: we already had AND (`match`, every switch on target), XNOR (`allEqual`), and NOT (an
 * inverted door). `threshold` with k=1 is OR, k=n is AND, values between are "any k of n". It reuses
 * the whole existing stack (dispatch, solver keying, reflex verifier), so these tests pin the
 * predicate itself and one end-to-end parse+solve.
 */
function lock(states: number[], target: number[], k: number): ColorLock {
  return {
    id: "cl0",
    switches: states.map((_, i) => [0, i] as [number, number]),
    colors: 2,
    states,
    rule: "threshold",
    target,
    k,
    platforms: [],
    gates: [],
    invertedGates: [],
  };
}

describe("threshold colour-lock rule", () => {
  it("k=1 behaves as OR", () => {
    const t = [1, 1, 1];
    expect(colorLockSatisfied(lock([0, 0, 0], t, 1))).toBe(false);
    expect(colorLockSatisfied(lock([1, 0, 0], t, 1))).toBe(true);
    expect(colorLockSatisfied(lock([0, 0, 1], t, 1))).toBe(true);
  });

  it("k=n behaves as AND", () => {
    const t = [1, 1, 1];
    expect(colorLockSatisfied(lock([1, 1, 0], t, 3))).toBe(false);
    expect(colorLockSatisfied(lock([1, 1, 1], t, 3))).toBe(true);
  });

  it("1 < k < n is a genuine k-of-n", () => {
    const t = [1, 1, 1];
    expect(colorLockSatisfied(lock([1, 0, 0], t, 2))).toBe(false);
    expect(colorLockSatisfied(lock([1, 1, 0], t, 2))).toBe(true);
    expect(colorLockSatisfied(lock([1, 1, 1], t, 2))).toBe(true);
  });

  it("parses and solves an OR-gated room through the real engine", () => {
    // Two colour switches OR-drive one door; turning EITHER to colour 1 opens it. The door ('^' shut
    // at the all-0 start) guards the key + exit, so the room is solvable and the OR gate is exercised.
    const spec: PuzzleRoomSpec = {
      name: "OR gate probe",
      asks: "threshold k=1 (OR) opens the door when either switch turns.",
      map: ["########", "#HCC^kE#", "########"],
      trackOver: "lava",
      colorLocks: [
        {
          switches: [
            [1, 2],
            [1, 3],
          ],
          colors: 2,
          rule: "threshold",
          target: [1, 1],
          k: 1,
          initial: [0, 0],
          gates: [[1, 4]],
        },
      ],
      sword: true,
      shield: true,
    };
    expect(() => parsePuzzleRoom(spec)).not.toThrow();
    const solved = solvePuzzleRoom(parsePuzzleRoom(spec), { maxStates: 60_000, maxTurns: 100 });
    expect(solved.solvable).toBe(true);
    expect(solved.capped).toBe(false);
  });

  it("rejects a threshold k out of range at parse", () => {
    const spec: PuzzleRoomSpec = {
      name: "bad k",
      asks: "",
      map: ["######", "#HC^E#", "######"],
      trackOver: "lava",
      colorLocks: [
        {
          switches: [[1, 2]],
          colors: 2,
          rule: "threshold",
          target: [1],
          k: 2, // only one switch — k=2 is impossible
          gates: [[1, 3]],
        },
      ],
    };
    expect(() => parsePuzzleRoom(spec)).toThrow(/threshold k/);
  });
});
