// Approach levels for the three daily boss-room entrances (see
// .claude/features/boss-daily-entrances/index.md). These are self-contained
// GameStates used by the /test-boss-entrances harness so the entrances can be
// played end-to-end before wiring them into daily generation:
//
//   1. MOAT      — a Level-3 corner drowned in lava or deep water. Cross the lava
//                  by cooling a rock path to obsidian (~a day's rocks), or wade the
//                  deep water (losing your torch) / bridge it with stepping stones.
//                  A lockless BOSS_ENTRANCE waits on the far side.
//   2. DOUSE     — a dark cave. A deep-water channel snuffs your torch; only in the
//                  dark does the DARK_PORTAL beyond it appear (invisible in the light).
//   3. BOMB      — a walled-up doorway somewhere on the floor: a cracked wall tile
//                  bracketed by two wall torches. Bomb it open and the cleared tile is
//                  a BOSS_ENTRANCE. Bare cracked tiles (no torches) are decoys that
//                  open onto a reward pot instead.
//
// Stepping onto either entrance subtype warps into the Shaper arena (enterBossRoom
// in game-state.ts).
import { FLOOR, WALL, FLOWERS, Direction, TileSubtype } from "../map/constants";
import type { MapData, SealPayload, SealPayloads } from "../map/types";
import type { GameState } from "../map/game-state";
import { generateCompleteMapForFloor } from "../map/map-features";
import { computeTorchGlow } from "../torch_glow";
import { Enemy } from "../enemy";
import { withPatchedMathRandom, type Rng } from "../rng";

export type MoatElement = "lava" | "water";

/** Boss-entrance levels are haunted: this many ghosts prowl the L3-sized rooms. */
const GHOST_COUNT = 3;

/** Place up to `count` ghosts on empty floor tiles, away from the hero + each other. */
function placeGhosts(map: MapData, count: number, hy: number, hx: number): Enemy[] {
  const cands: Array<[number, number]> = [];
  for (let y = 1; y < map.tiles.length - 1; y++) {
    for (let x = 1; x < map.tiles[0].length - 1; x++) {
      if (map.tiles[y][x] !== FLOOR) continue;
      if ((map.subtypes[y]?.[x]?.length ?? 0) !== 0) continue; // bare floor only
      if (Math.abs(y - hy) + Math.abs(x - hx) < 5) continue; // not on top of the hero
      cands.push([y, x]);
    }
  }
  cands.sort(
    (a, b) => Math.abs(b[0] - hy) + Math.abs(b[1] - hx) - (Math.abs(a[0] - hy) + Math.abs(a[1] - hx))
  );
  const chosen: Array<[number, number]> = [];
  for (const [y, x] of cands) {
    if (chosen.length >= count) break;
    if (chosen.every(([cy, cx]) => Math.abs(cy - y) + Math.abs(cx - x) >= 3)) chosen.push([y, x]);
  }
  return chosen.map(([y, x]) => {
    const g = new Enemy({ y, x });
    g.kind = "ghost";
    g.health = 2;
    g.maxHealth = 2;
    return g;
  });
}

/** Common GameState scaffold for an approach level. */
function approachState(
  mapData: MapData,
  extra: Partial<GameState>
): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 0,
    runeCount: 0,
    foodCount: 0,
    potionCount: 0,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData,
    recentDeaths: [],
    mode: "normal",
    ...extra,
  } as GameState;
}

/** Scan a map's subtypes for the hero. */
function findPlayerPos(map: MapData): [number, number] {
  for (let y = 0; y < map.subtypes.length; y++)
    for (let x = 0; x < map.subtypes[y].length; x++)
      if (map.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x];
  return [1, 1];
}

// Never overwrite these when placing the cave mouth / carving a spur.
const PROTECTED_SUBS = [
  TileSubtype.EXIT,
  TileSubtype.EXITKEY,
  TileSubtype.KEY,
  TileSubtype.CHEST,
  TileSubtype.OPEN_CHEST,
  TileSubtype.PLAYER,
];
// Existing elemental terrain a lava spur must not run through.
const ELEMENTAL_SUBS = [
  TileSubtype.LAVA,
  TileSubtype.DEEP_WATER,
  TileSubtype.SHALLOW_WATER,
  TileSubtype.OBSIDIAN,
  TileSubtype.STEPPING_STONE,
];

/** Place a lockless cave mouth on the FLOOR tile nearest a map corner. */
function placeEntranceNearCorner(map: MapData, cornerY: number, cornerX: number): void {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  for (let r = 0; r < Math.max(H, W); r++) {
    for (let y = cornerY - r; y <= cornerY + r; y++) {
      for (let x = cornerX - r; x <= cornerX + r; x++) {
        if (y < 1 || x < 1 || y >= H - 1 || x >= W - 1) continue;
        if (map.tiles[y][x] !== FLOOR) continue;
        if (map.subtypes[y][x].some((s) => PROTECTED_SUBS.includes(s))) continue;
        map.subtypes[y][x] = [TileSubtype.BOSS_ENTRANCE]; // dry landing past the moat
        return;
      }
    }
  }
}

/**
 * Drown a map corner in lava or deep water, and set a lockless cave mouth at its tip.
 * Only bare FLOOR is flooded, so the room's exit, key, rocks, pots, torches and faulty
 * floors all survive as dry islands.
 *
 * Base behavior (pre daily-tuning v2): the corner FARTHEST from the hero, a fixed
 * 0.42H × 0.42W rectangle. The 90-day census showed that exact block in that exact spot
 * was a certificate — every moat-water day flooded 18-43% of floor 3 in the far corner,
 * fully separable from natural lake days — so the day type was readable at a glance.
 *
 * `opts.vary` (daily tuning v2, see lib/map/daily_tuning.ts) breaks the certificate on
 * all three axes while keeping every safety rule:
 *   - CORNER: seeded-random among the three corners that are not the one nearest the
 *     hero (so the spawn room never drowns), instead of always the farthest.
 *   - SIZE: each block dimension draws 0.26-0.45 of the grid independently, so the moat
 *     ranges from lake-sized to the old quarter-map and is rarely square.
 *   - SHAPE: a boundary erosion pass then a dilation pass rag the rectangle's edges so
 *     it reads as a body of water rather than a stamped block.
 * Draw discipline: `vary` consumes seeded draws (corner, dims, per-edge-cell rolls), so
 * it MUST stay behind the date gate — an ungated change here would shift every later
 * roll on historical floors. The fallback path already runs this under its own salted
 * stream (see stampBossEntranceWithFallback), which remains correct: draws there come
 * from the salted rng, not the floor's.
 */
