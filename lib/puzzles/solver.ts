// A breadth-first solver for puzzle rooms — the piece that makes generation trustworthy.
//
// THE ONE IDEA: the solver never re-implements the rules. It explores by applying the REAL engine
// transitions (movePlayer / performWait / performThrowRock) to CLONES of a GameState, and it
// declares victory on the engine's own `win` flag. Because every edge it walks is a turn the game
// itself would produce, a solution it finds is a solution a human could play, and a room it calls
// unsolvable is one no human could beat. That equivalence is the whole reason to build generation
// on top of it: a generator can lay out a room and ask this solver "is it solvable, and how hard?"
// and get an answer it can rely on.
//
// WHY BFS: edges cost one turn each, so the first time BFS reaches a winning state it has found the
// FEWEST-turn solution. That minimum is the difficulty number the generator will quantify rooms by.
//
// SCOPE (phase 1): deterministic, enemy-free rooms. Enemies move under combatRng and would make the
// search nondeterministic and far larger; they are a later phase. The solver still accepts rooms
// with enemies (their positions are part of the state key, so the search stays correct), but it is
// only *fast and deterministic* on the enemy-free rooms, which are the actual puzzles.
import { Direction, TileSubtype } from "../map/constants";
import {
  movePlayer,
  performWait,
  performThrowRock,
  type GameState,
} from "../map/game-state";
import { findPlayerPosition } from "../map/player";
import { serializeEnemies } from "../map/utils";
import { rehydrateEnemies } from "../enemy";
import { puzzleRoomToGameState, type ParsedPuzzleRoom } from "./rooms";

/** One thing the hero can do on a turn. A throw carries its own direction (see applyAction). */
export type Action =
  | { kind: "move"; dir: Direction }
  | { kind: "wait" }
  | { kind: "throw"; dir: Direction };

export interface SolveResult {
  /** True iff a winning state was reached within the bounds. */
  solvable: boolean;
  /**
   * True iff the search stopped at a bound (state or turn cap) rather than exhausting every
   * reachable state. A capped, unsolved room is INCONCLUSIVE — "too complex to decide here", never
   * "proven unsolvable". Only `!solvable && !capped` means genuinely unsolvable.
   */
  capped: boolean;
  /** Fewest turns to win, or -1 if unsolved. This is the room's difficulty spine. */
  minTurns: number;
  /** The optimal action sequence, or [] if unsolved. Replaying it through the engine wins. */
  solution: Action[];
  /** How many states were dequeued — a rough cost/complexity signal for tuning. */
  statesExplored: number;
}

export interface SolveOptions {
  /** Abort once this many states have been dequeued. Default 300k. */
  maxStates?: number;
  /** Abort a branch once it reaches this many turns. Default 200. */
  maxTurns?: number;
}

const MOVES: Direction[] = [
  Direction.UP,
  Direction.DOWN,
  Direction.LEFT,
  Direction.RIGHT,
];

// A stateless constant stands in for combatRng so the search is reproducible. Enemy-free rooms
// never call it; enemy rooms get deterministic (if degenerate) behaviour, which is enough for the
// solver to stay correct until enemies are handled properly in a later phase.
const SOLVER_RNG = () => 0.5;

/**
 * A canonical string identity for a state, for the visited set. It must capture EVERYTHING that can
 * change what a future turn does, and BFS's optimality depends on it: if two behaviorally-distinct
 * states share a key, the search prunes one and can inflate minTurns, miss a solution, or wrongly
 * report a room unsolvable.
 *
 * It keys on the WHOLE map (tiles + subtypes), which subsumes the hero (PLAYER tag), spike beds,
 * platform footprint, remaining pickups (EXITKEY / ROCK tiles), and — the subtlety a first
 * hero-and-beds-only version got wrong and adversarial verification caught — the terrain a THROWN
 * rock leaves behind: a ROCK on floor (re-pickuppable), a STEPPING_STONE on deep water (a new dry
 * crossing), OBSIDIAN on lava (newly walkable). Two throws in different directions from one tile
 * leave different worlds while everything off-map is identical, so the map has to be in the key.
 *
 * Added on top of the map is the dynamic state the map does NOT hold: platform (index, dir,
 * running) — a slab at the same tile heading the other way has a different future; toggle `on` —
 * the switch tile never changes but its wiring polarity drives the NEXT throw's bed outcome; the
 * exit-key flag; throwable inventory; and enemy positions.
 *
 * Facing is deliberately absent — it changes no move outcome, and throws set their own direction
 * (see applyAction), so folding facing-only variants together shrinks the search with no loss.
 *
 * Also deliberately EXCLUDED, and sound to exclude ONLY while no transition on an optimal path is
 * gated on them: heroHealth (these rooms have no survivable-damage toll — spikes refuse the move,
 * lava is caught by the death prune) and heroTorchLit (nothing here is torch-gated, though swimming
 * does snuff it). A puzzle that adds a survivable hazard or a torch gate must add these to the key.
 */
