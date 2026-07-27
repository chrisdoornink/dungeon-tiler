// The Shaper: a terrain-reshaping pursuit boss. It sits in the center chamber
// and reshapes the ground toward you. Attacks land with a screen shake and a
// fast outward tile-by-tile reveal. Once alerted it runs a clear strategy
// (WATER to slow you, telegraphed FIRE to kill you, and WALLS to fence you in).
//
// WALLS MATTER (attacks respect and interact with them):
//   - a lava stream MELTS the first wall it reaches into charred floor (SINGED)
//     and STOPS — one layer only, never passing through.
//   - a water stream STOPS at a wall (doing nothing to it) and pools to the
//     left and right of the point of impact (if within range).
//   - neither attack ever reshapes tiles on the far side of a wall.
//   - the wall strategy BUILDS walls but can never seal you out: tryBuildWall
//     only commits a wall that keeps a standable boss-neighbor reachable
//     (heroCanReachBoss), so a melee tile always survives.
//
// ELEMENTS FIGHT EACH OTHER (the weapon): lava onto ANY water -> SINGED safe
// ground; water onto lava -> SINGED; SINGED is neutral floor either element can
// reclaim. Otherwise lava ignites bare ground (instant death; cool with a rock
// -> obsidian), water floods bare -> shallow and DEEPENS shallow -> deep.
//
// FAIRNESS: the untelegraphed water/idle spew (planShaperAttack) NEVER reshapes
// the tile you're on or the tile you're stepping into (its `spared` set), so it
// can't kill you outright. FIRE is different: it is TELEGRAPHED one turn ahead
// (mem.pendingFire, a warm glow) and CAN turn your tile to lethal lava when it
// lands — but fireTargets always leaves at least one walkable escape neighbor,
// so stepping off the telegraph is always survivable. Reaching the boss IS the
// fight; once adjacent it takes normal melee (low HP).
//
// Pure/testable: imports the BehaviorContext type (erased) + TileSubtype + the
// leaf line-of-sight helper (no cycle: line_of_sight imports nothing of ours).
import { TileSubtype } from "../map/constants";
import { canSee } from "../line_of_sight";
import type { BehaviorContext } from "../enemies/registry";

export const SHAPER_HP = 5;
export const SHAPER_MAX_RANGE = 8;
export const SHAPER_MIN_TILES = 5;
export const SHAPER_MAX_TILES = 8;
// Pacing. Unalerted: it hasn't spotted you — spew only every 5-6 turns (random),
// otherwise pace or hold. Alerted (it has line-of-sight within VISION): attack
// EVERY turn, alternating lava/water, and sometimes back away.
export const SHAPER_VISION = 8; // Manhattan, matches the engine's enemy vision
const SHAPER_HOME_RANGE = 5; // how far it roams from its start (stays in its chamber)
const SHAPER_IDLE_SPEW_MIN = 5; // unalerted spew cadence: 5 or 6 turns
const SHAPER_IDLE_PACE_CHANCE = 0.5;
// Unalerted spews are small, local pokes around itself (it hasn't seen you yet).
const SHAPER_IDLE_MIN_TILES = 2;
const SHAPER_IDLE_MAX_TILES = 3;
// Alerted strategy is a fixed cycle: squirt WATER at you twice (flood -> deepen
// into torch-snuffing DEEP water that slows your approach), then LAUNCH FIRE
// (telegraphed — it rockets up, glowing target tiles appear), then next turn the
// FIRE RAINS DOWN as lethal lava on those tiles. Fire actively avoids water.
const SHAPER_FIRE_MIN_TILES = 4;
const SHAPER_FIRE_MAX_TILES = 6;
const SHAPER_FIRE_WATER_HIT_CHANCE = 0.15; // fire mostly avoids water tiles

// Per-encounter STRATEGY, rolled once when it first spots you (a tendency, not a
// rigid rule — each carries the other's flavour):
//   - DROWNING: the water-water-fire cycle; occasionally throws a lone pillar.
//   - WALL: builds walls to fence you off (never sealing you out); when it can't
//     extend a wall, it hurls a lava splatter instead.
export type ShaperStrategy = "drowning" | "wall";
const SHAPER_WALL_STRATEGY_CHANCE = 0.45; // else drowning
const SHAPER_WALL_LAVA_MIX = 0.3; // wall strategy: chance to lob fire instead of a wall
const SHAPER_DROWNING_PILLAR_CHANCE = 0.15; // drowning strategy: chance of a lone pillar

