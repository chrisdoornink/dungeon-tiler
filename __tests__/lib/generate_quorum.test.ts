import { generateQuorumRoom } from "../../lib/puzzles/generate_quorum";
import { parsePuzzleRoom, puzzleRoomToGameState } from "../../lib/puzzles/rooms";
import {
  movePlayer,
  performWait,
  type GameState,
} from "../../lib/map/game-state";
import { solvePuzzleRoom, type Action } from "../../lib/puzzles/solver";
import { reflexSolves } from "../../lib/puzzles/verify";
import { colorLockSatisfied } from "../../lib/map/machinery";

/**
 * The Quorum — the first LOGIC-GATE-family template, a 2-of-3 majority (threshold) gate. Its guaranteed
 * properties: it is a well-formed, solvable room whose own solution wins; NEITHER mindless policy
 * (nearest- or farthest-switch) can beat it; the `threshold` rule is essential (the AND / 3-of-3 form
 * of the same room is unsolvable); every switch is load-bearing; and the intended line is the
 * anchor-shuttle (majority breaks and restores twice while one switch stays pinned).
 */
function replay(
  spec: ReturnType<typeof generateQuorumRoom>["spec"],
  solution: Action[]
): GameState {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
  }
  return s;
}

describe("generateQuorumRoom", () => {
  it("is deterministic — the same seed rebuilds the identical room", () => {
    const a = generateQuorumRoom(4);
    const b = generateQuorumRoom(4);
    expect(b.spec).toEqual(a.spec);
    expect(b.solution).toEqual(a.solution);
  });

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}: certifies a well-formed room its own solution wins`, () => {
      const r = generateQuorumRoom(seed);
      expect(() => parsePuzzleRoom(r.spec)).not.toThrow();

      const flat = r.spec.map.join("");
      expect((flat.match(/H/g) ?? []).length).toBe(1);
      expect((flat.match(/E/g) ?? []).length).toBe(1);
      expect((flat.match(/k/g) ?? []).length).toBe(1);
      expect((flat.match(/C/g) ?? []).length).toBe(3); // three colour switches

      const w = r.spec.map[0].length;
      expect(r.spec.map.every((row) => row.length === w)).toBe(true);
      expect(r.spec.map[0]).toMatch(/^#+$/);
      expect(r.spec.map[r.spec.map.length - 1]).toMatch(/^#+$/);

      // One threshold lock: 2-of-3 majority over the three switches, two colours.
      expect(r.spec.colorLocks?.length).toBe(1);
      const lock = r.spec.colorLocks![0];
      expect(lock.rule).toBe("threshold");
      expect(lock.k).toBe(2);
      expect(lock.colors).toBe(2);
      expect(lock.switches.length).toBe(3);
      expect(lock.target).toEqual([1, 1, 1]);

      expect(r.spec.sword).toBe(true);
      expect(r.spec.shield).toBe(true);

      expect(r.minTurns).toBeGreaterThanOrEqual(20);
      const final = replay(r.spec, r.solution);
      expect(final.win).toBe(true);
      expect(final.heroHealth ?? 0).toBeGreaterThan(0);
    });
  }

  it("no mindless line wins — neither nearest- nor farthest-switch reflex can solve it", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = generateQuorumRoom(seed);
      expect(
        solvePuzzleRoom(parsePuzzleRoom(r.spec), { maxStates: 120_000, maxTurns: 200 }).solvable
      ).toBe(true);
      expect(reflexSolves(r.spec, "nearest")).toBe(false);
      expect(reflexSolves(r.spec, "farthest")).toBe(false);
    }
  });

  it("the threshold rule is essential — the AND (3-of-3) form of the same room is unsolvable", () => {
    // Rebuild the lock as rule "match" (every switch on target = AND). A majority has a spare switch
    // to pin while shuttling; AND has none, so the alternating-polarity corridor cannot be walked.
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = generateQuorumRoom(seed);
      const andForm = {
        ...r.spec,
        colorLocks: [{ ...r.spec.colorLocks![0], rule: "match" as const, k: undefined }],
      };
      const solved = solvePuzzleRoom(parsePuzzleRoom(andForm), {
        maxStates: 120_000,
        maxTurns: 200,
      });
      expect(solved.solvable).toBe(false);
      expect(solved.capped).toBe(false);
    }
  });

  it("every switch is load-bearing — dropping any one leaves the room unsolvable", () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = generateQuorumRoom(seed);
      const lock = r.spec.colorLocks![0];
      const sw = lock.switches;
      const init = lock.initial ?? [1, 1, 0];
      for (let i = 0; i < 3; i++) {
        const keep = [0, 1, 2].filter((j) => j !== i);
        const map = r.spec.map.map((row, y) =>
          y === sw[i][0] ? row.slice(0, sw[i][1]) + "." + row.slice(sw[i][1] + 1) : row
        );
        const variant = {
          ...r.spec,
          map,
          colorLocks: [
            {
              switches: keep.map((j) => sw[j]),
              colors: 2,
              rule: "threshold" as const,
              target: [1, 1],
              k: 2,
              initial: keep.map((j) => init[j]),
              gates: lock.gates,
              invertedGates: lock.invertedGates,
            },
          ],
        };
        const solo = solvePuzzleRoom(parsePuzzleRoom(variant), {
          maxStates: 120_000,
          maxTurns: 200,
        });
        expect(solo.solvable).toBe(false);
        expect(solo.capped).toBe(false);
      }
    }
  });

  it("the intended line is an anchor-shuttle (majority breaks and restores twice, one switch pinned)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = generateQuorumRoom(seed);
      // The satisfied trace over the solution: satisfied, broken, restored, broken, restored.
      let s = puzzleRoomToGameState(parsePuzzleRoom(r.spec));
      const sat = () => (colorLockSatisfied(s.colorLocks![0]) ? "T" : "F");
      let trace = sat();
      for (const a of r.solution) {
        if (a.kind === "move") s = movePlayer(s, a.dir);
        else if (a.kind === "wait") s = performWait(s);
        trace += sat();
      }
      expect(trace).toMatch(/^T+F+T+F+T+$/);
      // Exactly one switch is never pressed — the held anchor — and the other two shuttle twice each.
      expect(r.meta.anchorHeld).toBe(true);
      expect(r.meta.presses.filter((p) => p === 0).length).toBe(1);
      expect(r.meta.presses.filter((p) => p >= 2).length).toBe(2);
    }
  });
});
