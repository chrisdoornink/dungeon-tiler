// The Colour Airlock (a "Handoff") — the second constraint-first template, and the first built on a
// COLOUR LOCK rather than a plain toggle.
//
// THE CONSTRAINT. Two colour switches, one in room A (with the hero) and one in room B, drive three
// doors through a single allEqual lock over TWO colours:
//   * MATCHED (both same colour): the EXIT door and the B->C door retract (open); the A->B door
//     rises (shut).
//   * MISMATCHED: the A->B door opens; the exit and B->C doors shut.
// The room starts MATCHED — so the exit is already open, but you arrive there with no key (the
// Shuttle's trap). The key sits in room C, past B.
//
// WHY IT NEEDS LOGIC (a NEW thing the Shuttle never asked). You must DELIBERATELY BREAK the match
// you instinctively want: press A's switch to mismatch (opening A->B), cross to B, press B's switch
// to re-match (opening B->C), fetch the key, then — from the correct side — break again to get back
// to A, and match one last time to open the exit. Four presses, two returns, a state that goes
// matched -> mismatched -> matched -> mismatched -> matched. The switches are POSITION-LOCKED in
// different rooms, so which press is even available depends on which side of a sealed door you are
// on, not on what is nearest. A mindless "keep them matched / press once as you pass" player is
// stranded: the shared verifier (requiresLogic, the <=1-actuation-per-switch solve) proves it.
import type { PuzzleRoomSpec } from "./rooms";
import { parsePuzzleRoom, puzzleRoomToGameState } from "./rooms";
import { mulberry32, difficultyTier, type DifficultyTier } from "./generate";
import { movePlayer, performWait, type GameState } from "../map/game-state";
import { solvePuzzleRoom, type Action } from "./solver";
import { colorLockSatisfied } from "../map/machinery";
import { requiresLogic, countSwitchThrows } from "./verify";

type Rng = () => number;
const ri = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

const FLOOR = 0;
const WALL = 1;

/** Floor tiles reachable from `start` with `blocked` walled — the cut-check primitive. */
function reachableFloor(
  grid: number[][],
  start: [number, number],
  blocked: [number, number]
): Set<string> {
  const seen = new Set<string>();
  const bk = `${blocked[0]},${blocked[1]}`;
  if (grid[start[0]]?.[start[1]] !== FLOOR || `${start[0]},${start[1]}` === bk) return seen;
  seen.add(`${start[0]},${start[1]}`);
  const stack = [start];
  while (stack.length) {
    const [y, x] = stack.pop() as [number, number];
    for (const [ny, nx] of [
      [y - 1, x],
      [y + 1, x],
      [y, x - 1],
      [y, x + 1],
    ] as Array<[number, number]>) {
      if (grid[ny]?.[nx] !== FLOOR) continue;
      const k = `${ny},${nx}`;
      if (k === bk || seen.has(k)) continue;
      seen.add(k);
      stack.push([ny, nx]);
    }
  }
  return seen;
}

export interface HandoffMeta {
  rooms: number;
  /** Presses of each switch on the intended line (>= 2 each == the break-and-restore signature). */
  caPresses: number;
  cbPresses: number;
  /** The lock's satisfied/unsatisfied trace over the solution matched the break-and-restore shape. */
  breakRestore: boolean;
}

export interface GeneratedHandoff {
  spec: PuzzleRoomSpec;
  meta: HandoffMeta;
  seed: number;
  minTurns: number;
  tier: DifficultyTier;
  solution: Action[];
}

/** The lock's satisfied string across a solution, e.g. "TFFTTF...T" — one char per turn incl. start. */
function satisfiedTrace(spec: PuzzleRoomSpec, solution: Action[]): string {
  let s: GameState = puzzleRoomToGameState(parsePuzzleRoom(spec));
  const sat = (st: GameState) => (st.colorLocks?.[0] && colorLockSatisfied(st.colorLocks[0]) ? "T" : "F");
  let trace = sat(s);
  for (const a of solution) {
    if (a.kind === "move") s = movePlayer(s, a.dir);
    else if (a.kind === "wait") s = performWait(s);
    else continue;
    trace += sat(s);
  }
  return trace;
}

/** Replace one cell of a map with a different character (for the load-bearing variants). */
function withCell(map: readonly string[], y: number, x: number, ch: string): string[] {
  return map.map((row, ry) => (ry === y ? row.slice(0, x) + ch + row.slice(x + 1) : row));
}