export type ShaperElement = "lava" | "water";
export type ShaperShape = "path" | "splatter";

// A single tile change: set base FLOOR (opens a melted wall) + a single subtype.
export interface ShaperMutation {
  y: number;
  x: number;
  sub: number; // LAVA | SHALLOW_WATER | DEEP_WATER | SINGED
}

interface ShaperMemory {
  turn?: number;
  attacks?: number;
  alerted?: boolean;
  spewCountdown?: number; // turns until the next unalerted spew
  homeY?: number; // where it started — it roams around here, doesn't leave the chamber
  homeX?: number;
  // Optional hard roam box (set by the arena to the chamber interior). When
  // present it overrides the home-range roam, so an off-center boss still can't
  // wander out through an entrance.
  roamMinY?: number;
  roamMaxY?: number;
  roamMinX?: number;
  roamMaxX?: number;
  // Per-encounter strategy (rolled on the first alert).
  strategy?: ShaperStrategy;
  // Drowning strategy cycle: 0/1 = water squirts, 2 = fire launch.
  strat?: number;
  lastWaterTiles?: Array<[number, number]>; // so the 2nd squirt deepens the 1st
  // Fire launched last turn; it rains down THIS turn. Rendered as a subtle warm
  // glow while pending so the player knows which tiles to avoid.
  pendingFire?: { tiles: Array<[number, number]> } | null;
  fireLaunchNonce?: number; // fires the launch shake + upward-lava animation once
  // A wall it raised this turn (for the stone-rise flash + shake).
  lastWall?: { nonce: number; tiles: Array<[number, number]> } | null;
  lastAttack?: { nonce: number; element: ShaperElement; tiles: Array<[number, number]> } | null;
}

const FLOOR = 0;
const WALL = 1;
const FLOWERS = 5;

const TERRAIN_SUBS = new Set<number>([
  TileSubtype.SHALLOW_WATER,
  TileSubtype.DEEP_WATER,
  TileSubtype.LAVA,
  TileSubtype.SINGED,
]);

type TerrainState =
  | "bare"
  | "shallow"
  | "deep"
  | "lava"
  | "singed"
  | "object" // floor carrying a non-terrain overlay (rock/pot/chest/...) — flow past, don't touch
  | "wall"
  | "oob";

function inBounds(grid: number[][], y: number, x: number): boolean {
  return y >= 0 && x >= 0 && y < grid.length && x < (grid[0]?.length ?? 0);
}
function cheb(ay: number, ax: number, by: number, bx: number): number {
  return Math.max(Math.abs(ay - by), Math.abs(ax - bx));
}
function isBorder(grid: number[][], y: number, x: number): boolean {
  return y === 0 || x === 0 || y === grid.length - 1 || x === (grid[0]?.length ?? 0) - 1;
}

function terrainStateAt(grid: number[][], subs: number[][][], y: number, x: number): TerrainState {
  if (!inBounds(grid, y, x)) return "oob";
  const t = grid[y][x];
  if (t === WALL) return "wall";
  if (t !== FLOOR && t !== FLOWERS) return "object"; // trees/roofs etc. — never reshape
  // The PLAYER marker is not furniture — fire must be able to rain onto the tile
  // the hero is standing on. Classify by the terrain under the marker.
  const s = (subs[y]?.[x] ?? []).filter((v) => v !== TileSubtype.PLAYER);
  if (s.length === 0) return "bare";
  if (s.some((v) => !TERRAIN_SUBS.has(v))) return "object";
  if (s.includes(TileSubtype.LAVA)) return "lava";
  if (s.includes(TileSubtype.DEEP_WATER)) return "deep";
  if (s.includes(TileSubtype.SHALLOW_WATER)) return "shallow";
  if (s.includes(TileSubtype.SINGED)) return "singed";
  return "bare";
}