export function stateKey(s: GameState): string {
  return JSON.stringify({
    tiles: s.mapData.tiles,
    sub: s.mapData.subtypes,
    platforms: (s.platforms ?? []).map(
      (p) => `${p.id}:${p.index}:${p.dir}:${p.running ? 1 : 0}`
    ),
    toggles: (s.toggleGroups ?? []).map((g) => (g.on ? 1 : 0)),
    // Colour-switch states live off the map, so they MUST be in the key — otherwise two configs
    // that differ only in switch colours (and thus in which platforms run) would merge and the
    // search could prune a distinct, sometimes-solving state.
    // Comma-joined, not bare-concatenated: with a delimiter, colours >= 10 can't alias (e.g.
    // [1,12] vs [11,2]). Colours are capped at 4 today, but the key stays sound if that ever lifts.
    colorLocks: (s.colorLocks ?? []).map((l) => l.states.join(",")),
    exitKey: !!s.hasExitKey,
    rocks: s.rockCount ?? 0,
    runes: s.runeCount ?? 0,
    bombs: s.bombCount ?? 0,
    enemies: (s.enemies ?? [])
      .map((e) => `${e.y},${e.x},${e.kind},${e.health ?? ""}`)
      .sort(),
  });
}

/**
 * A deep, independent copy of a state, so applying a transition to one successor cannot disturb the
 * parent (which still has other successors to expand). The engine transitions mutate the enemies
 * array — and historically other nested structures — in place, so a shallow copy is not enough.
 *
 * Mirrors the rewind buffer's clone: JSON round-trips the plain data, the RNG closure is reattached
 * by reference, and enemies are rebuilt as real Enemy instances (JSON would drop the prototype the
 * turn loop calls through).
 */
function cloneState(s: GameState): GameState {
  const { combatRng, enemies, npcs, ...rest } = s;
  void combatRng;
  void npcs;
  const cloned = JSON.parse(JSON.stringify(rest)) as GameState;
  cloned.combatRng = SOLVER_RNG;
  cloned.enemies = enemies
    ? rehydrateEnemies(serializeEnemies(enemies) ?? [])
    : enemies;
  cloned.npcs = npcs; // phase-1 rooms have none; a shallow carry is fine
  return cloned;
}

/** Apply one action to a state via the real engine. The caller passes a throwaway clone. */
function applyAction(state: GameState, action: Action): GameState {
  switch (action.kind) {
    case "move":
      return movePlayer(state, action.dir);
    case "wait":
      return performWait(state);
    case "throw":
      // A throw goes in the hero's facing; the solver picks the facing explicitly rather than
      // threading a separate "turn to face" turn, so a throw is one action in any direction.
      return performThrowRock({ ...state, playerDirection: action.dir });
  }
}

function delta(dir: Direction): [number, number] {
  switch (dir) {
    case Direction.UP:
      return [-1, 0];
    case Direction.DOWN:
      return [1, 0];
    case Direction.LEFT:
      return [0, -1];
    case Direction.RIGHT:
      return [0, 1];
  }
}

/**
 * Is a throw in this direction worth exploring? Only if a rock could land on something it USEFULLY
 * changes — a toggle switch, a pressure plate, lava (→ walkable obsidian), a pot, or an enemy.
 *
 * This is a SOUND pruning of the search, not a rule reimplementation: a rock landing on plain floor
 * just litters a re-pickuppable ROCK (never enables anything you couldn't already do), and one
 * landing in deep water makes a STEPPING_STONE whose only effect is keeping the torch lit — which
 * this solver already treats as irrelevant (see stateKey's excluded fields). Pruning those throws
 * removes nothing an optimal path needs, under the same "no torch/health gate" assumption the key
 * makes. Without it, throwing in every direction from every tile spawns a combinatorial fan of
 * useless terrain states and the search explodes.
 *
 * It scans the four-tile reach and deliberately does NOT stop at walls: over-emitting a throw toward
 * a wall-blocked target costs a couple of harmless wall-stop states, and it keeps this scan from
 * having to duplicate the engine's projectile-flight rules (which the transition still owns).
 */