function stampCornerMoat(
  map: MapData,
  element: MoatElement,
  opts?: { vary?: boolean }
): void {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const [hy, hx] = findPlayerPos(map);
  const corners: Array<[number, number]> = [
    [1, 1],
    [1, W - 2],
    [H - 2, 1],
    [H - 2, W - 2],
  ];
  let corner: [number, number];
  let fracH = 0.42;
  let fracW = 0.42;
  if (opts?.vary) {
    const nearest = corners.reduce((best, c) =>
      Math.hypot(c[0] - hy, c[1] - hx) < Math.hypot(best[0] - hy, best[1] - hx) ? c : best
    );
    const eligible = corners.filter((c) => c !== nearest);
    corner = eligible[Math.floor(Math.random() * eligible.length)];
    fracH = 0.26 + Math.random() * 0.19; // 0.26-0.45
    fracW = 0.26 + Math.random() * 0.19;
  } else {
    corner = corners.reduce((best, c) =>
      Math.hypot(c[0] - hy, c[1] - hx) > Math.hypot(best[0] - hy, best[1] - hx) ? c : best
    );
  }
  const [cy, cx] = corner;
  const blockH = Math.round(H * fracH);
  const blockW = Math.round(W * fracW);
  const y0 = cy < H / 2 ? 1 : H - 1 - blockH;
  const y1 = cy < H / 2 ? blockH : H - 2;
  const x0 = cx < W / 2 ? 1 : W - 1 - blockW;
  const x1 = cx < W / 2 ? blockW : W - 2;

  const deepSub = element === "lava" ? TileSubtype.LAVA : TileSubtype.DEEP_WATER;
  // Track exactly the tiles THIS stamp floods: the rag passes and the shallow lip must
  // only ever touch our own water, never a pre-existing pool from the floor's water plan.
  const stamped = new Set<string>();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (map.tiles[y][x] === FLOOR && map.subtypes[y][x].length === 0) {
        map.subtypes[y][x] = [deepSub];
        stamped.add(`${y},${x}`);
      }
    }
  }

  const ORTHO_STEPS: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  if (opts?.vary) {
    // Erode: boundary cells (our water touching a non-water tile) un-flood at 35%.
    // Row-major order keeps the seeded draw sequence deterministic.
    const boundary: Array<[number, number]> = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!stamped.has(`${y},${x}`)) continue;
        const onEdge = ORTHO_STEPS.some(([dy, dx]) => !stamped.has(`${y + dy},${x + dx}`));
        if (onEdge) boundary.push([y, x]);
      }
    }
    for (const [y, x] of boundary) {
      if (Math.random() < 0.35) {
        map.subtypes[y][x] = [];
        stamped.delete(`${y},${x}`);
      }
    }
    // Dilate: bare floor hugging two or more of our water cells floods at 30%, pushing
    // soft lobes past the rectangle line.
    const grow: Array<[number, number]> = [];
    for (let y = Math.max(1, y0 - 1); y <= Math.min(H - 2, y1 + 1); y++) {
      for (let x = Math.max(1, x0 - 1); x <= Math.min(W - 2, x1 + 1); x++) {
        if (map.tiles[y][x] !== FLOOR || map.subtypes[y][x].length !== 0) continue;
        const touching = ORTHO_STEPS.filter(([dy, dx]) => stamped.has(`${y + dy},${x + dx}`)).length;
        if (touching >= 2) grow.push([y, x]);
      }
    }
    for (const [y, x] of grow) {
      if (Math.random() < 0.3) {
        map.subtypes[y][x] = [deepSub];
        stamped.add(`${y},${x}`);
      }
    }
  }

  // Water gets a wadeable shallow lip wherever it meets dry land (readability).
  //
  // Which tiles get lipped differs by mode, and the difference is load-bearing:
  //  - base: EVERY deep tile inside the rectangle, exactly as this always worked —
  //    including a pre-existing water-plan pool tile that happens to sit in the rect.
  //    Historical replays require this path byte-identical, quirk included (a shallow
  //    vs deep tile changes isDryWalkable, which changes where the day's switch gate
  //    could go).
  //  - vary: only the tiles THIS stamp flooded, so a natural lake the moat brushes up
  //    against keeps its own banks (including deliberately-cut sheer ones).
  if (element === "water") {
    const lipTargets: Array<[number, number]> = [];
    if (opts?.vary) {
      for (const key of Array.from(stamped)) {
        const [y, x] = key.split(",").map(Number);
        lipTargets.push([y, x]);
      }
    } else {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) lipTargets.push([y, x]);
      }
    }
    for (const [y, x] of lipTargets) {
      if (!map.subtypes[y]?.[x]?.includes(TileSubtype.DEEP_WATER)) continue;
      const touchesDry = ORTHO_STEPS.some(([dy, dx]) => {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || nx < 0 || ny >= H || nx >= W) return false;
        return map.tiles[ny][nx] === FLOOR && map.subtypes[ny][nx].length === 0;
      });
      if (touchesDry) map.subtypes[y][x] = [TileSubtype.SHALLOW_WATER];
    }
  }
  placeEntranceNearCorner(map, cy, cx);
}

function cloneMap(map: MapData): MapData {
  return {
    tiles: map.tiles.map((r) => r.slice()),
    subtypes: map.subtypes.map((r) => r.map((c) => c.slice())),
    environment: map.environment,
  };
}

const ORTHO: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Can the hero stand on (y,x)? Lava + abyss always block; deep water blocks unless
 * `wadeable` (the hero can swim it, losing the torch). Shared by every flood below so
 * "reachable" and "reachable in the dark" can never disagree about the terrain.
 */
function isWalkable(map: MapData, y: number, x: number, wadeable: boolean): boolean {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  if (y < 0 || x < 0 || y >= H || x >= W) return false;
  if (map.tiles[y][x] !== FLOOR && map.tiles[y][x] !== FLOWERS) return false;
  const s = map.subtypes[y]?.[x] ?? [];
  if (s.includes(TileSubtype.LAVA) || s.includes(TileSubtype.OPEN_ABYSS)) return false;
  if (s.includes(TileSubtype.DEEP_WATER) && !wadeable) return false;
  return true;
}

/**
 * Tiles the hero can reach on foot. Lava + abyss always block; deep water blocks
 * unless `wadeable` (the hero can swim it, losing the torch).
 */
