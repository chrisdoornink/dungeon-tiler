import { parsePuzzleRoom, puzzleRoomToGameState } from "../../lib/puzzles/rooms";
import {
  generateFerryRoom,
  generateVerifiedFerry,
  stripPlatforms,
  difficultyTier,
} from "../../lib/puzzles/generate";
import { solvePuzzleRoom } from "../../lib/puzzles/solver";
import {
  movePlayer,
  performWait,
  type GameState,
} from "../../lib/map/game-state";
import type { Action } from "../../lib/puzzles/solver";

/**
 * Phase 2: a single-idiom generator (the lava Ferry) that builds from a known solution and is
 * certified by the solver. The properties that make a generated room a real puzzle:
 *  - it is genuinely solvable (the solver proves it, not the generator's optimism), and
 *  - the mechanic is REQUIRED — strip the platform and the room becomes unsolvable, so the raft is
 *    the crossing, not a decorative alternative.
 */

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

function replay(spec: ReturnType<typeof generateFerryRoom>, solution: Action[]): GameState {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
    else s = movePlayer(s, a.dir); // ferries never emit throws; keep the replay total
  }
  return s;
}

describe("generateFerryRoom", () => {
  it("is deterministic — the same seed yields an identical room", () => {
    for (const seed of [1, 7, 42]) {
      expect(generateFerryRoom(seed)).toEqual(generateFerryRoom(seed));
    }
  });

  it("produces a parseable, rectangular, fully-walled room", () => {
    for (const seed of SEEDS) {
      const spec = generateFerryRoom(seed);
      const w = spec.map[0].length;
      expect(spec.map.every((row) => row.length === w)).toBe(true);
      expect(spec.map[0]).toMatch(/^#+$/);
      expect(spec.map[spec.map.length - 1]).toMatch(/^#+$/);
      expect(() => parsePuzzleRoom(spec)).not.toThrow();
      // Exactly one hero, one exit, one exit key, one rail.
      const flat = spec.map.join("");
      expect((flat.match(/H/g) ?? []).length).toBe(1);
      expect((flat.match(/E/g) ?? []).length).toBe(1);
      expect((flat.match(/k/g) ?? []).length).toBe(1);
      expect(flat.includes("1")).toBe(true);
    }
  });
});

describe("generateVerifiedFerry", () => {
  it("certifies every seed: solvable, numbered, and mechanic-required", () => {
    for (const seed of SEEDS) {
      const room = generateVerifiedFerry(seed);
      expect(room).not.toBeNull();
      expect(room!.solve.solvable).toBe(true);
      expect(room!.solve.capped).toBe(false);
      expect(room!.minTurns).toBeGreaterThan(0);
      expect(room!.mechanicRequired).toBe(true);
      expect(room!.tier).toBe(difficultyTier(room!.minTurns));
    }
  });

  it("returns a solution that actually wins when replayed through the engine", () => {
    for (const seed of [1, 5, 11]) {
      const room = generateVerifiedFerry(seed)!;
      const final = replay(room.spec, room.solve.solution);
      expect(final.win).toBe(true);
      expect(final.heroHealth ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("stripPlatforms (the 'mechanic required' probe)", () => {
  it("turns a lava ferry into an unsolvable room — the raft was the only crossing", () => {
    for (const seed of SEEDS) {
      const spec = generateFerryRoom(seed);
      const stripped = solvePuzzleRoom(parsePuzzleRoom(stripPlatforms(spec)));
      expect(stripped.solvable).toBe(false);
      expect(stripped.capped).toBe(false); // exhaustively unsolvable, not merely unproven
    }
  });
});
