import { generateShuttleRoom } from "../../lib/puzzles/generate_constraint";
import { parsePuzzleRoom, puzzleRoomToGameState } from "../../lib/puzzles/rooms";
import {
  movePlayer,
  performWait,
  type GameState,
} from "../../lib/map/game-state";
import { solvePuzzleRoom, type Action } from "../../lib/puzzles/solver";
import { reflexSolves } from "../../lib/puzzles/verify";
import { TileSubtype } from "../../lib/map/constants";

/**
 * The constraint-first generator (lib/puzzles/generate_constraint.ts). Unlike the layout-first
 * dungeon — which produced solvable mazes a greedy walk could clear without thinking — this starts
 * from a CONSTRAINT (a mutual exclusion with a key dependency) and only ships a layout that
 * provably enforces it. The guarantees to pin are therefore not just "solvable" but "requires the
 * player to reason": the intended line re-flips the one switch, and the switch is load-bearing.
 */
function replay(
  spec: ReturnType<typeof generateShuttleRoom>["spec"],
  solution: Action[]
): GameState {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
  }
  return s;
}

/** Fresh arrivals of the hero onto `sw` across the solution — each one throws the switch. */
function switchThrows(
  spec: ReturnType<typeof generateShuttleRoom>["spec"],
  solution: Action[],
  sw: [number, number]
): number {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  const onSwitch = (st: GameState) =>
    (st.mapData.subtypes[sw[0]]?.[sw[1]] ?? []).includes(TileSubtype.PLAYER);
  let throws = 0;
  let was = onSwitch(s);
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
    else continue;
    const now = onSwitch(s);
    if (now && !was) throws++;
    was = now;
  }
  return throws;
}

describe("generateShuttleRoom", () => {
  it("is deterministic — the same seed rebuilds the identical room", () => {
    const a = generateShuttleRoom(4);
    const b = generateShuttleRoom(4);
    expect(b.spec).toEqual(a.spec);
    expect(b.solution).toEqual(a.solution);
  });

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}: certifies a well-formed room that its own solution wins`, () => {
      const r = generateShuttleRoom(seed);
      expect(() => parsePuzzleRoom(r.spec)).not.toThrow();

      const flat = r.spec.map.join("");
      expect((flat.match(/H/g) ?? []).length).toBe(1);
      expect((flat.match(/E/g) ?? []).length).toBe(1);
      expect((flat.match(/k/g) ?? []).length).toBe(1);
      // Exactly one switch, driving one door open ('^') and one door shut ('v').
      expect((flat.match(/T/g) ?? []).length).toBe(1);
      expect((flat.match(/\^/g) ?? []).length).toBe(1);
      expect((flat.match(/v/g) ?? []).length).toBe(1);

      const w = r.spec.map[0].length;
      expect(r.spec.map.every((row) => row.length === w)).toBe(true);
      expect(r.spec.map[0]).toMatch(/^#+$/);
      expect(r.spec.map[r.spec.map.length - 1]).toMatch(/^#+$/);

      expect(r.spec.sword).toBe(true);
      expect(r.spec.shield).toBe(true);

      expect(r.minTurns).toBeGreaterThan(0);
      const final = replay(r.spec, r.solution);
      expect(final.win).toBe(true);
      expect(final.heroHealth ?? 0).toBeGreaterThan(0);
    });
  }

  it("the intended line throws the one switch at least twice (structure only)", () => {
    // The optimal line sets the switch one way, gets the key, and sets it back — the mutual
    // exclusion. NOTE this is a structural property, NOT a proof the room needs thought: see the
    // baseline test below. A single switch means "re-press when blocked" is a complete reflex.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = generateShuttleRoom(seed);
      const sw = r.spec.toggles![0].switchAt as [number, number];
      expect(r.meta.switchThrows).toBeGreaterThanOrEqual(2);
      expect(switchThrows(r.spec, r.solution, sw)).toBeGreaterThanOrEqual(2);
    }
  });

  it("is a reflex-solvable BASELINE, not a certified puzzle", () => {
    // Adversarial review's key result: with one switch, a memoryless reflex agent (walk to the goal;
    // when a door blocks you, step on the nearest switch) clears every Shuttle — re-pressing the lone
    // switch is automatic, so no reasoning is required. The Shuttle is kept only as the baseline the
    // certified templates (Colour Airlock, the logic-gate family) improve on. If a future change
    // makes this expectation fail, the Shuttle became a real puzzle — update its framing accordingly.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(reflexSolves(generateShuttleRoom(seed).spec)).toBe(true);
    }
  });

  it("the switch is load-bearing — removing it seals the key away and the room is unsolvable", () => {
    // Strip the toggle and both doors freeze in their authored state: the key door ('^') stays shut
    // forever, so the key can never be reached. If the room were still solvable without the switch,
    // the switch would be decorative — the exact failure the old dungeon rooms had.
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = generateShuttleRoom(seed);
      const stripped = { ...r.spec, toggles: [] };
      const solved = solvePuzzleRoom(parsePuzzleRoom(stripped), {
        maxStates: 80_000,
        maxTurns: 200,
      });
      expect(solved.solvable).toBe(false);
    }
  });
});