// The subtype a FLOOR tile in `state` becomes when hit by `element`, or null for
// a no-op (lava on lava, water on deep).
function resultSubForFloor(element: ShaperElement, state: TerrainState): number | null {
  if (element === "lava") {
    if (state === "shallow" || state === "deep") return TileSubtype.SINGED; // quench
    if (state === "lava") return null;
    return TileSubtype.LAVA; // bare / singed
  }
  if (state === "lava") return TileSubtype.SINGED; // douse
  if (state === "deep") return null;
  if (state === "shallow") return TileSubtype.DEEP_WATER; // deepen
  return TileSubtype.SHALLOW_WATER; // bare / singed
}

function bresenham(y0: number, x0: number, y1: number, x1: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (let i = 0; i < 80; i++) {
    pts.push([y, x]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

const NEIGHBORS8: Array<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

export function planShaperAttack(
  shape: ShaperShape,
  element: ShaperElement,
  boss: { y: number; x: number },
  hero: { y: number; x: number },
  heroNext: { y: number; x: number },
  grid: number[][],
  subs: number[][][],
  rng: () => number,
  opts?: { minTiles?: number; maxTiles?: number }
): ShaperMutation[] {
  const minTiles = opts?.minTiles ?? SHAPER_MIN_TILES;
  const maxTiles = opts?.maxTiles ?? SHAPER_MAX_TILES;
  const spared = new Set<string>([
    `${hero.y},${hero.x}`,
    `${heroNext.y},${heroNext.x}`,
    `${boss.y},${boss.x}`,
  ]);
  const claimed = new Set<string>();
  const muts: ShaperMutation[] = [];
  const state = (y: number, x: number) => terrainStateAt(grid, subs, y, x);

  const addFloor = (y: number, x: number): boolean => {
    const key = `${y},${x}`;
    if (spared.has(key) || claimed.has(key)) return false;
    if (cheb(y, x, boss.y, boss.x) > SHAPER_MAX_RANGE + 1) return false;
    const st = state(y, x);
    if (st === "wall" || st === "oob" || st === "object") return false;
    const sub = resultSubForFloor(element, st);
    if (sub === null) return false;
    claimed.add(key);
    muts.push({ y, x, sub });
    return true;
  };
  // Lava melts a wall into charred floor (unless it's the map border).
  const meltWall = (y: number, x: number): boolean => {
    const key = `${y},${x}`;
    if (spared.has(key) || claimed.has(key)) return false;
    if (cheb(y, x, boss.y, boss.x) > SHAPER_MAX_RANGE + 1) return false;
    if (isBorder(grid, y, x)) return false;
    claimed.add(key);
    muts.push({ y, x, sub: TileSubtype.SINGED });
    return true;
  };

  const ray = bresenham(boss.y, boss.x, hero.y, hero.x);
  const vertical = Math.abs(hero.y - boss.y) >= Math.abs(hero.x - boss.x);

  if (shape === "path") {
    let prev: [number, number] = [boss.y, boss.x];
    for (let i = 1; i < ray.length; i++) {
      const [ty, tx] = ray[i];
      if (cheb(ty, tx, boss.y, boss.x) > SHAPER_MAX_RANGE) break;
      if (spared.has(`${ty},${tx}`)) break; // reached the hero — stop before them
      const st = state(ty, tx);
      if (st === "oob") break;
      if (st === "wall") {
        if (element === "lava") {
          meltWall(ty, tx); // char one layer...
        } else {
          // water: pool left/right of the last floor tile before the wall
          const [py, px] = prev;
          const flanks: Array<[number, number]> = vertical
            ? [[py, px - 1], [py, px + 1]]
            : [[py - 1, px], [py + 1, px]];
          for (const [fy, fx] of flanks) addFloor(fy, fx);
        }
        break; // ...and NEVER pass through
      }
      if (st === "object") {
        prev = [ty, tx];
        continue; // flow past a rock/pot without touching it
      }
      addFloor(ty, tx);
      prev = [ty, tx];
    }
    // a little splatter off the far (hero-side) end
    let tries = 0;
    while (muts.length < minTiles && tries < 16) {
      const [oy, ox] = NEIGHBORS8[Math.floor(rng() * NEIGHBORS8.length)] ?? [0, 1];
      addFloor(prev[0] + oy, prev[1] + ox);
      tries++;
    }
    return orderFrom(boss.y, boss.x, muts, maxTiles);
  }

  // SPLATTER: trace the ray to the impact (stopping at the first wall/range), then
  // scatter a blob there. Lava chars any walls it splatters onto; water skips them.
  let impact: [number, number] = [boss.y, boss.x];
  for (let i = 1; i < ray.length; i++) {
    const [ty, tx] = ray[i];
    if (cheb(ty, tx, boss.y, boss.x) > SHAPER_MAX_RANGE) break;
    if (spared.has(`${ty},${tx}`)) break;
    const st = state(ty, tx);
    if (st === "wall" || st === "oob") break;
    if (st === "object") {
      impact = [ty, tx];
      continue;
    }
    impact = [ty, tx];
  }
  addFloor(impact[0], impact[1]);
  const target = minTiles + Math.floor(rng() * (maxTiles - minTiles + 1));
  let tries = 0;
  while (muts.length < target && tries < 40) {
    const oy = Math.floor(rng() * 5) - 2;
    const ox = Math.floor(rng() * 5) - 2;
    const qy = impact[0] + oy;
    const qx = impact[1] + ox;
    const st = state(qy, qx);
    if (st === "wall") {
      if (element === "lava") meltWall(qy, qx); // lava splatter chars walls
    } else {
      addFloor(qy, qx);
    }
    tries++;
  }
  return orderFrom(impact[0], impact[1], muts, maxTiles);
}

function orderFrom(oy: number, ox: number, muts: ShaperMutation[], maxTiles: number): ShaperMutation[] {
  return [...muts].sort((a, b) => cheb(a.y, a.x, oy, ox) - cheb(b.y, b.x, oy, ox)).slice(0, maxTiles);
}

// Apply mutations to the live map: open a melted wall to floor, set the subtype.
export function executeShaperAttack(
  muts: ShaperMutation[],
  grid: number[][],
  subs: number[][][]
): void {
  for (const { y, x, sub } of muts) {
    if (!inBounds(grid, y, x)) continue;
    grid[y][x] = FLOOR; // no-op for floor tiles; opens a lava-melted wall
    // Preserve the hero marker if fire/water reshapes the tile they're on, so
    // the engine can still locate (and, on lava, kill) them.
    const hadPlayer = (subs[y][x] ?? []).includes(TileSubtype.PLAYER);
    subs[y][x] = hadPlayer ? [sub, TileSubtype.PLAYER] : [sub];
  }
}

// Reshape a specific list of tiles with one element (used by the water second
// squirt to deepen, and by the fire rain-down to ignite). Skips walls/objects.
function floodTiles(
  element: ShaperElement,
  tiles: Array<[number, number]>,
  grid: number[][],
  subs: number[][][]
): ShaperMutation[] {
  const muts: ShaperMutation[] = [];
  for (const [y, x] of tiles) {
    const st = terrainStateAt(grid, subs, y, x);
    if (st === "wall" || st === "oob" || st === "object") continue;
    const sub = resultSubForFloor(element, st);
    if (sub !== null) muts.push({ y, x, sub });
  }
  return muts;
}

// Fire target tiles: a blob raining down around `aim`, actively AVOIDING water
// (a lava-on-water hit just makes safe ground, so it's a wasted kill). Includes
// the aim tile itself — the telegraph is the fair warning to step off. Never the
// boss's own tile. Ordered outward for the reveal sweep.
export function fireTargets(
  boss: { y: number; x: number },
  aim: { y: number; x: number },
  grid: number[][],
  subs: number[][][],
  rng: () => number
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seen = new Set<string>([`${boss.y},${boss.x}`]);
  const consider = (y: number, x: number) => {
    const key = `${y},${x}`;
    if (seen.has(key)) return;
    if (cheb(y, x, boss.y, boss.x) > SHAPER_MAX_RANGE) return;
    const st = terrainStateAt(grid, subs, y, x);
    if (st === "wall" || st === "oob" || st === "object") return;
    if ((st === "shallow" || st === "deep") && rng() > SHAPER_FIRE_WATER_HIT_CHANCE) return;
    seen.add(key);
    out.push([y, x]);
  };
  consider(aim.y, aim.x);
  const target = SHAPER_FIRE_MIN_TILES + Math.floor(rng() * (SHAPER_FIRE_MAX_TILES - SHAPER_FIRE_MIN_TILES + 1));
  let tries = 0;
  while (out.length < target && tries < 50) {
    consider(aim.y + Math.floor(rng() * 5) - 2, aim.x + Math.floor(rng() * 5) - 2);
    tries++;
  }
  // Fairness guard: the telegraph must always leave a way out. If every
  // walkable, non-lava orthogonal neighbor of the aim tile is targeted (as can
  // happen in a 1-wide corridor), the fire would rain down with no survivable
  // step -> an unavoidable death. Spare one such neighbor so a hero on the aim
  // tile can always dodge off the telegraph.
  const isEscape = (y: number, x: number): boolean => {
    const st = terrainStateAt(grid, subs, y, x);
    if (st === "wall" || st === "oob" || st === "object") return false;
    const s = subs[y]?.[x] ?? [];
    if (s.includes(TileSubtype.LAVA) && !s.includes(TileSubtype.OBSIDIAN)) return false;
    return true;
  };
  const escapeNeighbors = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>)
    .map(([dy, dx]) => [aim.y + dy, aim.x + dx] as [number, number])
    .filter(([y, x]) => isEscape(y, x));
  const targeted = new Set(out.map(([y, x]) => `${y},${x}`));
  const hasEscape = escapeNeighbors.some(([y, x]) => !targeted.has(`${y},${x}`));
  if (!hasEscape && escapeNeighbors.length > 0) {
    const [sy, sx] = escapeNeighbors[0];
    const idx = out.findIndex(([y, x]) => y === sy && x === sx);
    if (idx >= 0) out.splice(idx, 1);
  }
  return out.sort((a, b) => cheb(a[0], a[1], aim.y, aim.x) - cheb(b[0], b[1], aim.y, aim.x));
}

// --- Wall strategy: build walls, but NEVER seal the hero out ---

// Can the hero physically get to a tile from which they could strike the boss?
// Treats WALL, LAVA and OPEN_ABYSS as blockers; water/singed/objects are
// crossable (the hero wades/smashes). `blockTile` (a candidate new wall) is
// treated as blocked. Success = the hero can STAND ON a tile orthogonally
// adjacent to the boss — i.e. an attack tile that is itself passable. A walled
// (or lava/abyss) boss-neighbor is NOT a valid attack tile; if the boss's every
// neighbor is unstandable it is sealed in and this returns false, which is
// exactly what stops tryBuildWall from placing the entombing wall.
function heroCanReachBoss(
  grid: number[][],
  subs: number[][][],
  hero: { y: number; x: number },
  boss: { y: number; x: number },
  blockTile?: [number, number]
): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const passable = (y: number, x: number): boolean => {
    if (y < 0 || x < 0 || y >= rows || x >= cols) return false;
    if (blockTile && y === blockTile[0] && x === blockTile[1]) return false;
    if (grid[y][x] !== FLOOR && grid[y][x] !== FLOWERS) return false;
    const s = subs[y]?.[x] ?? [];
    if (s.includes(TileSubtype.LAVA) && !s.includes(TileSubtype.OBSIDIAN)) return false;
    if (s.includes(TileSubtype.OPEN_ABYSS)) return false;
    return true;
  };
  // Goals are the boss's orthogonal neighbors the hero could actually stand on.
  const goals = new Set<string>();
  for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
    const gy = boss.y + dy;
    const gx = boss.x + dx;
    if (passable(gy, gx)) goals.add(`${gy},${gx}`);
  }
  if (goals.size === 0) return false; // boss sealed in: no standable attack tile
  // BFS from the hero's tile (start passability not required — they're there);
  // success only when we actually reach (stand on) a standable attack tile.
  if (goals.has(`${hero.y},${hero.x}`)) return true;
  const seen = new Set<string>([`${hero.y},${hero.x}`]);
  const q: Array<[number, number]> = [[hero.y, hero.x]];
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const ny = y + dy;
      const nx = x + dx;
      const k = `${ny},${nx}`;
      if (seen.has(k)) continue;
      if (!passable(ny, nx)) continue; // must be standable to step onto
      if (goals.has(k)) return true; // reached a standable attack tile
      seen.add(k);
      q.push([ny, nx]);
    }
  }
  return false;
}