function floodReachable(
  map: MapData,
  sy: number,
  sx: number,
  opts?: { wadeable?: boolean }
): Set<string> {
  const passable = (y: number, x: number) =>
    isWalkable(map, y, x, opts?.wadeable === true);
  const seen = new Set<string>();
  if (!passable(sy, sx)) return seen;
  seen.add(`${sy},${sx}`);
  const q: Array<[number, number]> = [[sy, sx]];
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of ORTHO) {
      const ny = y + dy;
      const nx = x + dx;
      const k = `${ny},${nx}`;
      if (seen.has(k) || !passable(ny, nx)) continue;
      seen.add(k);
      q.push([ny, nx]);
    }
  }
  return seen;
}

/**
 * Dress the straight channel into an irregular POOL: grow lava outward from the
 * channel (up to 2 tiles) wherever it's safe, so it reads as a pool with a cooled
 * avenue through it rather than a rote straight strip. The channel itself (the 4-6
 * tile crossing) and the hero's dry approach are never touched, and every added tile
 * is connectivity-checked so the pool can't wall off a legitimate part of the room.
 */
function growLavaPool(
  trial: MapData,
  channel: Array<[number, number]>,
  before: Set<string>,
  carved: Set<string>,
  keepDry: Set<string>,
  hy: number,
  hx: number
): void {
  const H = trial.tiles.length;
  const W = trial.tiles[0].length;
  const eligible = (y: number, x: number): boolean => {
    if (y < 1 || x < 1 || y >= H - 1 || x >= W - 1) return false;
    const key = `${y},${x}`;
    if (carved.has(key) || keepDry.has(key)) return false;
    const t = trial.tiles[y][x];
    if (t !== WALL && t !== FLOOR) return false;
    const s = trial.subtypes[y][x] ?? [];
    return !s.some((sv) => PROTECTED_SUBS.includes(sv) || ELEMENTAL_SUBS.includes(sv));
  };
  const around: Array<[number, number]> = [
    [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  let frontier = channel.slice();
  for (let depth = 0; depth < 2; depth++) {
    const next: Array<[number, number]> = [];
    for (const [fy, fx] of frontier) {
      for (const [dy, dx] of around) {
        const ny = fy + dy;
        const nx = fx + dx;
        const key = `${ny},${nx}`;
        if (!eligible(ny, nx)) continue;
        if (Math.random() < 0.35) continue; // leave gaps -> a ragged, organic edge
        const prevTile = trial.tiles[ny][nx];
        const prevSubs = trial.subtypes[ny][nx];
        trial.tiles[ny][nx] = FLOOR;
        trial.subtypes[ny][nx] = [TileSubtype.LAVA];
        carved.add(key);
        const after = floodReachable(trial, hy, hx);
        let ok = true;
        for (const k of before) {
          if (carved.has(k)) continue;
          if (!after.has(k)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          next.push([ny, nx]);
        } else {
          trial.tiles[ny][nx] = prevTile;
          trial.subtypes[ny][nx] = prevSubs;
          carved.delete(key);
        }
      }
    }
    frontier = next;
  }
}

/**
 * After the pool is grown, guarantee a MINIMUM lava buffer around the entrance:
 * every reachable dry tile must be at least `minBuffer` lava tiles away from the
 * entrance (measured 4-directionally, the way rocks cool a path). The organic pool
 * growth alone can leave 1-2 tile-thick sides that turn the intended 4-6 rock
 * crossing into a 1-2 rock shortcut. Thin spots are fixed by converting the
 * offending dry tiles to lava (connectivity-checked); returns false if any thin
 * spot can't be thickened, so the caller rejects this placement.
 */
function enforceLavaBuffer(
  trial: MapData,
  ey: number,
  ex: number,
  before: Set<string>,
  carved: Set<string>,
  keepDry: Set<string>,
  hy: number,
  hx: number,
  minBuffer: number
): boolean {
  const H = trial.tiles.length;
  const W = trial.tiles[0].length;
  const dirs4: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const isLava = (y: number, x: number): boolean =>
    (trial.subtypes[y]?.[x] ?? []).includes(TileSubtype.LAVA);
  // Each pass may push the lava boundary one ring outward, so a few passes settle it.
  for (let pass = 0; pass < minBuffer + 2; pass++) {
    // BFS through lava from the entrance: dist = rocks needed to reach that tile.
    const dist = new Map<string, number>();
    let frontier: Array<[number, number]> = [];
    for (const [dy, dx] of dirs4) {
      const ny = ey + dy;
      const nx = ex + dx;
      if (isLava(ny, nx)) {
        dist.set(`${ny},${nx}`, 1);
        frontier.push([ny, nx]);
      }
    }
    while (frontier.length) {
      const next: Array<[number, number]> = [];
      for (const [fy, fx] of frontier) {
        const d = dist.get(`${fy},${fx}`)!;
        for (const [dy, dx] of dirs4) {
          const ny = fy + dy;
          const nx = fx + dx;
          const key = `${ny},${nx}`;
          if (!isLava(ny, nx) || dist.has(key)) continue;
          dist.set(key, d + 1);
          next.push([ny, nx]);
        }
      }
      frontier = next;
    }
    // Dry reachable tiles touching lava closer than the buffer = shortcut spots.
    const reach = floodReachable(trial, hy, hx);
    const thin = new Set<string>();
    for (const [key, d] of dist) {
      if (d >= minBuffer) continue;
      const [ly, lx] = key.split(",").map(Number);
      for (const [dy, dx] of dirs4) {
        const ny = ly + dy;
        const nx = lx + dx;
        const nkey = `${ny},${nx}`;
        if (reach.has(nkey) && !isLava(ny, nx)) thin.add(nkey);
      }
    }
    if (thin.size === 0) return true;
    for (const key of thin) {
      const [y, x] = key.split(",").map(Number);
      if (y < 1 || x < 1 || y >= H - 1 || x >= W - 1) return false;
      if (keepDry.has(key)) return false;
      const t = trial.tiles[y][x];
      if (t !== WALL && t !== FLOOR) return false;
      const s = trial.subtypes[y][x] ?? [];
      if (s.some((sv) => PROTECTED_SUBS.includes(sv) || ELEMENTAL_SUBS.includes(sv))) {
        return false;
      }
      trial.tiles[y][x] = FLOOR;
      trial.subtypes[y][x] = [TileSubtype.LAVA];
      carved.add(key);
      const after = floodReachable(trial, hy, hx);
      for (const k of before) {
        if (carved.has(k)) continue;
        if (!after.has(k)) return false; // walled something off — reject placement
      }
    }
  }
  return false;
}

/**
 * Carve a STRAIGHT, 1-wide lava channel as a dead-end spur ending in the boss
 * entrance, so the hero crosses it in a single straight line (cool the tile ahead,
 * step onto it, repeat — never turning, which over lava = instant death). Only
 * carves through WALL tiles, and only commits a placement that (a) leaves every
 * originally-reachable tile still reachable and (b) leaves the entrance reachable
 * ONLY across the lava. Returns false if no such spot exists in this room.
 */
function stampStraightLavaSpur(map: MapData, channelLen: number): boolean {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const [hy, hx] = findPlayerPos(map);
  const before = floodReachable(map, hy, hx);
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  // Prefer approach tiles far from the hero (the secret feels tucked away).
  const approaches = Array.from(before)
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((a, b) => Math.hypot(b[0] - hy, b[1] - hx) - Math.hypot(a[0] - hy, a[1] - hx));
  for (const [ty, tx] of approaches) {
    for (const [dy, dx] of dirs) {
      // The hero must be able to reach the approach tile ALREADY facing the crossing
      // direction (so he can throw into the lava without first turning into it): the
      // tile directly behind it must also be reachable dry ground.
      if (!before.has(`${ty - dy},${tx - dx}`)) continue;
      // A straight run for the channel + one more tile for the entrance. Carve
      // through wall OR bare floor, but never through the hero, items, or existing
      // elemental terrain — the connectivity check below rejects anything unsafe.
      const cells: Array<[number, number]> = [];
      let ok = true;
      for (let i = 1; i <= channelLen + 1; i++) {
        const y = ty + dy * i;
        const x = tx + dx * i;
        if (y < 1 || x < 1 || y >= H - 1 || x >= W - 1) {
          ok = false;
          break;
        }
        const t = map.tiles[y][x];
        if (t !== WALL && t !== FLOOR) {
          ok = false;
          break;
        }
        const cellSubs = map.subtypes[y][x] ?? [];
        if (cellSubs.some((sv) => PROTECTED_SUBS.includes(sv) || ELEMENTAL_SUBS.includes(sv))) {
          ok = false;
          break;
        }
        cells.push([y, x]);
      }
      if (!ok) continue;
      const trial = cloneMap(map);
      const channel = cells.slice(0, channelLen);
      const [ey, ex] = cells[channelLen];
      for (const [y, x] of channel) {
        trial.tiles[y][x] = FLOOR;
        trial.subtypes[y][x] = [TileSubtype.LAVA];
      }
      trial.tiles[ey][ex] = FLOOR;
      trial.subtypes[ey][ex] = [TileSubtype.BOSS_ENTRANCE];
      const after = floodReachable(trial, hy, hx);
      // (a) every originally-reachable tile EXCEPT the ones we carved is still
      // reachable (so the spur never walls off a legitimate part of the room)...
      const carved = new Set(cells.map(([y, x]) => `${y},${x}`));
      let keptAll = true;
      for (const k of before) {
        if (carved.has(k)) continue;
        if (!after.has(k)) {
          keptAll = false;
          break;
        }
      }
      if (!keptAll) continue;
      // (b) ...and the entrance is reachable ONLY by crossing the lava.
      if (after.has(`${ey},${ex}`)) continue;
      // Dress the straight channel up into an irregular pool. Protect the hero's dry
      // approach (the tile he lines up on + the two behind it) so he can still cross.
      const keepDry = new Set<string>([
        `${ty},${tx}`,
        `${ty - dy},${tx - dx}`,
        `${ty - 2 * dy},${tx - 2 * dx}`,
      ]);
      growLavaPool(trial, channel, before, carved, keepDry, hy, hx);
      // The grown pool can still leave 1-2 tile-thick sides near the entrance — a
      // cheap shortcut past the intended 4-6 rock crossing. Guarantee a 3-4 tile
      // lava buffer on every accessible side, or reject this placement.
      const minBuffer = 3 + Math.floor(Math.random() * 2);
      if (!enforceLavaBuffer(trial, ey, ex, before, carved, keepDry, hy, hx, minBuffer)) {
        continue;
      }
      map.tiles = trial.tiles;
      map.subtypes = trial.subtypes;
      return true;
    }
  }
  return false;
}

/**
 * MOAT approach, shown inside a REAL Level-3 room. Generates an actual floor-3
 * layout (rooms, exit + key, rocks, pots, torches, faulty floors, hero spawned far
 * from the objectives) and adds the crossing:
 *  - LAVA: a straight, 1-wide dead-end spur (4-6 tiles) that ONLY gates the secret
 *    cave mouth. You cross it in a straight line — cool the tile ahead with a rock,
 *    step on, repeat — so you never have to turn (turning into lava = death), and it
 *    never walls off any legitimate part of the room.
 *  - WATER: a drowned far corner you wade (torch snuffs) or bridge with stepping
 *    stones; wading can't hard-block anything, so the corner flood is fine.
 */
export function buildMoatApproach(element: MoatElement): GameState {
  const channelLen = 4 + Math.floor(Math.random() * 3); // 4..6 -> 4-6 rocks to cross
  let map = generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, 3);
  if (element === "lava") {
    let placed = stampStraightLavaSpur(map, channelLen);
    // A suitable straight wall-run almost always exists; re-roll the room if not.
    for (let attempt = 0; attempt < 12 && !placed; attempt++) {
      map = generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, 3);
      placed = stampStraightLavaSpur(map, channelLen);
    }
    if (!placed) stampCornerMoat(map, "lava"); // extremely rare fallback
  } else {
    stampCornerMoat(map, "water");
  }
  const [hy, hx] = findPlayerPos(map);
  const ghosts = placeGhosts(map, GHOST_COUNT, hy, hx);
  return approachState(
    { tiles: map.tiles, subtypes: map.subtypes, environment: "cave" },
    {
      // Fog on (real L3 feel) so you explore into the crossing rather than seeing all.
      showFullMap: false,
      rockCount: 8, // enough to bridge a 4-6 tile lava channel with a little margin
      bossArenaSeed: element,
      enemies: ghosts,
    }
  );
}

/**
 * A few deep-water tiles in the corner farthest from the hero — a small pool of
 * flavor (and a secondary way to douse the torch). The GHOSTS are the primary way in
 * this level: they snuff the torch when adjacent, so the water stays minimal.
 */
function stampCornerWaterPatch(map: MapData, hy: number, hx: number): void {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const corners: Array<[number, number]> = [[1, 1], [1, W - 2], [H - 2, 1], [H - 2, W - 2]];
  const [cy, cx] = corners.reduce((best, c) =>
    Math.hypot(c[0] - hy, c[1] - hx) > Math.hypot(best[0] - hy, best[1] - hx) ? c : best
  );
  const bare = (y: number, x: number) =>
    y >= 1 &&
    x >= 1 &&
    y < H - 1 &&
    x < W - 1 &&
    map.tiles[y][x] === FLOOR &&
    (map.subtypes[y][x]?.length ?? 0) === 0;
  // Seed on the bare floor tile nearest the corner, then flood a small connected blob.
  let seed: [number, number] | null = null;
  for (let r = 0; r < Math.max(H, W) && !seed; r++) {
    for (let y = cy - r; y <= cy + r && !seed; y++)
      for (let x = cx - r; x <= cx + r && !seed; x++) if (bare(y, x)) seed = [y, x];
  }
  if (!seed) return;
  const target = 4 + Math.floor(Math.random() * 3); // a few: 4..6
  const blob: Array<[number, number]> = [];
  const seen = new Set<string>([`${seed[0]},${seed[1]}`]);
  const q: Array<[number, number]> = [seed];
  while (q.length && blob.length < target) {
    const [y, x] = q.shift()!;
    if (!bare(y, x)) continue;
    blob.push([y, x]);
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const k = `${y + dy},${x + dx}`;
      if (!seen.has(k)) {
        seen.add(k);
        q.push([y + dy, x + dx]);
      }
    }
  }
  for (const [y, x] of blob) map.subtypes[y][x] = [TileSubtype.DEEP_WATER];
}

