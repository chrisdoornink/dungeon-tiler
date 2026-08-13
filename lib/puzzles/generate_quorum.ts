// The Quorum — the first template of the LOGIC-GATE family, built on a k-of-n THRESHOLD gate.
//
// THE CONSTRAINT. Three colour switches on one `threshold` lock (colors=2, target [1,1,1], k=2):
// the lock is satisfied while at least TWO of the three sit on colour 1 — a 2-of-3 MAJORITY. This is
// a genuinely different logic from the Colour Airlock's XOR: it COUNTS, it does not compare, and it
// is exactly what `match` (AND = 3-of-3) cannot express. The majority is composed with a NOT (one
// door is an invertedGate), so no single lock-state opens the whole path.
//
// Four chambers in a row, A|B|C|Key, with the switches position-locked one per room (S1 in A with
// the hero, S2 in B, S3 in C) and the doors along the corridor alternating polarity:
//   doorAB (gate, open while satisfied) · doorBC (invertedGate, open while UNsatisfied = the NOT) ·
//   doorCK (gate, open while satisfied) · exitDoor (gate, open while satisfied).
// It starts at quorum (initial [1,1,0] → count 2 → satisfied), so doorBC seals the key behind it.
//
// WHY IT NEEDS LOGIC. The solution is the ANCHOR SHUTTLE: keep S1 pinned ON as a spare, and walk the
// quorum down the corridor and back — S2 off (open the NOT, enter C), S3 on (re-reach quorum, open
// the far door, take the key), S3 off (open the NOT again), S2 on (restore quorum, open the way
// out). The count only ever visits {1,2}; the majority's spare is what makes it solvable at k=2 and
// impossible at k=3 (AND has no spare). A mindless player cannot do this: from the start only S1 is
// reachable, and pressing it drops the majority and slams the gate it was standing behind — so both
// the nearest- and farthest-switch reflex players strand and give up (verify.ts, machine-checked).
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
const MIN_TURNS = 20;

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

export interface QuorumMeta {
  rooms: number;
  /** The gate: k of n switches on target. */
  k: number;
  n: number;
  /** Presses of each switch on the intended line, in switch order [S1,S2,S3]. */
  presses: number[];
  /** True iff exactly one switch is never pressed on the solution (the held anchor). */
  anchorHeld: boolean;
}

export interface GeneratedQuorum {
  spec: PuzzleRoomSpec;
  meta: QuorumMeta;
  seed: number;
  minTurns: number;
  tier: DifficultyTier;
  solution: Action[];
}

