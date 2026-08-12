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
    it(`${spec.name} parses into a well-formed room`, () => {
      const parsed = parsePuzzleRoom(spec);
      // A hero, a way out, and no wiring pointing at nothing (parsePuzzleRoom throws on the latter).
      expect(parsed.hero).toBeDefined();
      expect(spec.map.join("")).toContain("E");
    });

    // Solvability is only asserted for the deterministic rooms. Enemy rooms move under combatRng
    // and blow the search up, so they are judged by playtest — which is the point of these rooms.
    const hasEnemies = spec.map.join("").includes("g");
    (hasEnemies ? it.skip : it)(`${spec.name} is solvable`, () => {
      const r = solvePuzzleRoom(parsePuzzleRoom(spec), {
        maxStates: 300_000,
        maxTurns: 200,
      });
      expect(r.solvable).toBe(true);
      expect(r.capped).toBe(false);
    });
  }
});

/** Colour-lock authoring is validated at parse — a bad lock throws rather than shipping a dead or
 *  unsolvable room (the gaps the mechanic's verification pass flagged). */
describe("colour lock parse validation", () => {
  const base = {
    name: "bad",
    asks: "",
    trackOver: "lava" as const,
    map: ["#####", "#HCE#", "#####"], // C colour switch at (1,2)
  };

  it("rejects a rule:match lock with no target", () => {
    expect(() =>
      parsePuzzleRoom({
        ...base,
        colorLocks: [{ switches: [[1, 2]], rule: "match", platforms: [] }],
      })
    ).toThrow(/match/);
  });

  it("rejects the same switch wired to two locks", () => {
    expect(() =>
      parsePuzzleRoom({
        ...base,
        colorLocks: [
          { switches: [[1, 2]], rule: "allEqual" },
          { switches: [[1, 2]], rule: "allEqual" },
        ],
      })
    ).toThrow(/more than one lock/);
  });

  it("rejects a binary toggle wired onto a colour switch", () => {
    expect(() =>
      parsePuzzleRoom({
        ...base,
        toggles: [{ switchAt: [1, 2] }],
        colorLocks: [{ switches: [[1, 2]], rule: "allEqual" }],
      })
    ).toThrow(/colour switch/);
  });
});