/**
 * Would ending a move on (y,x) RELIGHT a doused torch? Mirrors the two relight rules in
 * movePlayer exactly: orthogonally adjacent to a WALL_TORCH, or anywhere inside a LAVA
 * tile's glow. Built on the same computeTorchGlow the relight check itself uses (the glow
 * octagon is symmetric, so "lava in the hero's glow" and "hero in a lava tile's glow" are
 * the same test), so the generator's idea of safe cannot drift from the engine's.
 */
function relightsTorchAt(map: MapData, y: number, x: number): boolean {
  for (const [dy, dx] of ORTHO) {
    if ((map.subtypes[y + dy]?.[x + dx] ?? []).includes(TileSubtype.WALL_TORCH)) return true;
  }
  for (const key of computeTorchGlow(y, x, map.tiles).keys()) {
    const [ly, lx] = key.split(",").map(Number);
    if ((map.subtypes[ly]?.[lx] ?? []).includes(TileSubtype.LAVA)) return true;
  }
  return false;
}

/**
 * Does a doused torch STAY out when the hero ends a move here? Deep water snuffs it and
 * overrides every relight source, so a water tile is dark whatever sits beside it.
 */
function staysDarkAt(map: MapData, y: number, x: number): boolean {
  if ((map.subtypes[y]?.[x] ?? []).includes(TileSubtype.DEEP_WATER)) return true;
  return !relightsTorchAt(map, y, x);
}

