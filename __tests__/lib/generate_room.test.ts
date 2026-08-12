import {
  generateCertifiedRoom,
  type GeneratedPuzzleRoom,
} from "../../lib/puzzles/generate_room";
import { parsePuzzleRoom, puzzleRoomToGameState } from "../../lib/puzzles/rooms";
import {
  movePlayer,
  performWait,
  type GameState,
} from "../../lib/map/game-state";
import type { Action } from "../../lib/puzzles/solver";

/**
 * The random room generator. Certification IS the test — every room the generator returns has
 * already been proven solvable (goblins aside) and proven unsolvable without its machinery — so
 * these tests pin the guarantees around that: determinism, well-formedness, the difficulty floor,
 * and that the seeds we exercise cover the generator's variety (both orientations, both trip
 * plans, both lock rules, water).
 *
 * Generation runs the real solver, so each seed costs seconds — the suite shares one generation
 * per seed and keeps the seed list short.
 */
jest.setTimeout(180_000);

const SEEDS = [1, 2, 3, 5, 7];
const cache = new Map<number, GeneratedPuzzleRoom>();
const gen = (seed: number): GeneratedPuzzleRoom => {
  const hit = cache.get(seed);
  if (hit) return hit;
  const room = generateCertifiedRoom(seed);
  cache.set(seed, room);
  return room;
};

function replay(room: GeneratedPuzzleRoom, solution: Action[]): GameState {
  let s = puzzleRoomToGameState(parsePuzzleRoom(room.strippedSpec));
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
  }
  return s;
}

describe("generateCertifiedRoom", () => {
  it("is deterministic — the same seed rebuilds the identical room", () => {
    const a = generateCertifiedRoom(SEEDS[0]);
    const b = generateCertifiedRoom(SEEDS[0]);
    expect(b.spec).toEqual(a.spec);
    expect(b.minTurns).toBe(a.minTurns);
    expect(b.solution).toEqual(a.solution);
    cache.set(SEEDS[0], a);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: certifies a well-formed, armed, non-trivial room`, () => {
      const r = gen(seed);
      // Both variants parse (the playable room and the certified stripped one).
      expect(() => parsePuzzleRoom(r.spec)).not.toThrow();
      expect(() => parsePuzzleRoom(r.strippedSpec)).not.toThrow();
      // Exactly one hero, exit, and key.
      const flat = r.spec.map.join("");
      expect((flat.match(/H/g) ?? []).length).toBe(1);
      expect((flat.match(/E/g) ?? []).length).toBe(1);
      expect((flat.match(/k/g) ?? []).length).toBe(1);
      // Goblins are pressure, and the hero is armed to match (ruleset rule 9).
      expect(r.meta.goblins).toBeGreaterThanOrEqual(1);
      expect(flat).toContain("g");
      expect(r.spec.sword).toBe(true);
      expect(r.spec.shield).toBe(true);
      expect(r.strippedSpec.map.join("")).not.toContain("g");
      // Difficulty floor and the 4+ element budget.
      expect(r.minTurns).toBeGreaterThanOrEqual(18);
      expect(r.meta.elements).toBeGreaterThanOrEqual(4);
      expect(r.meta.elements).toBeLessThanOrEqual(6);
    });
  }

  it("returns a solution that wins when replayed through the engine", () => {
    const r = gen(3); // the cheapest certifying seed in the set
    const final = replay(r, r.solution);
    expect(final.win).toBe(true);
    expect(final.heroHealth ?? 0).toBeGreaterThan(0);
  });

  it("covers the variety the ruleset promises across the seed set", () => {
    const metas = SEEDS.map((s) => gen(s).meta);
    // Locks are always "agreement" now — a specific-pattern match is unguessable without an
    // in-room clue we don't draw yet (playtest 2026-08-12).
    expect(metas.every((m) => m.lockRule === "allEqual")).toBe(true);
    // Structural variety still comes through: both orientations and both trip plans appear, and
    // the crossing count is not fixed. (Water needs a 3-crossing room AND a coin flip, so it is
    // not required to appear in a five-seed sample — its generation is covered by the sweep.)
    expect(new Set(metas.map((m) => m.orientation)).size).toBe(2);
    expect(new Set(metas.map((m) => m.plan)).size).toBe(2);
    expect(new Set(metas.map((m) => m.crossings)).size).toBeGreaterThan(1);
  });
});