// Ordered wall candidates: tiles on the boss's perimeter toward the hero (block
// the approach), then its other sides (extend a partial ring), then one tile
// further out toward the hero.
function wallCandidates(
  boss: { y: number; x: number },
  hero: { y: number; x: number }
): Array<[number, number]> {
  const ty = Math.sign(hero.y - boss.y);
  const tx = Math.sign(hero.x - boss.x);
  const list: Array<[number, number]> = [];
  if (ty !== 0) list.push([boss.y + ty, boss.x]);
  if (tx !== 0) list.push([boss.y, boss.x + tx]);
  if (ty !== 0 && tx !== 0) list.push([boss.y + ty, boss.x + tx]);
  list.push([boss.y - 1, boss.x], [boss.y + 1, boss.x], [boss.y, boss.x - 1], [boss.y, boss.x + 1]);
  if (ty !== 0) list.push([boss.y + 2 * ty, boss.x]);
  if (tx !== 0) list.push([boss.y, boss.x + 2 * tx]);
  const seen = new Set<string>();
  return list.filter(([y, x]) => {
    const k = `${y},${x}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Try to raise one wall that impedes the hero without sealing them out. Returns
// true if a wall was built.
function tryBuildWall(
  ctx: BehaviorContext,
  mem: ShaperMemory,
  hero: { y: number; x: number },
  heroNext: { y: number; x: number },
  boss: { y: number; x: number }
): boolean {
  const grid = ctx.grid;
  const subs = ctx.subtypes;
  if (!subs) return false;
  for (const [y, x] of wallCandidates(boss, hero)) {
    if ((y === hero.y && x === hero.x) || (y === heroNext.y && x === heroNext.x)) continue;
    if (y === boss.y && x === boss.x) continue;
    const st = terrainStateAt(grid, subs, y, x);
    if (st !== "bare" && st !== "singed") continue; // build only on dry ground
    if (!heroCanReachBoss(grid, subs, hero, boss, [y, x])) continue; // never seal the hero out
    grid[y][x] = WALL;
    subs[y][x] = [];
    mem.lastWall = { nonce: mem.turn ?? 0, tiles: [[y, x]] };
    return true;
  }
  return false;
}

// Telegraph a fire (used by both strategies): pick rain-down targets around the
// aim tile and mark them pending; they land next turn.
function launchFire(
  ctx: BehaviorContext,
  mem: ShaperMemory,
  boss: { y: number; x: number },
  aim: { y: number; x: number },
  rng: () => number
): void {
  const subs = ctx.subtypes;
  if (!subs) return;
  const tiles = fireTargets(boss, aim, ctx.grid, subs, rng);
  mem.pendingFire = tiles.length > 0 ? { tiles } : null;
  if (tiles.length > 0) mem.fireLaunchNonce = mem.turn;
}

// A tile the boss may stand on while pacing/retreating: floor/flowers, safe
// (never lava or deep water), inside its home range, not the hero's tile/step.
function bossCanStand(
  ctx: BehaviorContext,
  mem: ShaperMemory,
  hero: { y: number; x: number },
  heroNext: { y: number; x: number },
  y: number,
  x: number
): boolean {
  const grid = ctx.grid;
  if (y < 0 || x < 0 || y >= grid.length || x >= (grid[0]?.length ?? 0)) return false;
  const t = grid[y][x];
  if (t !== FLOOR && t !== FLOWERS) return false;
  const s = ctx.subtypes?.[y]?.[x] ?? [];
  if (s.some((v) => !TERRAIN_SUBS.has(v))) return false; // object on the tile
  if (s.includes(TileSubtype.LAVA) || s.includes(TileSubtype.DEEP_WATER)) return false;
  if ((y === hero.y && x === hero.x) || (y === heroNext.y && x === heroNext.x)) return false;
  if (mem.roamMinY != null) {
    // Hard roam box (chamber interior) — keeps an off-center boss from leaving.
    if (y < mem.roamMinY || y > (mem.roamMaxY ?? y) || x < (mem.roamMinX ?? x) || x > (mem.roamMaxX ?? x)) {
      return false;
    }
  } else {
    const hy = mem.homeY ?? y;
    const hx = mem.homeX ?? x;
    if (cheb(y, x, hy, hx) > SHAPER_HOME_RANGE) return false;
  }
  return true;
}

function tryStep(
  ctx: BehaviorContext,
  mem: ShaperMemory,
  hero: { y: number; x: number },
  heroNext: { y: number; x: number },
  candidates: Array<[number, number]>
): boolean {
  for (const [dy, dx] of candidates) {
    if (dy === 0 && dx === 0) continue;
    const ny = ctx.enemy.y + dy;
    const nx = ctx.enemy.x + dx;
    if (bossCanStand(ctx, mem, hero, heroNext, ny, nx)) {
      ctx.enemy.y = ny;
      ctx.enemy.x = nx;
      ctx.enemy.facing = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "UP" : "DOWN") : dx < 0 ? "LEFT" : "RIGHT";
      return true;
    }
  }
  return false;
}

// An UNALERTED idle spew: a small local SPLATTER (2-3 tiles) centered on itself,
// alternating element — ambient reshaping while it hasn't spotted you, kept
// small so it rarely reaches the walls. (The alerted water/fire strategy lives
// inline in shaperUpdate.)
function idleSpew(
  ctx: BehaviorContext,
  mem: ShaperMemory,
  rng: () => number
): void {
  const subs = ctx.subtypes;
  if (!subs) return;
  const n = mem.attacks ?? 0;
  const element: ShaperElement = n % 2 === 0 ? "lava" : "water";
  const boss = { y: ctx.enemy.y, x: ctx.enemy.x };
  // Aim at itself (boss = hero) so the blob scatters locally, small.
  const muts = planShaperAttack("splatter", element, boss, boss, boss, ctx.grid, subs, rng, {
    minTiles: SHAPER_IDLE_MIN_TILES,
    maxTiles: SHAPER_IDLE_MAX_TILES,
  });
  if (muts.length > 0) {
    executeShaperAttack(muts, ctx.grid, subs);
    mem.lastAttack = { nonce: (mem.turn ?? 0) * 100 + n, element, tiles: muts.map((m) => [m.y, m.x]) };
  }
  mem.attacks = n + 1;
}

export function shaperUpdate(ctx: BehaviorContext): number {
  const mem = ctx.enemy.memory as ShaperMemory;
  const subs = ctx.subtypes;
  if (!subs) return 0;
  if (mem.homeY == null) {
    mem.homeY = ctx.enemy.y;
    mem.homeX = ctx.enemy.x;
  }
  const boss = { y: ctx.enemy.y, x: ctx.enemy.x };
  const hero = { y: ctx.player.y, x: ctx.player.x };
  const heroNext = ctx.playerNext ?? hero;
  const rng = ctx.rng ?? (() => 0.5);
  mem.turn = (mem.turn ?? 0) + 1;

  // Face the hero (cosmetic; overwritten by a move below if it steps).
  const dy = hero.y - boss.y;
  const dx = hero.x - boss.x;
  ctx.enemy.facing =
    Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "UP" : "DOWN") : dx < 0 ? "LEFT" : "RIGHT";

  // Latch the alert state once it gets line-of-sight within vision range, and
  // roll a per-encounter strategy (unless one was pre-set).
  if (!mem.alerted) {
    const inRange = Math.abs(dy) + Math.abs(dx) <= SHAPER_VISION;
    if (inRange && canSee(ctx.grid, [boss.y, boss.x], [hero.y, hero.x])) {
      mem.alerted = true;
      if (mem.strategy == null) {
        mem.strategy = rng() < SHAPER_WALL_STRATEGY_CHANCE ? "wall" : "drowning";
      }
    }
  }

  if (mem.alerted) {
    // A fire launched last turn RAINS DOWN now (before the hero's move), turning
    // the telegraphed tiles to lethal lava. The player had this turn's warning.
    if (mem.pendingFire) {
      const muts = floodTiles("lava", mem.pendingFire.tiles, ctx.grid, subs);
      if (muts.length > 0) {
        executeShaperAttack(muts, ctx.grid, subs);
        mem.lastAttack = { nonce: (mem.turn ?? 0) * 100 + 9, element: "lava", tiles: muts.map((m) => [m.y, m.x]) };
      }
      mem.pendingFire = null;
      return 0;
    }

    if (mem.strategy === "wall") {
      // WALL: raise a wall to fence you off; if it can't extend one (would seal
      // you out, or no dry ground) — or on its lava-mix tendency — it lobs fire.
      const wantsFire = rng() < SHAPER_WALL_LAVA_MIX;
      const built = wantsFire ? false : tryBuildWall(ctx, mem, hero, heroNext, boss);
      if (!built) launchFire(ctx, mem, boss, heroNext, rng);
      return 0;
    }

    // DROWNING: occasionally a lone pillar to mix it up, else the water cycle.
    if (rng() < SHAPER_DROWNING_PILLAR_CHANCE && tryBuildWall(ctx, mem, hero, heroNext, boss)) {
      return 0;
    }
    const strat = mem.strat ?? 0;
    if (strat === 0) {
      // Water squirt #1: flood the hero's ground (floor -> shallow).
      const muts = planShaperAttack("splatter", "water", boss, heroNext, heroNext, ctx.grid, subs, rng);
      if (muts.length > 0) {
        executeShaperAttack(muts, ctx.grid, subs);
        mem.lastWaterTiles = muts.map((m) => [m.y, m.x]);
        mem.lastAttack = { nonce: (mem.turn ?? 0) * 100, element: "water", tiles: mem.lastWaterTiles };
      }
      mem.strat = 1;
    } else if (strat === 1) {
      // Water squirt #2: deepen the same tiles into torch-snuffing DEEP water.
      const muts = floodTiles("water", mem.lastWaterTiles ?? [], ctx.grid, subs);
      if (muts.length > 0) {
        executeShaperAttack(muts, ctx.grid, subs);
        mem.lastAttack = { nonce: (mem.turn ?? 0) * 100 + 1, element: "water", tiles: muts.map((m) => [m.y, m.x]) };
      }
      mem.strat = 2;
    } else {
      // Fire launch: pick rain-down targets (avoiding water) and telegraph them.
      launchFire(ctx, mem, boss, heroNext, rng);
      mem.strat = 0;
    }
    return 0;
  }

  // Unalerted: spew only every 5-6 turns (small local pokes); otherwise pace/hold.
  if (mem.spewCountdown == null) mem.spewCountdown = SHAPER_IDLE_SPEW_MIN + Math.floor(rng() * 2);
  mem.spewCountdown -= 1;
  if (mem.spewCountdown <= 0) {
    idleSpew(ctx, mem, rng);
    mem.spewCountdown = SHAPER_IDLE_SPEW_MIN + Math.floor(rng() * 2); // 5 or 6
  } else if (rng() < SHAPER_IDLE_PACE_CHANCE) {
    // Pace to a random adjacent safe tile within its chamber.
    const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const start = Math.floor(rng() * 4);
    const order = [0, 1, 2, 3].map((i) => dirs[(start + i) % 4]);
    tryStep(ctx, mem, hero, heroNext, order);
  }
  return 0;
}

export function shaperRevealTiles(
  mem: ShaperMemory | undefined
): { nonce: number; element: ShaperElement; tiles: Array<[number, number]> } | null {
  if (!mem?.lastAttack || !mem.lastAttack.tiles.length) return null;
  return mem.lastAttack;
}

// Render hook: tiles where fire will RAIN DOWN next turn — draw a subtle warm
// glow so the player knows to step off. Null when no fire is pending.
export function shaperPendingFire(
  mem: ShaperMemory | undefined
): Array<[number, number]> | null {
  if (!mem?.pendingFire || !mem.pendingFire.tiles.length) return null;
  return mem.pendingFire.tiles;
}

// Render hook: a one-shot nonce set the turn fire launches (for the upward-lava
// animation + shake).
export function shaperFireLaunch(mem: ShaperMemory | undefined): number | null {
  return typeof mem?.fireLaunchNonce === "number" ? mem.fireLaunchNonce : null;
}

// Render hook: a wall the Shaper just raised (for the stone-rise flash + shake).
export function shaperWallReveal(
  mem: ShaperMemory | undefined
): { nonce: number; tiles: Array<[number, number]> } | null {
  if (!mem?.lastWall || !mem.lastWall.tiles.length) return null;
  return mem.lastWall;
}
