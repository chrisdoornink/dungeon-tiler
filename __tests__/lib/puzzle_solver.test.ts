import {
  PUZZLE_ROOMS,
  parsePuzzleRoom,
  puzzleRoomToGameState,
  type PuzzleRoomSpec,
} from "../../lib/puzzles/rooms";
import { solvePuzzleRoom, stateKey, type Action } from "../../lib/puzzles/solver";
import {
  movePlayer,
  performWait,
  performThrowRock,
  type GameState,
} from "../../lib/map/game-state";
import { Direction } from "../../lib/map/constants";

/**
 * The BFS solver over the hand-authored puzzle rooms — phase 1 of puzzle generation.
 *
 * The properties that make it trustworthy enough to build a generator on:
 *  - it solves the real puzzle rooms in a specific fewest-turn count (BFS is optimal by
 *    construction), and
 *  - every solution it returns actually WINS when replayed through the engine (the check that
 *    proves the solver is reusing the real rules, not a private model of them).
 */

// The optimum per room. Locked to the values the solver reports AND that the replay test below
// re-derives through the engine, so a regression that changes either fails loudly.
const EXPECTED: Record<string, number> = {
  "The Ferry": 20,
  "The Trade": 22,
  "The Raft (teaching)": 17,
  "The Parked Raft": 15,
};

function findRoom(name: string): PuzzleRoomSpec {
  const spec = PUZZLE_ROOMS.find((r) => r.name === name);
  if (!spec) throw new Error(`no puzzle room named ${name}`);
  return spec;
}

/**
 * Replay a solution through the REAL engine transitions — deliberately NOT the solver's own
 * applyAction, so a bug shared between search and replay cannot hide — and return the final state.
 */
function replay(spec: PuzzleRoomSpec, solution: Action[]): GameState {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
    else s = performThrowRock({ ...s, playerDirection: a.dir });
    if ((s.heroHealth ?? 0) <= 0) return s; // died — the caller asserts this never happens
  }
  return s;
}

describe("puzzle solver — the four deterministic puzzle rooms", () => {
  for (const [name, turns] of Object.entries(EXPECTED)) {
    describe(name, () => {
      const spec = findRoom(name);
      const result = solvePuzzleRoom(parsePuzzleRoom(spec), {
        maxStates: 100_000,
        maxTurns: 120,
      });

      it("solves in the expected fewest turns", () => {
        expect(result.solvable).toBe(true);
        expect(result.capped).toBe(false);
        expect(result.minTurns).toBe(turns);
        expect(result.solution).toHaveLength(turns);
      });

      it("returns a solution that wins when replayed through the engine", () => {
        const final = replay(spec, result.solution);
        expect(final.win).toBe(true);
        expect(final.heroHealth ?? 0).toBeGreaterThan(0);
      });

      it("finds no shorter solution (regression guard on the optimum)", () => {
        const shorter = solvePuzzleRoom(parsePuzzleRoom(spec), { maxTurns: turns - 1 });
        expect(shorter.solvable).toBe(false);
      });

      it("is deterministic run to run", () => {
        const again = solvePuzzleRoom(parsePuzzleRoom(spec), {
          maxStates: 100_000,
          maxTurns: 120,
        });
        expect(again.minTurns).toBe(result.minTurns);
        expect(again.solution).toEqual(result.solution);
      });
    });
  }
});

describe("puzzle solver — verdicts", () => {
  it("proves an exit-without-a-key room unsolvable, exhaustively (not capped)", () => {
    // The hero can reach the exit but never holds the key, so the win flag can never fire. The
    // reachable space is tiny, so the solver drains it and returns a definitive verdict — this is
    // the same shape as Behind Glass, minus the enemy explosion that would only cap the search.
    const spec: PuzzleRoomSpec = {
      name: "No Key (synthetic)",
      asks: "",
      trackOver: "lava",
      map: ["#####", "#H.E#", "#####"],
    };
    const r = solvePuzzleRoom(parsePuzzleRoom(spec));
    expect(r.solvable).toBe(false);
    expect(r.capped).toBe(false);
  });

  it("reports capped (inconclusive), never a false unsolvable, when the budget runs out", () => {
    const r = solvePuzzleRoom(parsePuzzleRoom(findRoom("The Ferry")), { maxStates: 20 });
    expect(r.solvable).toBe(false);
    expect(r.capped).toBe(true);
  });

  it("keys projectile-created terrain, so two differently-landing throws are distinct states", () => {
    // The exact hole adversarial verification found: from The Parked Raft start (hero (1,1), three
    // rocks), throwing UP hits the top wall and places nothing, while throwing RIGHT lands a
    // re-pickuppable ROCK four tiles along. Same hero, same rock count, same platform step —
    // different worlds. An earlier key ignored the landing terrain and merged them, which let BFS
    // prune the distinct (and sometimes better) state, breaking the optimality guarantee.
    const start = puzzleRoomToGameState(parsePuzzleRoom(findRoom("The Parked Raft")));
    const up = performThrowRock({ ...start, playerDirection: Direction.UP });
    const right = performThrowRock({ ...start, playerDirection: Direction.RIGHT });
    expect(up.rockCount).toBe(right.rockCount); // both spent exactly one rock...
    expect(stateKey(up)).not.toBe(stateKey(right)); // ...but the maps differ, so the keys must too
  });
});
