// Constraint-first puzzle generation — build the LOGIC, then a layout that enforces it.
//
// The dungeon generator made solvable mazes: every switch was local and obvious, so a player could
// walk greedily (flip the nearest switch, step through the door) and never think. That is not a
// puzzle. This starts from a CONSTRAINT that provably requires reasoning, and realises it spatially.
//
// v1 template — THE SHUTTLE (a mutual exclusion with a dependency):
//   * One switch drives the door to the KEY and the door to the EXIT in OPPOSITE polarity, so they
//     can never both be open.
//   * The exit needs the key, and the two wings sit on opposite sides of a junction, away from the
//     switch.
//   Why it needs logic: a greedy beeline to the exit arrives WITHOUT the key (you skipped the key
//   wing, which the exit-open state seals). You must reason — open the key side, fetch the key, flip
//   BACK, then take the exit. The solution re-flips the one switch; a mindless one-flip-as-you-go
//   walk cannot solve it. That "the switch must be thrown twice" is the checkable signature of the
//   constraint, and the generator refuses any layout that lacks it.
import type { PuzzleRoomSpec } from "./rooms";
import { parsePuzzleRoom } from "./rooms";
import { mulberry32, difficultyTier, type DifficultyTier } from "./generate";
import { solvePuzzleRoom, type Action } from "./solver";
import { countSwitchThrows } from "./verify";

type Rng = () => number;
const ri = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

const FLOOR = 0;
const WALL = 1;

interface DRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}

function roomCenter(r: DRoom): [number, number] {
  return [Math.floor(r.y + r.h / 2), Math.floor(r.x + r.w / 2)];
}

function overlaps(a: DRoom, b: DRoom): boolean {
  return !(
    a.x > b.x + b.w + 1 ||
    b.x > a.x + a.w + 1 ||
    a.y > b.y + b.h + 1 ||
    b.y > a.y + a.h + 1
  );
}

function inAnyRoom(rooms: DRoom[], y: number, x: number): boolean {
  return rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** Carve an L corridor between two room centres; returns the tiles outside every room (gateable). */
function carve(
  grid: number[][],
  rooms: DRoom[],
  a: DRoom,
  b: DRoom,
  rng: Rng
): Array<[number, number]> {
  const [ay, ax] = roomCenter(a);
  const [by, bx] = roomCenter(b);
  const tiles: Array<[number, number]> = [];
  const put = (y: number, x: number) => {
    grid[y][x] = FLOOR;
    if (!inAnyRoom(rooms, y, x)) tiles.push([y, x]);
  };
  if (rng() < 0.5) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) put(ay, x);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) put(y, bx);
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) put(y, ax);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) put(by, x);
  }
  return tiles;
}

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

export interface ShuttleMeta {
  rooms: number;
  /** Times the mutual-exclusion switch is thrown in the optimal solution (>= 2 == real logic). */
  switchThrows: number;
}

export interface GeneratedShuttle {
  spec: PuzzleRoomSpec;
  meta: ShuttleMeta;
  seed: number;
  minTurns: number;
  tier: DifficultyTier;
  solution: Action[];
}