function throwHasTarget(state: GameState, dir: Direction): boolean {
  const pos = findPlayerPosition(state.mapData);
  if (!pos) return false;
  const [dy, dx] = delta(dir);
  const subs = state.mapData.subtypes;
  let y = pos[0];
  let x = pos[1];
  for (let step = 1; step <= 4; step++) {
    y += dy;
    x += dx;
    const cell = subs[y]?.[x];
    if (!cell) break; // off the map
    if (
      cell.includes(TileSubtype.TOGGLE_SWITCH) ||
      cell.includes(TileSubtype.PRESSURE_PLATE) ||
      cell.includes(TileSubtype.LAVA) ||
      cell.includes(TileSubtype.POT)
    ) {
      return true;
    }
    if ((state.enemies ?? []).some((e) => e.y === y && e.x === x)) return true;
  }
  return false;
}

/** The actions worth trying from a state: the four moves, wait, and throws only toward a useful target. */
function candidateActions(state: GameState): Action[] {
  const actions: Action[] = MOVES.map((dir) => ({ kind: "move", dir }));
  actions.push({ kind: "wait" });
  if ((state.rockCount ?? 0) > 0) {
    for (const dir of MOVES) {
      if (throwHasTarget(state, dir)) actions.push({ kind: "throw", dir });
    }
  }
  return actions;
}

interface Node {
  state: GameState;
  action: Action | null; // the action that produced this state (null at the root)
  parent: Node | null;
  depth: number; // turns taken to reach this state
}

function reconstruct(node: Node): Action[] {
  const path: Action[] = [];
  let cur: Node | null = node;
  while (cur && cur.action) {
    path.push(cur.action);
    cur = cur.parent;
  }
  return path.reverse();
}

/**
 * Solve a parsed puzzle room: find the fewest-turn path to the engine's win state, or prove none
 * exists within the search bounds.
 *
 * The start state is built through the SAME `puzzleRoomToGameState` the bench renders, so the
 * solver and a human play from an identical world.
 */
export function solvePuzzleRoom(
  room: ParsedPuzzleRoom,
  opts: SolveOptions = {}
): SolveResult {
  const maxStates = opts.maxStates ?? 300_000;
  const maxTurns = opts.maxTurns ?? 200;

  const start = cloneState(puzzleRoomToGameState(room));
  if (start.win) {
    return { solvable: true, capped: false, minTurns: 0, solution: [], statesExplored: 1 };
  }

  const visited = new Set<string>([stateKey(start)]);
  const queue: Node[] = [{ state: start, action: null, parent: null, depth: 0 }];
  let head = 0;
  let explored = 0;
  let hitTurnCap = false;

  while (head < queue.length) {
    const node = queue[head++];
    explored++;
    if (explored > maxStates) {
      return { solvable: false, capped: true, minTurns: -1, solution: [], statesExplored: explored };
    }
    // Don't grow branches past the turn cap, but remember we pruned so an empty queue below is
    // reported as inconclusive rather than as proven-unsolvable.
    if (node.depth >= maxTurns) {
      hitTurnCap = true;
      continue;
    }

    for (const action of candidateActions(node.state)) {
      const next = applyAction(cloneState(node.state), action);
      if ((next.heroHealth ?? 0) <= 0) continue; // died — a dead branch, never a solution
      if (next.win) {
        return {
          solvable: true,
          capped: false,
          minTurns: node.depth + 1,
          solution: [...reconstruct(node), action],
          statesExplored: explored,
        };
      }
      const key = stateKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ state: next, action, parent: node, depth: node.depth + 1 });
    }
  }

  // Queue drained. If nothing was pruned by the turn cap, the entire reachable state space was
  // searched and the room is genuinely unsolvable; otherwise the verdict is inconclusive.
  return {
    solvable: false,
    capped: hitTurnCap,
    minTurns: -1,
    solution: [],
    statesExplored: explored,
  };
}

/**
 * Every state the hero passes through while playing a solution, starting with the fresh start
 * state — `states.length === solution.length + 1`. For visualising a solve (e.g. animating the
 * bench minimap through it). Uses the same clone-then-apply the search does, so what you watch is
 * exactly what the search walked.
 */
export function solutionStates(
  room: ParsedPuzzleRoom,
  solution: Action[]
): GameState[] {
  const states: GameState[] = [cloneState(puzzleRoomToGameState(room))];
  for (const action of solution) {
    states.push(applyAction(cloneState(states[states.length - 1]), action));
  }
  return states;
}

/** A compact, replayable rendering of a solution, e.g. "D, wait, D, throwL". For logs/benches. */
export function formatSolution(solution: Action[]): string {
  const d = (dir: Direction): string =>
    dir === Direction.UP ? "U" : dir === Direction.DOWN ? "D" : dir === Direction.LEFT ? "L" : "R";
  return solution
    .map((a) => (a.kind === "wait" ? "wait" : a.kind === "throw" ? `throw${d(a.dir)}` : d(a.dir)))
    .join(", ");
}
