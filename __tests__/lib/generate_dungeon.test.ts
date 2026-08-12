import { generateDungeonRoom } from "../../lib/puzzles/generate_dungeon";
import { parsePuzzleRoom, puzzleRoomToGameState } from "../../lib/puzzles/rooms";
import {
  movePlayer,
  performWait,
  type GameState,
} from "../../lib/map/game-state";
import { solvePuzzleRoom, type Action } from "../../lib/puzzles/solver";

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

      // Every gate is a bed (spike gates are '^'; a trade adds a closed '^' + an open 'v').
      expect(r.meta.gates).toBeGreaterThanOrEqual(1);
      const bedCount =
        (flat.match(/\^/g) ?? []).length + (flat.match(/v/g) ?? []).length;
      expect(bedCount).toBe(r.meta.gates);
      // One toggle per plain gate, plus one for the trade if present (it drives two beds).
      expect(r.spec.toggles?.length).toBe(r.meta.gates - (r.meta.trade ? 1 : 0));

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

  it("every switch is load-bearing — removing any one leaves the room unsolvable", () => {
    // The soundness guarantee: no pointless switches. Dropping a toggle leaves its door frozen in
    // its authored state (a spike gate stays shut; the trade's branch stays shut). If the room is
    // still solvable without that switch, the switch gated nothing — which the generator's cut-check
    // is meant to prevent.
    for (const seed of [1, 2, 3, 4, 6]) {
      const r = generateDungeonRoom(seed);
      const toggles = r.spec.toggles ?? [];
      expect(toggles.length).toBeGreaterThan(0);
      toggles.forEach((_, i) => {
        const stripped = {
          ...r.spec,
          toggles: toggles.filter((_, j) => j !== i),
        };
        const solved = solvePuzzleRoom(parsePuzzleRoom(stripped), {
          maxStates: 80_000,
          maxTurns: 200,
        });
        expect(solved.solvable).toBe(false);
      });
    }
  });
});