/** Tiles reachable from `seeds` WITHOUT ever ending a step somewhere that relights. */
function floodDark(map: MapData, seeds: Array<[number, number]>): Set<string> {
  const seen = new Set<string>();
  const q: Array<[number, number]> = [];
  for (const [y, x] of seeds) {
    const k = `${y},${x}`;
    if (seen.has(k) || !isWalkable(map, y, x, true) || !staysDarkAt(map, y, x)) continue;
    seen.add(k);
    q.push([y, x]);
  }
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of ORTHO) {
      const ny = y + dy;
      const nx = x + dx;
      const k = `${ny},${nx}`;
      if (seen.has(k)) continue;
      if (!isWalkable(map, ny, nx, true) || !staysDarkAt(map, ny, nx)) continue;
      seen.add(k);
      q.push([ny, nx]);
    }
  }
  return seen;
}

/** Every deep-water tile the hero can actually get to — the day's douse sources. */
function reachableWater(map: MapData, reachable: Set<string>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < map.tiles.length; y++) {
    for (let x = 0; x < map.tiles[y].length; x++) {
      if (!reachable.has(`${y},${x}`)) continue;
      if ((map.subtypes[y][x] ?? []).includes(TileSubtype.DEEP_WATER)) out.push([y, x]);
    }
  }
  return out;
}

/**
 * Run the pool toward the nearest tile that DOES stay dark, one tile at a time, and return
 * whether it got there.
 *
 * Only fires when every route out of the water passes a torch — i.e. when the day would
 * otherwise be the unwinnable one this whole dance exists to prevent. Deterministic
 * (breadth-first, no RNG) so it cannot disturb the daily stream's draw order, and it only
 * ever converts BARE floor, so the exit, key, chests, pots and the hero's own tile survive.
 */
function extendWaterToDark(map: MapData, water: Array<[number, number]>): boolean {
  const bare = (y: number, x: number) =>
    isWalkable(map, y, x, true) && (map.subtypes[y]?.[x]?.length ?? 0) === 0;

  // BFS out from the pool over bare floor, remembering each tile's parent so the winning
  // route can be walked back and flooded.
  const parent = new Map<string, string | null>();
  const q: Array<[number, number]> = [];
  for (const [y, x] of water) {
    parent.set(`${y},${x}`, null);
    q.push([y, x]);
  }
  let target: string | null = null;
  while (q.length && !target) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of ORTHO) {
      const ny = y + dy;
      const nx = x + dx;
      const k = `${ny},${nx}`;
      if (parent.has(k) || !bare(ny, nx)) continue;
      parent.set(k, `${y},${x}`);
      if (staysDarkAt(map, ny, nx)) {
        target = k;
        break;
      }
      q.push([ny, nx]);
    }
  }
  if (!target) return false;

  // DEEP water only, with no shallow rim like a generated pool has: shallow water and
  // stepping stones are "dry enough" and do NOT snuff the torch (see movePlayer), so an
  // edged pool would relight the hero mid-crossing and undo the whole point of this.
  //
  // Flood the route BUT NOT the target itself: the target already stays dark, and it is
  // where the portal is about to go.
  for (let step = parent.get(target); step; step = parent.get(step) ?? null) {
    const [sy, sx] = step.split(",").map(Number);
    if (!bare(sy, sx)) continue; // the pool tiles the walk ends on
    map.subtypes[sy][sx] = [TileSubtype.DEEP_WATER];
  }
  return true;
}

/**
 * Place the DARK_PORTAL on the farthest tile the hero can reach FROM THE WATER WITHOUT
 * RELIGHTING — so dousing in the pool and walking to the portal is actually possible.
 *
 * The old rule only checked the portal's own 3x3 for a relight source, which is not the
 * invariant the entrance needs: the whole ROUTE has to stay dark. On a real daily floor 3
 * (unlike the /test-boss-entrances harness, which used to build this room with zero wall
 * torches) a single torch beside the only corridor back relights the torch and makes the
 * portal inert — an unreachable secret on an otherwise normal day.
 *
 * The ghosts are not a substitute: an adjacent ghost snuffs the torch and VANISHES, so
 * they are three one-shot douses that a player can spend anywhere on the floor. Only the
 * pool is a repeatable source, so the pool is what the reachable-in-the-dark guarantee is
 * anchored to.
 */
