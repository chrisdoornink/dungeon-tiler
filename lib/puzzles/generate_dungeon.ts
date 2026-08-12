// Dungeon-first puzzle generation (v1) — the inverted approach.
//
// The band generator built a puzzle skeleton (regions split by hazard moats) and decorated it, so
// every room read as "tiers of moats". This starts the other way round: generate a NORMAL dungeon
// — rooms joined by corridors — and then FIT puzzle blockades onto its natural chokepoints.
//
// WHY IT ESCAPES THE MOAT LOOK: the layout is a real dungeon (open rooms, thin corridors), and the
// puzzle is a handful of gates on that layout, not the layout itself.
//
// WHY IT NEEDS NO BRUTE-FORCE SOLVER: the rooms are connected as a TREE, so every corridor is a
// BRIDGE — the only connection between the two halves it joins. A blockade on a corridor is
// therefore provably REQUIRED (remove it and the goal is unreachable), by a cut argument, not a
// search. And it is SOLVABLE BY CONSTRUCTION: each gate's switch sits in the room on the hero's
// side of that corridor, so opening the gates root-outward always works. Both facts are O(rooms),
// which is what lets these grow past what the solver could ever certify.
//
// v1 fits only spike-gates (a bed across a corridor, opened by a switch) plus a key the exit needs.
// Ferries in flooded rooms, colour locks, and mutual-exclusion trades are the next fittings.
import type { PuzzleRoomSpec } from "./rooms";
import { parsePuzzleRoom } from "./rooms";
import { mulberry32, difficultyTier, type DifficultyTier } from "./generate";
import { solvePuzzleRoom, type Action } from "./solver";

type Rng = () => number;
const ri = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

interface DRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface DEdge {
  parent: number;
  child: number;
  /** Corridor tiles that lie OUTSIDE every room — the ones a gate can sit on as a clean cut. */
  cut: Array<[number, number]>;
}

const FLOOR = 0;
const WALL = 1;

function roomsApart(a: DRoom, b: DRoom): boolean {
  // A two-tile margin on some axis, so there is real corridor to carve (and to gate) between them.
  return (
    a.x > b.x + b.w + 1 ||
    b.x > a.x + a.w + 1 ||
    a.y > b.y + b.h + 1 ||
    b.y > a.y + a.h + 1
  );
}