function build(rng: Rng, seed: number): GeneratedShuttle | null {
  const W = ri(rng, 24, 28);
  const H = ri(rng, 20, 24);
  const grid: number[][] = Array.from({ length: H }, () => Array(W).fill(WALL));

  // A rough cross: junction J central, the KEY and EXIT wings on two opposite sides, the hero
  // (with the switch) on a third side — so operating the far doors always means a trip back.
  const cy = Math.floor(H / 2);
  const cx = Math.floor(W / 2);
  const span = ri(rng, 6, 8);
  const jitter = () => ri(rng, -1, 1);
  const mk = (ccy: number, ccx: number): DRoom => {
    const w = ri(rng, 3, 4);
    const h = ri(rng, 3, 4);
    const x = Math.max(1, Math.min(W - w - 1, ccx - Math.floor(w / 2)));
    const y = Math.max(1, Math.min(H - h - 1, ccy - Math.floor(h / 2)));
    return { x, y, w, h };
  };
  // Two orientations so it isn't always the same cross.
  const vertical = rng() < 0.5;
  const J = mk(cy + jitter(), cx + jitter());
  const K = vertical ? mk(cy - span, cx + jitter()) : mk(cy + jitter(), cx - span);
  const E = vertical ? mk(cy + span, cx + jitter()) : mk(cy + jitter(), cx + span);
  const Hr = vertical ? mk(cy + jitter(), cx - span) : mk(cy - span, cx + jitter());
  const rooms = [Hr, J, K, E];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++)
      if (overlaps(rooms[i], rooms[j])) return null; // too cramped this roll

  for (const r of rooms)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = FLOOR;

  carve(grid, rooms, Hr, J, rng); // hero -> junction (open)
  const cutK = carve(grid, rooms, J, K, rng); // junction -> key (door K)
  const cutE = carve(grid, rooms, J, E, rng); // junction -> exit (door E)

  for (let x = 0; x < W; x++) {
    grid[0][x] = WALL;
    grid[H - 1][x] = WALL;
  }
  for (let y = 0; y < H; y++) {
    grid[y][0] = WALL;
    grid[y][W - 1] = WALL;
  }

  const doorK = cutK[Math.floor(cutK.length / 2)];
  const doorE = cutE[Math.floor(cutE.length / 2)];
  if (!doorK || !doorE) return null;

  // Both doors must be genuine cuts (no corridor crossing gave a bypass).
  const heroC = roomCenter(Hr);
  const kC = roomCenter(K);
  const eC = roomCenter(E);
  if (reachableFloor(grid, heroC, doorK).has(`${kC[0]},${kC[1]}`)) return null;
  if (reachableFloor(grid, heroC, doorE).has(`${eC[0]},${eC[1]}`)) return null;

  // Render.
  const chars: string[][] = grid.map((row) => row.map((c) => (c === WALL ? "#" : ".")));
  const claim = new Set<string>();
  const put = (yx: [number, number], ch: string) => {
    chars[yx[0]][yx[1]] = ch;
    claim.add(`${yx[0]},${yx[1]}`);
  };
  // A free floor cell in a room.
  const freeIn = (r: DRoom): [number, number] | null => {
    const cells: Array<[number, number]> = [];
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (chars[y][x] === "." && !claim.has(`${y},${x}`)) cells.push([y, x]);
    return cells.length ? cells[ri(rng, 0, cells.length - 1)] : null;
  };

  // Pick-and-claim in sequence: freeIn only reads `claim`, so two draws from the same room must not
  // both be resolved before either is committed, or they can collide (hero + switch onto one tile).
  const heroPos = freeIn(Hr);
  if (!heroPos) return null;
  put(heroPos, "H");
  const swPos = freeIn(Hr); // switch shares the hero's start room (fine for now; its DOORS are remote)
  if (!swPos) return null;
  put(swPos, "T");
  const keyPos = freeIn(K);
  if (!keyPos) return null;
  put(keyPos, "k");
  const exitPos = freeIn(E);
  if (!exitPos) return null;
  put(exitPos, "E");
  // Door K starts CLOSED (^, opens when the switch is on); door E starts OPEN (v, closes when on).
  put(doorK, "^");
  put(doorE, "v");

  // Crop to a tight wall ring around the used area — the cross leaves large empty quadrants.
  let minY = H,
    maxY = 0,
    minX = W,
    maxX = 0;
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

  const spec: PuzzleRoomSpec = {
    name: `Shuttle #${seed}`,
    asks:
      `ONE switch, two doors it can't open at once: the KEY side and the EXIT side. The exit needs ` +
      `the key. Beelining to the exit gets you there empty-handed — open the key side first, fetch ` +
      `it, then flip back for the exit. Does this feel like a puzzle now?`,
    map,
    trackOver: "lava",
    toggles: [
      {
        switchAt: off(swPos),
        gates: [off(doorK)], // opens (retracts) when the switch is on
        invertedGates: [off(doorE)], // closes (rises) when the switch is on
        on: false,
      },
    ],
    sword: true,
    shield: true,
  };
  const swPosC = off(swPos);

  // The Shuttle is a BASELINE, not a certified puzzle: adversarial review showed a reflex agent
  // (walk to the goal; when blocked, step on the nearest switch) clears every single-switch room,
  // because re-pressing the lone switch is automatic. So this gate only checks the structure —
  // solvable, and the optimal line does throw the switch twice — and does NOT claim requiresLogic.
  // The certified templates (Colour Airlock, and the logic-gate family) gate on verify.ts.
  const solved = solvePuzzleRoom(parsePuzzleRoom(spec), { maxStates: 120_000, maxTurns: 240 });
  if (!solved.solvable || solved.capped) return null;

  const switchThrows = countSwitchThrows(spec, solved.solution, swPosC);
  if (switchThrows < 2) return null;

  return {
    spec,
    meta: { rooms: rooms.length, switchThrows },
    seed,
    minTurns: solved.minTurns,
    tier: difficultyTier(solved.minTurns),
    solution: solved.solution,
  };
}

export function generateShuttleRoom(seed: number): GeneratedShuttle {
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = mulberry32(
      (Math.imul(seed, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0
    );
    const room = build(rng, seed);
    if (room) return room;
  }
  throw new Error(`generateShuttleRoom: no layout certified for seed ${seed}`);
}