function placeDarkPortal(map: MapData, hy: number, hx: number): void {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const reachable = floodReachable(map, hy, hx, { wadeable: true });
  const water = reachableWater(map, reachable);
  if (water.length === 0) return; // no douse source at all: nothing to anchor to

  let dark = floodDark(map, water);
  const candidates = () => {
    let best: [number, number] | null = null;
    let bestD = -1;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (map.tiles[y][x] !== FLOOR) continue;
        if ((map.subtypes[y][x]?.length ?? 0) !== 0) continue; // bare floor only
        if (!dark.has(`${y},${x}`)) continue;
        const d = Math.abs(y - hy) + Math.abs(x - hx);
        if (d > bestD) {
          bestD = d;
          best = [y, x];
        }
      }
    }
    return best;
  };

  let best = candidates();
  if (!best && extendWaterToDark(map, water)) {
    // The pool now runs to dry dark ground; re-seed from the water it grew into.
    dark = floodDark(map, reachableWater(map, floodReachable(map, hy, hx, { wadeable: true })));
    best = candidates();
  }
  if (best) map.subtypes[best[0]][best[1]] = [TileSubtype.DARK_PORTAL];
}

/**
 * DOUSE approach, in a REAL Level-3-sized room with the floor's REAL wall torches: wade
 * the deep-water pool to snuff your torch, and the DARK_PORTAL — invisible in the light —
 * lights up as a beacon across the dark and can be entered. Three ghosts prowl (and, being
 * torch-snuffers, may plunge you into the dark themselves).
 *
 * The torches are the point of the harness. This used to build the room with
 * `{ wallTorches: 0 }`, which made the room dark-by-construction and so made it the one
 * arrangement that CANNOT reproduce the failure that matters: a torch beside the only
 * corridor back, relighting the hero and leaving the portal inert. placeDarkPortal now
 * guarantees a route that stays dark, and this harness is where that gets played.
 */
export function buildDousePortalApproach(): GameState {
  const map = generateCompleteMapForFloor(
    { chests: 0, keys: 0, chestContents: [] },
    3
  );
  const [hy, hx] = findPlayerPos(map);
  stampCornerWaterPatch(map, hy, hx);
  placeDarkPortal(map, hy, hx);
  const ghosts = placeGhosts(map, GHOST_COUNT, hy, hx);

  return approachState(
    { tiles: map.tiles, subtypes: map.subtypes, environment: "cave" },
    {
      // Fog on (not full map) so the darkness reveal actually renders.
      showFullMap: false,
      heroTorchLit: true,
      bossArenaSeed: "water",
      enemies: ghosts,
    }
  );
}

/**
 * BOMB approach, in a REAL Level-3-sized room. Somewhere on the floor a walled-up
 * doorway waits: a cracked wall tile bracketed by two wall torches. Stand below it,
 * face up, throw a bomb — the seal blows open into a BOSS_ENTRANCE cave mouth. Two
 * lone cracked tiles elsewhere are decoys that open onto a reward pot instead, and the
 * hero carries exactly three bombs, so opening all three seals is the whole supply.
 */
export function buildBombSealApproach(): GameState {
  let map = generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, 3);
  let payloads = stampSealedDoorway(map);
  for (let attempt = 0; attempt < 12 && !payloads; attempt++) {
    map = generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, 3);
    payloads = stampSealedDoorway(map);
  }
  // The harness always shows the full picture: doorway plus the max decoys, so both
  // halves of the tell can be compared side by side.
  if (payloads) {
    payloads = {
      ...payloads,
      ...stampDecoySeals(map, MAX_DECOY_SEALS, sealCoords(payloads)),
    };
  }
  const [hy, hx] = findPlayerPos(map);
  const ghosts = placeGhosts(map, GHOST_COUNT, hy, hx);

  return approachState(
    { tiles: map.tiles, subtypes: map.subtypes, environment: "cave" },
    {
      // Fog on (real L3 feel) so you have to explore into the doorway to spot it.
      showFullMap: false,
      bombCount: 3,
      rockCount: 0,
      sealPayloads: payloads ?? undefined,
      bossArenaSeed: "lava",
      playerDirection: Direction.UP,
      enemies: ghosts,
    }
  );
}

// --- Sealed doorway (the BOMB entrance) --------------------------------------

/** Hard ceiling on decoy seals per floor. */
export const MAX_DECOY_SEALS = 5;
/** Chebyshev spacing between seals, so two of them never read as one motif. */
const SEAL_SPACING = 4;
/** How far from any wall torch a decoy must sit, so a torch PAIR stays the only tell. */
const DECOY_TORCH_CLEARANCE = 2;

/**
 * How many decoy cracks this floor gets: 3, 4, or 5, rolled per floor on EVERY daily
 * floor — not just floor 3, and not just bomb days. A floor always carries at least 3
 * cracks so the motif reads as normal dungeon wear: spotting one is never by itself a
 * giveaway that something is hidden — the torch PAIR around the real doorway is the tell.
 * Must be called inside the daily seeded RNG block.
 */
export function rollDecoySealCount(): number {
  const r = Math.random();
  if (r < 0.5) return 3;
  if (r < 0.8) return 4;
  return MAX_DECOY_SEALS;
}

/** Terrain that would stop the hero standing below a seal to throw at it. */
const UNSTANDABLE_SUBS = [
  TileSubtype.LAVA,
  TileSubtype.DEEP_WATER,
  TileSubtype.OPEN_ABYSS,
  TileSubtype.FAULTY_FLOOR,
];

/**
 * Wall tiles the renderer gives a camera-facing face to: a WALL with FLOOR directly
 * below it (Tile.tsx's isFloorBelow adds the forced-perspective front face there).
 * Side and bottom walls are drawn as caps seen from above, so a crack decal on one
 * would be unreadable — those can never hold a seal. Same predicate
 * addWallTorchesToMap uses, which is why a torch and a seal always agree on which
 * walls can carry art.
 */
function isFacedWall(map: MapData, y: number, x: number): boolean {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  if (y < 0 || x < 0 || y >= H - 1 || x >= W) return false;
  if (map.tiles[y][x] !== WALL) return false;
  return map.tiles[y + 1][x] === FLOOR;
}

/** A faced wall with nothing already on it (no torch, no other overlay). */
function isBareFacedWall(map: MapData, y: number, x: number): boolean {
  return isFacedWall(map, y, x) && (map.subtypes[y]?.[x]?.length ?? 0) === 0;
}