function inAnyRoom(rooms: DRoom[], y: number, x: number): boolean {
  return rooms.some(
    (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
  );
}

/** Carve an L-corridor between two room centres, returning the tiles that fall outside all rooms. */
function carveCorridor(
  grid: number[][],
  rooms: DRoom[],
  a: DRoom,
  b: DRoom,
  rng: Rng
): Array<[number, number]> {
  const ax = Math.floor(a.x + a.w / 2);
  const ay = Math.floor(a.y + a.h / 2);
  const bx = Math.floor(b.x + b.w / 2);
  const by = Math.floor(b.y + b.h / 2);
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

export interface DungeonMeta {
  rooms: number;
  gates: number;
  keyDetour: boolean;
  /** A mutual-exclusion trade drives the key door and the exit door from one switch. */
  trade: boolean;
}

export interface GeneratedDungeon {
  spec: PuzzleRoomSpec;
  meta: DungeonMeta;
  seed: number;
  minTurns: number;
  tier: DifficultyTier;
  solution: Action[];
}

interface Built {
  grid: number[][];
  rooms: DRoom[];
  edges: DEdge[];
  W: number;
  H: number;
}

/** Seeded rooms joined as a random tree (every edge a bridge). Returns null on a bad dice roll. */
function buildLayout(rng: Rng): Built | null {
  const W = ri(rng, 17, 21);
  const H = ri(rng, 13, 17);
  const roomCount = ri(rng, 4, 5);
  const grid: number[][] = Array.from({ length: H }, () => Array(W).fill(WALL));
  const rooms: DRoom[] = [];
  for (let i = 0; i < roomCount; i++) {
    for (let t = 0; t < 40; t++) {
      const w = ri(rng, 3, 5);
      const h = ri(rng, 3, 4);
      const x = ri(rng, 1, W - w - 2);
      const y = ri(rng, 1, H - h - 2);
      const r: DRoom = { x, y, w, h };
      if (rooms.every((o) => roomsApart(r, o))) {
        rooms.push(r);
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = FLOOR;
        break;
      }
    }
  }
  if (rooms.length < 3) return null; // too cramped this roll — rebuild

  // Random spanning tree: each room after the first attaches to one earlier room. n-1 edges, no
  // cycles, so every corridor is a bridge.
  const edges: DEdge[] = [];
  for (let i = 1; i < rooms.length; i++) {
    // Bias toward a CHAIN, not a star. A star (several rooms hanging off room 0) dumps several gate
    // switches into the hero's starting room, all usable at once — the "two switches next to the
    // hero" pattern. A chain sequences them: each switch is behind the door the previous one
    // dropped, so only one is reachable until you hit it. Room 0 keeps exactly one child, and any
    // branch hangs off a MIDDLE room, never the hero's.
    let parent: number;
    if (i === 1) parent = 0;
    else if (i === rooms.length - 1)
      parent = ri(rng, 1, i - 1); // the LAST room is always a branch — the key's side passage
    else if (rng() < 0.75) parent = i - 1;
    else parent = ri(rng, 1, i - 1);
    const cut = carveCorridor(grid, rooms, rooms[parent], rooms[i], rng);
    edges.push({ parent, child: i, cut });
  }
  // Solid perimeter.
  for (let x = 0; x < W; x++) {
    grid[0][x] = WALL;
    grid[H - 1][x] = WALL;
  }
  for (let y = 0; y < H; y++) {
    grid[y][0] = WALL;
    grid[y][W - 1] = WALL;
  }
  return { grid, rooms: rooms.slice(), edges, W, H };
}

/** Children adjacency of the room tree (rooted at 0), plus each node's parent edge. */
function treeStructure(rooms: DRoom[], edges: DEdge[]) {
  const children: number[][] = rooms.map(() => []);
  const parentEdge: (DEdge | null)[] = rooms.map(() => null);
  for (const e of edges) {
    children[e.parent].push(e.child);
    parentEdge[e.child] = e;
  }
  // Depth + path-from-root, by BFS from room 0.
  const depth = rooms.map(() => -1);
  const parent = rooms.map(() => -1);
  depth[0] = 0;
  const q = [0];
  while (q.length) {
    const u = q.shift() as number;
    for (const v of children[u]) {
      depth[v] = depth[u] + 1;
      parent[v] = u;
      q.push(v);
    }
  }
  return { children, parentEdge, depth, parent };
}

/** The chain of edges from room 0 down to `room`, root-first. */
function edgesToRoot(
  room: number,
  parent: number[],
  parentEdge: (DEdge | null)[]
): DEdge[] {
  const chain: DEdge[] = [];
  let cur = room;
  while (parent[cur] !== -1) {
    const e = parentEdge[cur];
    if (e) chain.push(e);
    cur = parent[cur];
  }
  return chain.reverse();
}

/**
 * Fit puzzle blockades onto a seeded dungeon and emit a PuzzleRoomSpec. Solvable by construction and
 * every gate required by the tree-bridge argument, so no solver run is needed to ship it — though a
 * caller may still solver-check small ones.
 */
export function generateDungeonRoom(seed: number): GeneratedDungeon {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = mulberry32(
      (Math.imul(seed, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0
    );
    const built = buildLayout(rng);
    if (!built) continue;
    const { grid, rooms, edges } = built;
    const { parentEdge, depth, parent } = treeStructure(rooms, edges);

    // Roles. Hero at room 0. Exit is the deepest room. The key is the deepest OTHER room whose path
    // branches off the exit's path (a real detour) — else the deepest remaining room.
    const hero = 0;
    const key = rooms.length - 1; // the forced branch (see buildLayout) — the key's side passage
    let exit = 0;
    for (let i = 1; i < rooms.length; i++) if (i !== key && depth[i] > depth[exit]) exit = i;
    if (exit === 0) continue; // needs a non-key destination room
    const exitPath = new Set(
      edgesToRoot(exit, parent, parentEdge).map((e) => e.child)
    );

    const keyDetour = !exitPath.has(key);

    // A free floor tile inside a room (avoiding tiles already claimed).
    const claimed = new Set<string>();
    const freeInRoom = (roomId: number): [number, number] | null => {
      const r = rooms[roomId];
      const cells: Array<[number, number]> = [];
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          if (grid[y][x] === FLOOR && !claimed.has(`${y},${x}`)) cells.push([y, x]);
      if (cells.length === 0) return null;
      const c = cells[ri(rng, 0, cells.length - 1)];
      claimed.add(`${c[0]},${c[1]}`);
      return c;
    };

    const heroPos = freeInRoom(hero);
    const exitPos = freeInRoom(exit);
    const keyPos = freeInRoom(key);
    if (!heroPos || !exitPos || !keyPos) continue;

    // Edges to gate: everything on the hero->exit and hero->key paths. Each plain gate is a bed on a
    // corridor cut, opened by a switch in the room on the HERO side (its parent) — reachable before
    // the bed by opening the doors above it first.
    const exitChain = edgesToRoot(exit, parent, parentEdge);
    const keyChain = edgesToRoot(key, parent, parentEdge);
    const gateEdges = new Set<DEdge>([...exitChain, ...keyChain]);

    // A TRADE — the interlock the playtests liked. When the key is down a branch, drive the branch
    // door and the exit's FINAL door from ONE switch in OPPOSITE polarity, so they can never both be
    // open: take the key with the branch open (exit sealed), then flip to open the exit (branch
    // sealed). The switch sits at the branch point, reachable before either door. Re-armable, so
    // there is no way to strand yourself.
    let trade: {
      branch: [number, number];
      exit: [number, number];
      switchAt: [number, number];
    } | null = null;
    const exitFinalEdge = exitChain[exitChain.length - 1] ?? null;
    const branchEdge = keyDetour
      ? keyChain.find((e) => !exitPath.has(e.child)) ?? null
      : null;
    if (branchEdge && exitFinalEdge && branchEdge !== exitFinalEdge && rng() < 0.7) {
      const branchBed = branchEdge.cut.find((t) => !claimed.has(`${t[0]},${t[1]}`));
      // Must be a DIFFERENT tile from the branch bed — the two corridors can overlap, and one tile
      // driven as both gate and invertedGate would cancel out (and render as a single bed).
      const exitBed = exitFinalEdge.cut.find(
        (t) =>
          !claimed.has(`${t[0]},${t[1]}`) &&
          !(branchBed && t[0] === branchBed[0] && t[1] === branchBed[1])
      );
      const sw = freeInRoom(branchEdge.parent);
      if (branchBed && exitBed && sw) {
        claimed.add(`${branchBed[0]},${branchBed[1]}`);
        claimed.add(`${exitBed[0]},${exitBed[1]}`);
        trade = { branch: branchBed, exit: exitBed, switchAt: sw };
        gateEdges.delete(branchEdge);
        gateEdges.delete(exitFinalEdge);
      }
    }

    const beds: Array<{ at: [number, number]; switchAt: [number, number] }> = [];
    let ok = true;
    for (const e of gateEdges) {
      const bedTile = e.cut.find((t) => !claimed.has(`${t[0]},${t[1]}`));
      const sw = freeInRoom(e.parent);
      if (!bedTile || !sw) {
        ok = false;
        break;
      }
      claimed.add(`${bedTile[0]},${bedTile[1]}`);
      beds.push({ at: bedTile, switchAt: sw });
    }
    if (!ok) continue;

    // ---- render to ASCII ----
    const chars: string[][] = grid.map((row) =>
      row.map((c) => (c === WALL ? "#" : "."))
    );
    chars[heroPos[0]][heroPos[1]] = "H";
    chars[exitPos[0]][exitPos[1]] = "E";
    chars[keyPos[0]][keyPos[1]] = "k";
    const toggles: NonNullable<PuzzleRoomSpec["toggles"]> = [];
    for (const b of beds) {
      chars[b.at[0]][b.at[1]] = "^"; // bed UP (blocking) until its switch is thrown
      chars[b.switchAt[0]][b.switchAt[1]] = "T";
      toggles.push({ switchAt: b.switchAt, gates: [b.at], on: false });
    }
    if (trade) {
      chars[trade.branch[0]][trade.branch[1]] = "^"; // branch door CLOSED (opens when switch on)
      chars[trade.exit[0]][trade.exit[1]] = "v"; // exit door OPEN (closes when switch on)
      chars[trade.switchAt[0]][trade.switchAt[1]] = "T";
      toggles.push({
        switchAt: trade.switchAt,
        gates: [trade.branch], // retracts (opens) while on
        invertedGates: [trade.exit], // rises (closes) while on
        on: false,
      });
    }

    // ---- HAZARD TERRAIN: some room floor becomes LAVA (a hard barrier you route around) or DEEP
    // WATER (swimmable, snuffs the torch) — the "some walls can be lava/water" step, and groundwork
    // for hazard-crossing mechanics. Placed only on INTERIOR room floor away from doorways so a
    // pool can't seal a corridor, and every hazard tile is checked to keep the room's floor one
    // connected piece; the solver backstop below is the final guarantee.
    const isDoorwayAdjacent = (y: number, x: number): boolean => {
      for (const [ny, nx] of [
        [y - 1, x],
        [y + 1, x],
        [y, x - 1],
        [y, x + 1],
      ] as Array<[number, number]>) {
        // A corridor tile is floor that lies outside every room.
        if (chars[ny]?.[nx] === "." && !inAnyRoom(rooms, ny, nx)) return true;
      }
      return false;
    };
    const roomFloorStaysConnected = (r: DRoom): boolean => {
      const cells: Array<[number, number]> = [];
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          if (chars[y][x] === "." || chars[y][x] === "~") cells.push([y, x]);
      if (cells.length === 0) return true;
      const seen = new Set<string>([`${cells[0][0]},${cells[0][1]}`]);
      const stack = [cells[0]];
      while (stack.length) {
        const [y, x] = stack.pop() as [number, number];
        for (const [ny, nx] of [
          [y - 1, x],
          [y + 1, x],
          [y, x - 1],
          [y, x + 1],
        ] as Array<[number, number]>) {
          if (ny < r.y || ny >= r.y + r.h || nx < r.x || nx >= r.x + r.w) continue;
          if (chars[ny][nx] !== "." && chars[ny][nx] !== "~") continue;
          const key = `${ny},${nx}`;
          if (seen.has(key)) continue;
          seen.add(key);
          stack.push([ny, nx]);
        }
      }
      return seen.size === cells.length;
    };
    for (const r of rooms) {
      if (rng() < 0.35) continue; // not every room gets a hazard
      const kind = rng() < 0.55 ? "L" : "~"; // lava more often than water
      const patch = ri(rng, 2, 4);
      let placed = 0;
      for (let tries = 0; tries < 20 && placed < patch; tries++) {
        const y = ri(rng, r.y + 1, r.y + r.h - 2);
        const x = ri(rng, r.x + 1, r.x + r.w - 2);
        if (chars[y]?.[x] !== "." || isDoorwayAdjacent(y, x)) continue;
        chars[y][x] = kind;
        // Lava is a hard cut, so it must not split the room; water is passable, so it never does.
        if (kind === "L" && !roomFloorStaysConnected(r)) chars[y][x] = ".";
        else placed++;
      }
    }

    // Crop the dead wall margin (rooms sit inside a larger grid, leaving big empty borders) to a
    // one-tile wall ring, and shift every wired coordinate with it so the toggles still line up.
    let minY = chars.length;
    let maxY = 0;
    let minX = chars[0].length;
    let maxX = 0;
    for (let y = 0; y < chars.length; y++) {
      for (let x = 0; x < chars[0].length; x++) {
        if (chars[y][x] !== "#") {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    const cy = Math.max(0, minY - 1);
    const cx = Math.max(0, minX - 1);
    const ey = Math.min(chars.length - 1, maxY + 1);
    const ex = Math.min(chars[0].length - 1, maxX + 1);
    const cropped = chars.slice(cy, ey + 1).map((row) => row.slice(cx, ex + 1));
    const off = ([y, x]: [number, number]): [number, number] => [y - cy, x - cx];
    for (const t of toggles) {
      t.switchAt = off(t.switchAt);
      t.gates = (t.gates ?? []).map(off);
      if (t.invertedGates) t.invertedGates = t.invertedGates.map(off);
    }

    const spec: PuzzleRoomSpec = {
      name: `Dungeon #${seed}`,
      asks:
        `A dungeon of ${rooms.length} rooms. Each barred door drops when you throw its switch (in a ` +
        `room you can already reach), so you open the way one door at a time. ` +
        (trade
          ? `The key is down a side passage sealed by a TRADE switch — opening it seals the exit, so ` +
            `take the key, then flip back to leave.`
          : `Fetch the key${keyDetour ? " down the side passage" : ""}, then reach the exit.`),
      map: cropped.map((r) => r.join("")),
      trackOver: "lava",
      toggles,
      sword: true,
      shield: true,
    };

    // Solver BACKSTOP. The tree-bridge argument says these are solvable by construction, but
    // corridors can cross and quietly break that abstraction (an over-blocked layout slips through),
    // so a cheap solve (<100ms on rooms this size — nothing like the 25s band rooms) rejects the
    // bad rolls. As dungeons grow past what the solver can afford, the constructive proof has to
    // stand on its own; for now this keeps every shipped room honestly solvable.
    const solved = solvePuzzleRoom(parsePuzzleRoom(spec), {
      maxStates: 80_000,
      maxTurns: 200,
    });
    if (!solved.solvable || solved.capped) continue;

    return {
      spec,
      meta: {
        rooms: rooms.length,
        gates: beds.length + (trade ? 2 : 0),
        keyDetour,
        trade: !!trade,
      },
      seed,
      minTurns: solved.minTurns,
      tier: difficultyTier(solved.minTurns),
      solution: solved.solution,
    };
  }
  throw new Error(`generateDungeonRoom: no layout certified for seed ${seed}`);
}
