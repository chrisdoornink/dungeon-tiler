import { generateDungeonRoom } from "../../lib/puzzles/generate_dungeon";
import { parsePuzzleRoom, puzzleRoomToGameState } from "../../lib/puzzles/rooms";
import {
  movePlayer,
  performWait,
  type GameState,
} from "../../lib/map/game-state";
import type { Action } from "../../lib/puzzles/solver";

/**
 * The layout-first dungeon generator: a normal room+corridor dungeon with puzzle blockades fitted
 * onto its corridor chokepoints. Every room is solver-checked at generation time (cheap on rooms
 * this size), so the guarantees to pin are determinism, well-formedness, and that the returned
 * solution genuinely wins when replayed through the engine.
 */
function replay(spec: ReturnType<typeof generateDungeonRoom>["spec"], solution: Action[]): GameState {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
  }
  return s;
}

describe("generateDungeonRoom", () => {
  it("is deterministic — the same seed rebuilds the identical dungeon", () => {
    const a = generateDungeonRoom(4);
    const b = generateDungeonRoom(4);
    expect(b.spec).toEqual(a.spec);
    expect(b.solution).toEqual(a.solution);
  });

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}: certifies a well-formed, solvable dungeon`, () => {
      const r = generateDungeonRoom(seed);
      expect(() => parsePuzzleRoom(r.spec)).not.toThrow();

      const flat = r.spec.map.join("");
      expect((flat.match(/H/g) ?? []).length).toBe(1);
      expect((flat.match(/E/g) ?? []).length).toBe(1);
      expect((flat.match(/k/g) ?? []).length).toBe(1);

      // Rectangular and walled all round.
      const w = r.spec.map[0].length;
      expect(r.spec.map.every((row) => row.length === w)).toBe(true);
      expect(r.spec.map[0]).toMatch(/^#+$/);
      expect(r.spec.map[r.spec.map.length - 1]).toMatch(/^#+$/);

      // Each gate is one bed driven by one switch.
      expect(r.meta.gates).toBeGreaterThanOrEqual(1);
      expect(r.spec.toggles?.length).toBe(r.meta.gates);
      expect((flat.match(/\^/g) ?? []).length).toBe(r.meta.gates);

      // The hero is armed (kit carries forward to when enemies arrive).
      expect(r.spec.sword).toBe(true);
      expect(r.spec.shield).toBe(true);

      // The returned solution actually wins through the engine.
      expect(r.minTurns).toBeGreaterThan(0);
      const final = replay(r.spec, r.solution);
      expect(final.win).toBe(true);
      expect(final.heroHealth ?? 0).toBeGreaterThan(0);
    });
  }
});