/** Can the hero stand on the tile below (y,x) and throw upward at it? */
function approachIsStandable(map: MapData, y: number, x: number, reachable: Set<string>): boolean {
  const ay = y + 1;
  if (!reachable.has(`${ay},${x}`)) return false;
  const subs = map.subtypes[ay]?.[x] ?? [];
  return !subs.some((s) => UNSTANDABLE_SUBS.includes(s));
}

function isNearTorch(map: MapData, y: number, x: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const subs = map.subtypes[y + dy]?.[x + dx] ?? [];
      if (subs.includes(TileSubtype.WALL_TORCH)) return true;
    }
  return false;
}

function farEnough(taken: Array<[number, number]>, y: number, x: number): boolean {
  return taken.every(
    ([ty, tx]) => Math.max(Math.abs(ty - y), Math.abs(tx - x)) >= SEAL_SPACING
  );
}

/**
 * Stamp up to `count` decoy cracks — lone WALL_SEAL tiles with no wall torch within
 * DECOY_TORCH_CLEARANCE, so a bracketing torch PAIR stays the only tell for the real
 * doorway. Each opens onto a pot: the first holds pink-realm fruit, any further one flips
 * a coin between fruit and ordinary food, so a decoy is never a wasted bomb.
 *
 * Runs on EVERY daily floor with a minimum of 3, so cracks show up on floors 1 and 2
 * where the hero has no bombs yet and the motif never reads as a one-off marker.
 * Spaced ≥SEAL_SPACING from `avoid` (the real doorway, when there is one) and from
 * each other.
 *
 * Must be called inside the daily seeded RNG block.
 */
export function stampDecoySeals(
  map: MapData,
  count: number,
  avoid: Array<[number, number]> = []
): SealPayloads {
  const payloads: SealPayloads = {};
  if (count <= 0) return payloads;
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const [hy, hx] = findPlayerPos(map);
  const reachable = floodReachable(map, hy, hx, { wadeable: true });

  const cands: Array<[number, number]> = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      if (!isBareFacedWall(map, y, x)) continue;
      if (isNearTorch(map, y, x, DECOY_TORCH_CLEARANCE)) continue;
      if (!approachIsStandable(map, y, x, reachable)) continue;
      cands.push([y, x]);
    }
  }
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }

  const taken = avoid.slice();
  let placed = 0;
  for (const [y, x] of cands) {
    if (placed >= count) break;
    if (!farEnough(taken, y, x)) continue;
    map.subtypes[y][x] = [TileSubtype.WALL_SEAL];
    const payload: SealPayload =
      placed === 0 ? "berry" : Math.random() < 0.5 ? "berry" : "food";
    payloads[`${y},${x}`] = payload;
    taken.push([y, x]);
    placed++;
  }
  return payloads;
}

/**
 * Stamp the day's real sealed doorway and return what it hides (always exactly one
 * "boss" entry). Decoys are NOT placed here — they are an independent per-floor roll
 * (see stampDecoySeals / rollDecoySealCount), so a floor can carry cracks with no
 * doorway at all, and a bomb day can roll zero decoys.
 *
 * The doorway is three consecutive faced wall tiles — torch, cracked seal, torch — so it
 * reads as a walled-up entrance someone once honored. Interior wall runs are strongly
 * preferred over the map's top boundary: a 3-wide motif fits an interior run in ~92% of
 * generated floor 3s, which is the whole reason the motif is 3 wide and not 5 (a 5-wide
 * one only ever fits the top boundary row, making it findable by rote).
 *
 * Returns null (and leaves the map untouched) when the floor has no site at all —
 * the caller then treats the day as bossless rather than shipping a broken floor.
 * Must be called inside the daily seeded RNG block.
 */
export function stampSealedDoorway(map: MapData): SealPayloads | null {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const [hy, hx] = findPlayerPos(map);
  const reachable = floodReachable(map, hy, hx, { wadeable: true });

  // Every 3-wide window of bare faced wall whose middle tile the hero can reach.
  const sites: Array<{ y: number; x: number; interior: boolean; dist: number }> = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x + 2 < W; x++) {
      if (!isBareFacedWall(map, y, x)) continue;
      if (!isBareFacedWall(map, y, x + 1)) continue;
      if (!isBareFacedWall(map, y, x + 2)) continue;
      if (!approachIsStandable(map, y, x + 1, reachable)) continue;
      sites.push({
        y,
        x,
        interior: y > 0,
        dist: Math.abs(y - hy) + Math.abs(x + 1 - hx),
      });
    }
  }
  if (sites.length === 0) return null;

  // Interior walls first (a seal on the top boundary is the predictable fallback), then
  // farthest from the hero so the doorway is something you travel to, not spawn beside.
  sites.sort((a, b) => {
    if (a.interior !== b.interior) return a.interior ? -1 : 1;
    return b.dist - a.dist;
  });
  // Break ties randomly among the best few so the same layout doesn't always pick the
  // same wall (seeded, so still identical for every player on a given day).
  const interiorSites = sites.filter((s) => s.interior);
  const pool = (interiorSites.length > 0 ? interiorSites : sites).slice(0, 5);
  const site = pool[Math.floor(Math.random() * pool.length)];

  map.subtypes[site.y][site.x] = [TileSubtype.WALL_TORCH];
  map.subtypes[site.y][site.x + 1] = [TileSubtype.WALL_SEAL];
  map.subtypes[site.y][site.x + 2] = [TileSubtype.WALL_TORCH];
  return { [`${site.y},${site.x + 1}`]: "boss" };
}

/** The coordinates of every WALL_SEAL recorded in a payload map. */
export function sealCoords(payloads: SealPayloads): Array<[number, number]> {
  return Object.keys(payloads).map(
    (k) => k.split(",").map(Number) as [number, number]
  );
}

// --- Daily-mode rotation -----------------------------------------------------
//
// One entrance per boss day. The BOMB entrance is the common case (~half of days)
// and is self-gating: it only pays off if that run actually finds a bomb. The three
// non-bomb kinds split the rest, and they're the ones that make a boss reachable on
// a bombless day. Rolled inside the daily's seeded RNG block so every player gets
// the same day.

export type BossEntranceKind = "bomb" | "douse" | "moat-lava" | "moat-water";

/** Chance a given daily floor 3 carries a boss entrance at all. 1 = every day. */
export const BOSS_DAY_CHANCE = 1;
/** Share of boss days that use the bombable-wall entrance. */
export const BOMB_ENTRANCE_SHARE = 0.5;