/** The lock's satisfied string across a solution, one char per turn incl. start. */
function satisfiedTrace(spec: PuzzleRoomSpec, solution: Action[]): string {
  let s: GameState = puzzleRoomToGameState(parsePuzzleRoom(spec));
  const sat = (st: GameState) =>
    st.colorLocks?.[0] && colorLockSatisfied(st.colorLocks[0]) ? "T" : "F";
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

function build(rng: Rng, seed: number): GeneratedQuorum | null {
  const W = 28;
  const H = 12;
  const grid: number[][] = Array.from({ length: H }, () => Array(W).fill(WALL));

  // Four chambers A|B|C|K sharing a top row so the doorway row dr sits inside all of them. One wall
  // column between neighbours; the sole floor gap in it is that pair's door.
  const ry = 2;
  const dr = ry + 1;
  const w = [ri(rng, 3, 4), ri(rng, 3, 4), ri(rng, 3, 4), ri(rng, 3, 4)];
  const h = [ri(rng, 3, 4), ri(rng, 3, 4), ri(rng, 3, 4), ri(rng, 3, 4)];
  const x: number[] = [2];
  const wallCols: number[] = [];
  for (let i = 1; i < 4; i++) {
    wallCols.push(x[i - 1] + w[i - 1]); // wall column between room i-1 and i
    x.push(wallCols[i - 1] + 1);
  }
  if (x[3] + w[3] >= W - 1) return null; // ran off the canvas

  const carveRect = (rx: number, rw: number, rh: number) => {
    for (let yy = ry; yy < ry + rh; yy++) for (let cx = rx; cx < rx + rw; cx++) grid[yy][cx] = FLOOR;
  };
  for (let i = 0; i < 4; i++) carveRect(x[i], w[i], h[i]);

  // Inter-room doors on the doorway row.
  const doorAB: [number, number] = [dr, wallCols[0]];
  const doorBC: [number, number] = [dr, wallCols[1]];
  const doorCK: [number, number] = [dr, wallCols[2]];
  for (const [dy, dx] of [doorAB, doorBC, doorCK]) grid[dy][dx] = FLOOR;

  // Exit niche below chamber A, reached only through the exit door.
  const ex = x[0] + ri(rng, 0, w[0] - 1);
  const exitDoor: [number, number] = [ry + h[0], ex];
  const Epos: [number, number] = [ry + h[0] + 1, ex];
  if (Epos[0] >= H - 1) return null;
  grid[exitDoor[0]][exitDoor[1]] = FLOOR;
  grid[Epos[0]][Epos[1]] = FLOOR;

  // Place hero + S1 in A, S2 in B, S3 in C, key in K. freeIn picks an unclaimed interior floor cell.
  const claim = new Set<string>();
  const freeIn = (rx: number, rw: number, rh: number): [number, number] | null => {
    const cells: Array<[number, number]> = [];
    for (let yy = ry; yy < ry + rh; yy++)
      for (let cx = rx; cx < rx + rw; cx++)
        if (grid[yy][cx] === FLOOR && !claim.has(`${yy},${cx}`)) cells.push([yy, cx]);
    return cells.length ? cells[ri(rng, 0, cells.length - 1)] : null;
  };
  const take = (c: [number, number] | null): [number, number] | null => {
    if (c) claim.add(`${c[0]},${c[1]}`);
    return c;
  };
  const Hpos = take(freeIn(x[0], w[0], h[0]));
  const S1 = take(freeIn(x[0], w[0], h[0]));
  const S2 = take(freeIn(x[1], w[1], h[1]));
  const S3 = take(freeIn(x[2], w[2], h[2]));
  const kPos = take(freeIn(x[3], w[3], h[3]));
  if (!Hpos || !S1 || !S2 || !S3 || !kPos) return null;

  // Cut-checks: every door must be the only link between the parts it separates. Flood from a cell
  // certainly in A on the doorway row, treating each door as wall in turn.
  const aC: [number, number] = [dr, x[0]];
  const noAB = reachableFloor(grid, aC, doorAB);
  if (noAB.has(`${S2[0]},${S2[1]}`) || noAB.has(`${kPos[0]},${kPos[1]}`)) return null;
  const noBC = reachableFloor(grid, aC, doorBC);
  if (noBC.has(`${S3[0]},${S3[1]}`) || noBC.has(`${kPos[0]},${kPos[1]}`)) return null;
  if (reachableFloor(grid, aC, doorCK).has(`${kPos[0]},${kPos[1]}`)) return null;
  if (reachableFloor(grid, aC, exitDoor).has(`${Epos[0]},${Epos[1]}`)) return null;

  // Render, then crop to a tight wall ring.
  const chars: string[][] = grid.map((row) => row.map((c) => (c === WALL ? "#" : ".")));
  chars[Hpos[0]][Hpos[1]] = "H";
  chars[S1[0]][S1[1]] = "C";
  chars[S2[0]][S2[1]] = "C";
  chars[S3[0]][S3[1]] = "C";
  chars[kPos[0]][kPos[1]] = "k";
  chars[Epos[0]][Epos[1]] = "E";
  // Start is at quorum (count 2): the three gates are retracted ('v'), the one invertedGate is up
  // ('^'). parse re-syncs from `initial` regardless, so these are only a consistent seed.
  chars[doorAB[0]][doorAB[1]] = "v";
  chars[doorCK[0]][doorCK[1]] = "v";
  chars[exitDoor[0]][exitDoor[1]] = "v";
  chars[doorBC[0]][doorBC[1]] = "^";

  let minY = H, maxY = 0, minX = W, maxX = 0;
  for (let yy = 0; yy < H; yy++)
    for (let xx = 0; xx < W; xx++)
      if (chars[yy][xx] !== "#") {
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
      }
  minY = Math.max(0, minY - 1);
  minX = Math.max(0, minX - 1);
  maxY = Math.min(H - 1, maxY + 1);
  maxX = Math.min(W - 1, maxX + 1);
  const off = (yx: [number, number]): [number, number] => [yx[0] - minY, yx[1] - minX];
  const map = chars.slice(minY, maxY + 1).map((r) => r.slice(minX, maxX + 1).join(""));

  const S1c = off(S1), S2c = off(S2), S3c = off(S3);
  const spec: PuzzleRoomSpec = {
    name: `Quorum #${seed}`,
    asks:
      `THREE colour switches, one lock — the door opens while at least TWO of them match (a 2-of-3 ` +
      `majority), and the middle door is the opposite. It starts at quorum with the exit already ` +
      `open but the key sealed behind the middle door. Hold one switch as an anchor and walk the ` +
      `majority down the corridor and back to fetch the key. Does the counting read as new logic?`,
    map,
    trackOver: "lava",
    colorLocks: [
      {
        switches: [S1c, S2c, S3c],
        colors: 2,
        rule: "threshold",
        target: [1, 1, 1],
        k: 2,
        initial: [1, 1, 0],
        gates: [off(doorAB), off(doorCK), off(exitDoor)],
        invertedGates: [off(doorBC)],
      },
    ],
    sword: true,
    shield: true,
  };

  // ---- Certification (all via the real solver / real engine) ----
  const logic = requiresLogic(spec); // C1 solvable & C3 no mindless-suite policy wins
  if (!logic.ok) return null;
  const solved = logic.full;
  if (solved.minTurns < MIN_TURNS) return null; // C2 reject a degenerate short roll

  // C4 THRESHOLD IS ESSENTIAL: the AND form (rule "match", = 3-of-3) of this exact room is
  // unsolvable — the majority's spare is what makes it winnable, which `match` cannot express.
  const andForm = solvePuzzleRoom(
    parsePuzzleRoom({
      ...spec,
      colorLocks: [{ ...spec.colorLocks![0], rule: "match", k: undefined }],
    }),
    { maxStates: 120_000, maxTurns: 200 }
  );
  if (andForm.solvable || andForm.capped) return null;

  // C5 LOCK LOAD-BEARING: strip the lock and the doors freeze; the key is sealed away.
  const noLock = solvePuzzleRoom(parsePuzzleRoom({ ...spec, colorLocks: [] }), {
    maxStates: 120_000,
    maxTurns: 200,
  });
  if (noLock.solvable || noLock.capped) return null;

  // C6 EVERY SWITCH LOAD-BEARING: drop each switch (its C→floor; the lock becomes a 2-of-2 = AND over
  // the other two) and the room must be unsolvable — no switch is a spare you can spare.
  const swCoords = [S1c, S2c, S3c];
  for (let i = 0; i < 3; i++) {
    const keep = [0, 1, 2].filter((j) => j !== i);
    const variant: PuzzleRoomSpec = {
      ...spec,
      map: withCell(spec.map, swCoords[i][0], swCoords[i][1], "."),
      colorLocks: [
        {
          switches: keep.map((j) => swCoords[j]),
          colors: 2,
          rule: "threshold",
          target: [1, 1],
          k: 2,
          initial: keep.map((j) => [1, 1, 0][j]),
          gates: spec.colorLocks![0].gates,
          invertedGates: spec.colorLocks![0].invertedGates,
        },
      ],
    };
    const solo = solvePuzzleRoom(parsePuzzleRoom(variant), { maxStates: 120_000, maxTurns: 200 });
    if (solo.solvable || solo.capped) return null;
  }

  // C7 ANCHOR-SHUTTLE fingerprint: the majority breaks and restores twice (T+F+T+F+T+), and exactly
  // one switch is never pressed on the intended line (the held anchor).
  const trace = satisfiedTrace(spec, solved.solution);
  if (!/^T+F+T+F+T+$/.test(trace)) return null;
  const presses = swCoords.map((c) => countSwitchThrows(spec, solved.solution, c));
  const anchorHeld = presses.filter((p) => p === 0).length === 1;
  if (!anchorHeld) return null;

  return {
    spec,
    meta: { rooms: 4, k: 2, n: 3, presses, anchorHeld },
    seed,
    minTurns: solved.minTurns,
    tier: difficultyTier(solved.minTurns),
    solution: solved.solution,
  };
}

export function generateQuorumRoom(seed: number): GeneratedQuorum {
  for (let attempt = 0; attempt < 80; attempt++) {
    const rng = mulberry32(
      (Math.imul(seed, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0
    );
    const room = build(rng, seed);
    if (room) return room;
  }
  throw new Error(`generateQuorumRoom: no layout certified for seed ${seed}`);
}