const MIN_TURNS = 14;

function build(rng: Rng, seed: number): GeneratedHandoff | null {
  const W = 24;
  const H = 12;
  const grid: number[][] = Array.from({ length: H }, () => Array(W).fill(WALL));

  // Three rooms A|B|C sharing a top row so one doorway row `dr` sits inside all three. One wall
  // column between neighbours; the sole floor gap in it is that stage's door.
  const ry = 2;
  const dr = ry + 1;
  const wA = ri(rng, 3, 4);
  const wB = ri(rng, 3, 4);
  const wC = ri(rng, 3, 4);
  const hA = ri(rng, 3, 4);
  const hB = ri(rng, 3, 4);
  const hC = ri(rng, 3, 4);
  const xA = 2;
  const colAB = xA + wA; // wall column between A and B
  const xB = colAB + 1;
  const colBC = xB + wB; // wall column between B and C
  const xC = colBC + 1;
  if (xC + wC >= W - 1) return null; // ran off the canvas this roll

  const carveRect = (x: number, w: number, h: number) => {
    for (let y = ry; y < ry + h; y++) for (let cx = x; cx < x + w; cx++) grid[y][cx] = FLOOR;
  };
  carveRect(xA, wA, hA);
  carveRect(xB, wB, hB);
  carveRect(xC, wC, hC);

  // Stage doors.
  const Gm: [number, number] = [dr, colAB]; // A<->B  (invertedGate: SHUT while matched)
  const Gx2: [number, number] = [dr, colBC]; // B<->C  (gate: OPEN while matched)
  grid[Gm[0]][Gm[1]] = FLOOR;
  grid[Gx2[0]][Gx2[1]] = FLOOR;

  // Exit niche below A, reached only through the exit door Gx.
  const ex = xA + ri(rng, 0, wA - 1);
  const Gx: [number, number] = [ry + hA, ex]; // A<->exit (gate: OPEN while matched)
  const Epos: [number, number] = [ry + hA + 1, ex];
  if (Epos[0] >= H - 1) return null;
  grid[Gx[0]][Gx[1]] = FLOOR;
  grid[Epos[0]][Epos[1]] = FLOOR;

  // Place hero + Ca in A, Cb in B, k in C. freeIn picks an unclaimed interior floor cell (doorways
  // sit OUTSIDE the room rectangles, so no room cell is ever a door).
  const claim = new Set<string>();
  const freeIn = (x: number, w: number, h: number): [number, number] | null => {
    const cells: Array<[number, number]> = [];
    for (let y = ry; y < ry + h; y++)
      for (let cx = x; cx < x + w; cx++)
        if (grid[y][cx] === FLOOR && !claim.has(`${y},${cx}`)) cells.push([y, cx]);
    return cells.length ? cells[ri(rng, 0, cells.length - 1)] : null;
  };
  const take = (c: [number, number] | null): [number, number] | null => {
    if (c) claim.add(`${c[0]},${c[1]}`);
    return c;
  };
  const Hpos = take(freeIn(xA, wA, hA));
  const Ca = take(freeIn(xA, wA, hA));
  const Cb = take(freeIn(xB, wB, hB));
  const kPos = take(freeIn(xC, wC, hC));
  if (!Hpos || !Ca || !Cb || !kPos) return null;

  // Doorway cut-checks: every door must be the ONLY link between the parts it separates.
  const aC: [number, number] = [dr, xA]; // a cell certainly in A on the doorway row
  const bC: [number, number] = [dr, xB];
  const aReachNoGm = reachableFloor(grid, aC, Gm);
  if (aReachNoGm.has(`${Cb[0]},${Cb[1]}`) || aReachNoGm.has(`${kPos[0]},${kPos[1]}`)) return null;
  if (reachableFloor(grid, bC, Gx2).has(`${kPos[0]},${kPos[1]}`)) return null;
  if (reachableFloor(grid, aC, Gx).has(`${Epos[0]},${Epos[1]}`)) return null;

  // Render, then crop to a tight wall ring.
  const chars: string[][] = grid.map((row) => row.map((c) => (c === WALL ? "#" : ".")));
  chars[Hpos[0]][Hpos[1]] = "H";
  chars[Ca[0]][Ca[1]] = "C";
  chars[Cb[0]][Cb[1]] = "C";
  chars[kPos[0]][kPos[1]] = "k";
  chars[Epos[0]][Epos[1]] = "E";
  chars[Gm[0]][Gm[1]] = "^"; // invertedGate: up (shut) while matched — matched is the start
  chars[Gx[0]][Gx[1]] = "v"; // gate: down (open) while matched
  chars[Gx2[0]][Gx2[1]] = "v";

  let minY = H, maxY = 0, minX = W, maxX = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (chars[y][x] !== "#") {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
  minY = Math.max(0, minY - 1);
  minX = Math.max(0, minX - 1);
  maxY = Math.min(H - 1, maxY + 1);
  maxX = Math.min(W - 1, maxX + 1);
  const off = (yx: [number, number]): [number, number] => [yx[0] - minY, yx[1] - minX];
  const map = chars.slice(minY, maxY + 1).map((r) => r.slice(minX, maxX + 1).join(""));

  const CaC = off(Ca);
  const CbC = off(Cb);
  const GmC = off(Gm);
  const GxC = off(Gx);
  const Gx2C = off(Gx2);

  const spec: PuzzleRoomSpec = {
    name: `Colour Airlock #${seed}`,
    asks:
      `TWO colour switches, one shared lock. Matched (same colour) opens the EXIT and the inner ` +
      `door but SEALS the middle room; mismatched does the opposite. It starts matched — the exit ` +
      `is already open, but the key is two rooms deep. You have to break the match you want, hand ` +
      `off across the middle, and re-match from the right side. Does this read as a real puzzle?`,
    map,
    trackOver: "lava",
    colorLocks: [
      {
        switches: [CaC, CbC],
        colors: 2,
        rule: "allEqual",
        initial: [0, 0],
        gates: [GxC, Gx2C], // retract (open) while matched
        invertedGates: [GmC], // rise (shut) while matched
      },
    ],
    sword: true,
    shield: true,
  };

  // Certification. Every check runs the real solver / real engine.
  const logic = requiresLogic(spec); // C1 solvable & C3 requires-logic (mindless solve unsolvable)
  if (!logic.ok) return null;
  const solved = logic.full;
  if (solved.minTurns < MIN_TURNS) return null; // C2 reject a degenerate short roll

  // C4 the lock is load-bearing: strip it and the A->B door freezes shut, sealing the key away.
  const noLock = solvePuzzleRoom(parsePuzzleRoom({ ...spec, colorLocks: [] }), {
    maxStates: 120_000,
    maxTurns: 200,
  });
  if (noLock.solvable || noLock.capped) return null;

  // C5 BOTH switches are load-bearing: disabling either (its C becomes floor, the other drives a
  // single-switch match lock) must strand the hero — no one-switch reduction solves it.
  for (const [sy, sx, oy, ox] of [
    [CaC[0], CaC[1], CbC[0], CbC[1]],
    [CbC[0], CbC[1], CaC[0], CaC[1]],
  ]) {
    const variant: PuzzleRoomSpec = {
      ...spec,
      map: withCell(spec.map, sy, sx, "."),
      colorLocks: [
        {
          switches: [[oy, ox]],
          colors: 2,
          rule: "match",
          target: [0],
          gates: [GxC, Gx2C],
          invertedGates: [GmC],
        },
      ],
    };
    const solo = solvePuzzleRoom(parsePuzzleRoom(variant), { maxStates: 120_000, maxTurns: 200 });
    if (solo.solvable || solo.capped) return null;
  }

  // C7 break-and-restore fingerprint: matched at start, deliberately broken, matched at the end.
  const trace = satisfiedTrace(spec, solved.solution);
  const breakRestore = /^T+F+.*T$/.test(trace);
  if (!breakRestore) return null;

  // C8 both switches pressed at least twice on the intended line.
  const caPresses = countSwitchThrows(spec, solved.solution, CaC);
  const cbPresses = countSwitchThrows(spec, solved.solution, CbC);
  if (caPresses < 2 || cbPresses < 2) return null;

  return {
    spec,
    meta: { rooms: 3, caPresses, cbPresses, breakRestore },
    seed,
    minTurns: solved.minTurns,
    tier: difficultyTier(solved.minTurns),
    solution: solved.solution,
  };
}

export function generateHandoffRoom(seed: number): GeneratedHandoff {
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = mulberry32(
      (Math.imul(seed, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0
    );
    const room = build(rng, seed);
    if (room) return room;
  }
  throw new Error(`generateHandoffRoom: no layout certified for seed ${seed}`);
}
