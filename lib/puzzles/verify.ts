// The "does this room actually require thought?" gate, shared by every constraint-first generator.
//
// A room is a PUZZLE (not a maze a mindless walk clears) exactly when the real solver can win but a
// faithfully MINDLESS player cannot. We model that player directly, as a reactive reflex agent that
// reuses the real engine: it walks toward the goal, and the ONLY thing it ever does with a switch is
// step on the nearest one when a door is in its way. It has no memory of what a switch did, no
// lookahead, and no model of the wiring — exactly the "walk through as if the spikes weren't there
// and the switches do the work" behaviour we are trying to rule out.
//
// WHY A REFLEX AGENT AND NOT AN ACTUATION-COUNT BOUND. An earlier bar certified a room when no
// solution actuated each switch <= once (a forced re-flip). Adversarial review broke it: on a
// ONE-switch room, "press the switch whenever a door blocks you" is a complete strategy that
// re-presses it for free — so "must press twice" is NOT "must think", and single-switch rooms sailed
// through while a brainless agent solved them. The reflex agent is the faithful test: it fails the
// old single-switch Shuttle (as it should) and cannot solve the Colour Airlock (whose two
// position-locked switches punish blind nearest-switch pressing). It is a rejection FILTER, not a
// completeness proof — a room it fails is kept, so the bar can only be too lenient by admitting a
// room some OTHER mindless policy would crack, never too strict.
import {
  parsePuzzleRoom,
  puzzleRoomToGameState,
  type PuzzleRoomSpec,
} from "./rooms";
import { solvePuzzleRoom, stateKey, type Action, type SolveResult } from "./solver";
import { movePlayer, performWait, type GameState } from "../map/game-state";
import { findPlayerPosition } from "../map/player";
import { Direction, TileSubtype } from "../map/constants";

const SOLVE_BUDGET = { maxStates: 120_000, maxTurns: 200 } as const;
const REFLEX_TURN_CAP = 800;

const U = Direction.UP,
  D = Direction.DOWN,
  L = Direction.LEFT,
  R = Direction.RIGHT;

/** A tile the reflex agent treats as impassable — a wall, raised spikes, or an unbridged hazard. */
function reflexBlocked(s: GameState, y: number, x: number): boolean {
  const tiles = s.mapData.tiles;
  if (!tiles[y] || tiles[y][x] === undefined) return true;
  if (tiles[y][x] === 1) return true; // WALL
  const sub = s.mapData.subtypes[y]?.[x] ?? [];
  if (sub.includes(TileSubtype.SPIKES)) return true; // spikes up
  if (
    sub.includes(TileSubtype.LAVA) &&
    !sub.includes(TileSubtype.OBSIDIAN) &&
    !sub.includes(TileSubtype.MOVING_PLATFORM)
  )
    return true;
  if (sub.includes(TileSubtype.DEEP_WATER) && !sub.includes(TileSubtype.MOVING_PLATFORM))
    return true;
  return false;
}

/** First step of a shortest walk from the hero to the nearest tile in `targets`, or null if none. */
function firstStepToward(s: GameState, targets: Set<string>): Direction | null {
  const p = findPlayerPosition(s.mapData);
  if (!p) return null;
  const [hy, hx] = p;
  const queue: Array<[number, number]> = [[hy, hx]];
  const prev = new Map<string, [number, number]>();
  const seen = new Set<string>([`${hy},${hx}`]);
  let found: [number, number] | null = null;
  while (queue.length) {
    const [y, x] = queue.shift() as [number, number];
    if (targets.has(`${y},${x}`) && !(y === hy && x === hx)) {
      found = [y, x];
      break;
    }
    for (const [dy, dx] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as Array<[number, number]>) {
      const ny = y + dy;
      const nx = x + dx;
      const k = `${ny},${nx}`;
      if (seen.has(k) || reflexBlocked(s, ny, nx)) continue;
      seen.add(k);
      prev.set(k, [y, x]);
      queue.push([ny, nx]);
    }
  }
  if (!found) return null;
  let cur = found;
  for (;;) {
    const pr = prev.get(`${cur[0]},${cur[1]}`);
    if (!pr) break;
    if (pr[0] === hy && pr[1] === hx) {
      const dy = cur[0] - hy;
      const dx = cur[1] - hx;
      return dy === -1 ? U : dy === 1 ? D : dx === -1 ? L : R;
    }
    cur = pr;
  }
  return null;
}

/** Every tile carrying subtype `sub`. */
function tilesWith(s: GameState, sub: TileSubtype): Set<string> {
  const out = new Set<string>();
  const g = s.mapData.subtypes;
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[y].length; x++)
      if ((g[y][x] ?? []).includes(sub)) out.add(`${y},${x}`);
  return out;
}

/**
 * Does the faithfully-mindless reflex agent win this room? Its whole policy: head for the goal (the
 * key first, then the exit); if no open walk to the goal exists, head for the nearest switch and
 * step on it (which throws it). Repeat until it wins, dies, gives up on a repeated state, or gets
 * stuck. `C` colour switches count as switches (they carry TOGGLE_SWITCH in the map).
 */
export function reflexSolves(spec: PuzzleRoomSpec): boolean {
  let s = puzzleRoomToGameState(parsePuzzleRoom(spec));
  const seen = new Set<string>();
  for (let t = 0; t < REFLEX_TURN_CAP; t++) {
    if (s.win) return true;
    if ((s.heroHealth ?? 0) <= 0) return false;
    const k = stateKey(s);
    if (seen.has(k)) return false; // looping with no progress — the mindless player gives up
    seen.add(k);
    const goal = s.hasExitKey
      ? tilesWith(s, TileSubtype.EXIT)
      : tilesWith(s, TileSubtype.EXITKEY);
    let dir = firstStepToward(s, goal);
    if (dir === null) dir = firstStepToward(s, tilesWith(s, TileSubtype.TOGGLE_SWITCH));
    if (dir === null) return false; // nowhere useful to go
    s = movePlayer(s, dir);
  }
  return false;
}

export interface RequiresLogic {
  /** True iff the room is solvable AND the mindless reflex agent cannot win it. */
  ok: boolean;
  /** The full solve — reuse its `solution` / `minTurns` rather than solving again. */
  full: SolveResult;
  /** Whether the reflex agent won (if it did, the room needs no thought). */
  reflexWon: boolean;
}

/**
 * Decide whether `spec` requires genuine logic: the real solver wins, but the mindless reflex agent
 * does not. Returns the full solve so a caller that needs the solution/difficulty does not re-solve.
 * A capped (inconclusive) solve is treated as "not proven" — callers re-seed.
 */
export function requiresLogic(spec: PuzzleRoomSpec): RequiresLogic {
  const full = solvePuzzleRoom(parsePuzzleRoom(spec), SOLVE_BUDGET);
  if (!full.solvable || full.capped) {
    return { ok: false, full, reflexWon: false };
  }
  const reflexWon = reflexSolves(spec);
  return { ok: !reflexWon, full, reflexWon };
}

/**
 * How many times a solution steps ONTO the switch tile `sw` — each fresh arrival actuates it (a
 * toggle flip or a colour turn). For telemetry/meta. Works for toggle and colour switches alike.
 */
export function countSwitchThrows(
  spec: PuzzleRoomSpec,
  solution: Action[],
  sw: [number, number]
): number {
  let s: GameState = puzzleRoomToGameState(parsePuzzleRoom(spec));
  const onSwitch = (st: GameState): boolean =>
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