/**
 * Pick the day's entrance. MUST be called inside the daily seeded RNG block
 * (withPatchedMathRandom) so the choice is identical for every player that day.
 *
 * `bombAvailable` is the load-bearing part: the bomb entrance needs a bomb, and bombs
 * only come from the Level 2 optional-chest pool (2 of 3 items drawn per run), so ~1 day
 * in 3 has none. On those days the bomb slice is reassigned to the other three kinds —
 * otherwise a bombless day would roll "bomb" and end up with NO reachable boss at all.
 * Always consumes exactly two draws, whichever branch it takes.
 */
export function rollBossEntranceKind(opts?: {
  bombAvailable?: boolean;
}): BossEntranceKind | null {
  if (Math.random() >= BOSS_DAY_CHANCE) return null; // not a boss day
  const r = Math.random();
  const bombOk = opts?.bombAvailable !== false;
  if (bombOk && r < BOMB_ENTRANCE_SHARE) return "bomb";
  // Position within the non-bomb portion: rescaled when bomb was eligible, or the
  // whole roll when it wasn't (so the three split a bombless day evenly).
  const t = bombOk ? (r - BOMB_ENTRANCE_SHARE) / (1 - BOMB_ENTRANCE_SHARE) : r;
  if (t < 1 / 3) return "douse";
  if (t < 2 / 3) return "moat-lava";
  return "moat-water";
}

/** Which elemental Shaper arena an entrance leads into (the way in sets the mood). */
export function arenaSeedForEntrance(kind: BossEntranceKind): MoatElement {
  return kind === "moat-water" || kind === "douse" ? "water" : "lava";
}

/**
 * Stamp the day's entrance into an already-generated daily floor. `placed` is false if
 * the floor had no safe spot for it (caller just leaves that day bossless rather than
 * risking a broken floor). "bomb" returns the seal payload map, which the caller must
 * carry onto the GameState — without it the sealed doorway opens onto nothing.
 */
export function stampBossEntranceOnFloor(
  map: MapData,
  kind: BossEntranceKind,
  opts?: { varyMoat?: boolean }
): { placed: boolean; sealPayloads?: SealPayloads } {
  const [hy, hx] = findPlayerPos(map);
  if (kind === "bomb") {
    const sealPayloads = stampSealedDoorway(map);
    return sealPayloads ? { placed: true, sealPayloads } : { placed: false };
  }
  if (kind === "moat-lava") {
    // 4-6 rocks to cross, straight-line only, and only ever gates the secret.
    return { placed: stampStraightLavaSpur(map, 4 + Math.floor(Math.random() * 3)) };
  }
  if (kind === "moat-water") {
    const before = countSubtype(map, TileSubtype.BOSS_ENTRANCE);
    stampCornerMoat(map, "water", { vary: opts?.varyMoat });
    return { placed: countSubtype(map, TileSubtype.BOSS_ENTRANCE) > before };
  }
  // douse: a few deep-water tiles to snuff the torch, plus the dark portal itself.
  stampCornerWaterPatch(map, hy, hx);
  const before = countSubtype(map, TileSubtype.DARK_PORTAL);
  placeDarkPortal(map, hy, hx);
  return { placed: countSubtype(map, TileSubtype.DARK_PORTAL) > before };
}

/**
 * Stamp the day's boss entrance, and if the rolled `kind` has no legal spot on THIS
 * particular floor 3, place a different (reachable, non-bomb) kind instead — so a boss day
 * never silently loses its door. The bug this closes: a rolled kind whose placement failed
 * left `stampBossEntranceOnFloor` returning `{ placed: false }` with no fallback, so ~1.7%
 * of days ended up with no boss entrance at all.
 *
 * Stream discipline — load-bearing for /stats, which replays this generator to answer
 * "what did that date roll" (lib/stats/boss_day.ts re-runs advanceToNextFloor):
 *   - The PRIMARY attempt (the rolled kind) runs under the AMBIENT Math.random (the daily
 *     floor stream) on a COPY of the map, committed only if it places. So a day whose
 *     rolled kind succeeds draws exactly what it always did and ends with the exact same
 *     tiles — byte-identical to before this fallback existed — and a failed primary leaves
 *     NO half-flooded terrain behind on the real map.
 *   - The FALLBACK attempts draw from a SEPARATE salted stream (`fallbackRng`, the same
 *     discipline as dailyBossKind), each on its own COPY, so they consume NOTHING from the
 *     floor's own sequence. Decoy-seal and enemy/snake placement downstream — and the
 *     historical replay of every successfully-placed day — are left completely undisturbed.
 *
 * Never falls back to "bomb": that door needs a bomb the run may not carry, and an
 * unreachable bomb door on a bombless day is the exact failure this guards against. The
 * corner water moat leads the order because it draws no randomness and all but always finds
 * a wadeable landing; douse and the lava spur sit behind it purely for completeness.
 *
 * Returns the kind that actually placed (which may differ from `kind`) and its seal
 * payloads, or null if not even a fallback found a spot (astronomically rare). Must be
 * called inside the daily seeded RNG block.
 */
export function stampBossEntranceWithFallback(
  map: MapData,
  kind: BossEntranceKind,
  fallbackRng: Rng,
  opts?: { varyMoat?: boolean }
): { kind: BossEntranceKind; sealPayloads?: SealPayloads } | null {
  // Primary: ambient (daily) stream, on a copy, committed only on success — so this path is
  // byte-identical to the old inline stamp when the rolled kind places, and leaves the real
  // map untouched when it does not.
  const primary = cloneMap(map);
  const stampedPrimary = stampBossEntranceOnFloor(primary, kind, opts);
  if (stampedPrimary.placed) {
    map.tiles = primary.tiles;
    map.subtypes = primary.subtypes;
    return { kind, sealPayloads: stampedPrimary.sealPayloads };
  }
  // Fallback: a reachable non-bomb kind, drawn from the salted stream so the daily sequence
  // never shifts. moat-water first (near-certain to place; under varyMoat it draws its
  // corner/size/shape rolls from this salted stream, which is exactly where they belong).
  const FALLBACK_ORDER: BossEntranceKind[] = ["moat-water", "douse", "moat-lava"];
  for (const alt of FALLBACK_ORDER) {
    if (alt === kind) continue;
    const trial = cloneMap(map);
    const stamped = withPatchedMathRandom(fallbackRng, () =>
      stampBossEntranceOnFloor(trial, alt, opts)
    );
    if (stamped.placed) {
      map.tiles = trial.tiles;
      map.subtypes = trial.subtypes;
      return { kind: alt, sealPayloads: stamped.sealPayloads };
    }
  }
  return null;
}

function countSubtype(map: MapData, sub: number): number {
  let n = 0;
  for (const row of map.subtypes) for (const cell of row) if (cell.includes(sub)) n++;
  return n;
}
