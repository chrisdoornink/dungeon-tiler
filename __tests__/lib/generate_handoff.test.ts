import { generateHandoffRoom } from "../../lib/puzzles/generate_handoff";
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
 * The Colour Airlock (Handoff) generator: two colour switches on one allEqual(2-colour) lock driving
 * three doors, so the solution is a non-monotone break-and-restore across three rooms. The
 * guarantees to pin are the same shape as the Shuttle's — determinism, well-formedness, a winning
 * replay — plus the ones that make it a PUZZLE: no mindless (<=1 actuation per switch) line wins,
 * both switches are load-bearing, and the lock genuinely goes matched -> broken -> matched.
 */
function replay(
  spec: ReturnType<typeof generateHandoffRoom>["spec"],
  solution: Action[]
): GameState {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
  }
  return s;
}

describe("generateHandoffRoom", () => {
  it("is deterministic — the same seed rebuilds the identical room", () => {
    const a = generateHandoffRoom(4);
    const b = generateHandoffRoom(4);
    expect(b.spec).toEqual(a.spec);
    expect(b.solution).toEqual(a.solution);
  });

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}: certifies a well-formed room its own solution wins`, () => {
      const r = generateHandoffRoom(seed);
      expect(() => parsePuzzleRoom(r.spec)).not.toThrow();

      const flat = r.spec.map.join("");
      expect((flat.match(/H/g) ?? []).length).toBe(1);
      expect((flat.match(/E/g) ?? []).length).toBe(1);
      expect((flat.match(/k/g) ?? []).length).toBe(1);
      expect((flat.match(/C/g) ?? []).length).toBe(2); // exactly two colour switches

      const w = r.spec.map[0].length;
      expect(r.spec.map.every((row) => row.length === w)).toBe(true);
      expect(r.spec.map[0]).toMatch(/^#+$/);
      expect(r.spec.map[r.spec.map.length - 1]).toMatch(/^#+$/);

      // The single lock is a two-colour allEqual over both switches — pinning colors===2 keeps the
      // requires-logic bar fully sound (a 3+ colour dial has a mindless-mash blind spot).
      expect(r.spec.colorLocks?.length).toBe(1);
      expect(r.spec.colorLocks![0].colors).toBe(2);
      expect(r.spec.colorLocks![0].rule).toBe("allEqual");
      expect(r.spec.colorLocks![0].switches.length).toBe(2);

      expect(r.spec.sword).toBe(true);
      expect(r.spec.shield).toBe(true);

      expect(r.minTurns).toBeGreaterThan(0);
      const final = replay(r.spec, r.solution);
      expect(final.win).toBe(true);
      expect(final.heroHealth ?? 0).toBeGreaterThan(0);
    });
  }

  it("no mindless line wins — the reflex agent cannot solve it", () => {
    // The requires-logic bar (verify.ts): a faithfully mindless player — walk to the goal, and when
    // a door blocks you step on the nearest switch — cannot beat it. Blindly pressing the near
    // switch just loops; you have to reason your way to the far switch. (This is exactly what the
    // single-switch Shuttle fails, and why it is only a baseline.)
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = generateHandoffRoom(seed);
      expect(
        solvePuzzleRoom(parsePuzzleRoom(r.spec), { maxStates: 120_000, maxTurns: 200 }).solvable
      ).toBe(true);
      expect(reflexSolves(r.spec)).toBe(false);
    }
  });

  it("both switches are load-bearing — disabling either strands the hero", () => {
    // Neither switch alone reduces the room to a Shuttle. Rewrite one switch's tile to floor and let
    // the other drive a single-switch match lock: the two doors it must open are opposite-polarity
    // and in series, so no lone-switch line reaches the key. Unsolvable, conclusively.
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = generateHandoffRoom(seed);
      const lock = r.spec.colorLocks![0];
      const [Ca, Cb] = lock.switches;
      for (const [keep, drop] of [
        [Cb, Ca],
        [Ca, Cb],
      ] as Array<[[number, number], [number, number]]>) {
        const map = r.spec.map.map((row, y) =>
          y === drop[0] ? row.slice(0, drop[1]) + "." + row.slice(drop[1] + 1) : row
        );
        const variant = {
          ...r.spec,
          map,
          colorLocks: [
            {
              switches: [keep],
              colors: 2,
              rule: "match" as const,
              target: [0],
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

  it("the intended line breaks the match and restores it (non-monotone)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = generateHandoffRoom(seed);
      // Trace the lock's satisfaction across the solution: matched, then broken, then matched again.
      let s = puzzleRoomToGameState(parsePuzzleRoom(r.spec));
      const sat = () => (colorLockSatisfied(s.colorLocks![0]) ? "T" : "F");
      let trace = sat();
      for (const a of r.solution) {
        if (a.kind === "move") s = movePlayer(s, a.dir);
        else if (a.kind === "wait") s = performWait(s);
        trace += sat();
      }
      expect(trace).toMatch(/^T+F+.*T$/);
      expect(r.meta.caPresses).toBeGreaterThanOrEqual(2);
      expect(r.meta.cbPresses).toBeGreaterThanOrEqual(2);
    }
  });
});
