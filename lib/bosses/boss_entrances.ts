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
import { Enemy } from "../enemy";

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
 * Drown the map corner farthest from the hero in lava or deep water, and set a
 * lockless cave mouth at its tip. Only bare FLOOR is flooded, so the room's exit,
 * key, rocks, pots, torches and faulty floors all survive as dry islands.
 */
function stampCornerMoat(map: MapData, element: MoatElement): void {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const [hy, hx] = findPlayerPos(map);
  const corners: Array<[number, number]> = [
    [1, 1],
    [1, W - 2],
    [H - 2, 1],
    [H - 2, W - 2],
  ];
  const corner = corners.reduce((best, c) =>
    Math.hypot(c[0] - hy, c[1] - hx) > Math.hypot(best[0] - hy, best[1] - hx) ? c : best
  );
  const [cy, cx] = corner;
  const blockH = Math.round(H * 0.42);
  const blockW = Math.round(W * 0.42);
  const y0 = cy < H / 2 ? 1 : H - 1 - blockH;
  const y1 = cy < H / 2 ? blockH : H - 2;
  const x0 = cx < W / 2 ? 1 : W - 1 - blockW;
  const x1 = cx < W / 2 ? blockW : W - 2;

  const deepSub = element === "lava" ? TileSubtype.LAVA : TileSubtype.DEEP_WATER;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (map.tiles[y][x] === FLOOR && map.subtypes[y][x].length === 0) {
        map.subtypes[y][x] = [deepSub];
      }
    }
  }
  // Water gets a wadeable shallow lip wherever it meets dry land (readability).
  if (element === "water") {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!map.subtypes[y]?.[x]?.includes(TileSubtype.DEEP_WATER)) continue;
        const touchesDry = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>).some(
          ([dy, dx]) => {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= H || nx >= W) return false;
            return map.tiles[ny][nx] === FLOOR && map.subtypes[ny][nx].length === 0;
          }
        );
        if (touchesDry) map.subtypes[y][x] = [TileSubtype.SHALLOW_WATER];
      }
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
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const passable = (y: number, x: number) => {
    if (y < 0 || x < 0 || y >= H || x >= W) return false;
    if (map.tiles[y][x] !== FLOOR && map.tiles[y][x] !== FLOWERS) return false;
    const s = map.subtypes[y]?.[x] ?? [];
    if (s.includes(TileSubtype.LAVA) || s.includes(TileSubtype.OPEN_ABYSS)) return false;
    if (s.includes(TileSubtype.DEEP_WATER) && !opts?.wadeable) return false;
    return true;
  };
  const seen = new Set<string>();
  if (!passable(sy, sx)) return seen;
  seen.add(`${sy},${sx}`);
  const q: Array<[number, number]> = [[sy, sx]];
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
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
 * Place the DARK_PORTAL on the reachable floor tile farthest from the hero that has
 * NO relight source (wall torch / lava) beside it, so once the hero douses their
 * torch it stays out and the portal remains visible + usable. Prefers tiles the hero
 * can only get to by wading (past the water).
 */
function placeDarkPortal(map: MapData, hy: number, hx: number): void {
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const reachable = floodReachable(map, hy, hx, { wadeable: true });
  const noRelightNear = (y: number, x: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const s = map.subtypes[y + dy]?.[x + dx] ?? [];
        if (s.includes(TileSubtype.WALL_TORCH) || s.includes(TileSubtype.LAVA)) return false;
      }
    return true;
  };
  let best: [number, number] | null = null;
  let bestD = -1;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (map.tiles[y][x] !== FLOOR) continue;
      if ((map.subtypes[y][x]?.length ?? 0) !== 0) continue; // bare floor only
      if (!reachable.has(`${y},${x}`)) continue;
      if (!noRelightNear(y, x)) continue;
      const d = Math.abs(y - hy) + Math.abs(x - hx);
      if (d > bestD) {
        bestD = d;
        best = [y, x];
      }
    }
  }
  if (best) map.subtypes[best[0]][best[1]] = [TileSubtype.DARK_PORTAL];
}

/**
 * DOUSE approach, in a REAL Level-3-sized room. A dark dungeon (no wall torches, so
 * it stays black once doused) with a forced deep-water pool: wade it to snuff your
 * torch, and the DARK_PORTAL — invisible in the light — lights up as a beacon across
 * the dark and can be entered. Three ghosts prowl (and, being torch-snuffers, may
 * plunge you into the dark themselves).
 */
export function buildDousePortalApproach(): GameState {
  // The GHOSTS are the way in: they snuff the torch when adjacent (and their presence
  // signals the secret), revealing the DARK_PORTAL beacon. No wall torches, so it
  // stays dark once snuffed. Just a few deep-water tiles sit in the far corner.
  const map = generateCompleteMapForFloor(
    { chests: 0, keys: 0, chestContents: [] },
    3,
    { wallTorches: 0 }
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
export const MAX_DECOY_SEALS = 2;
/** Chebyshev spacing between seals, so two of them never read as one motif. */
const SEAL_SPACING = 4;
/** How far from any wall torch a decoy must sit, so a torch PAIR stays the only tell. */
const DECOY_TORCH_CLEARANCE = 2;

/**
 * How many decoy cracks this floor gets: 0, 1, or 2, rolled per floor on EVERY daily
 * floor — not just floor 3, and not just bomb days. Cracks you can do nothing about are
 * the point: seeing one on floor 1 with no bombs yet teaches the vocabulary, and a floor
 * that rolls zero keeps the motif from becoming furniture.
 * Must be called inside the daily seeded RNG block.
 */
export function rollDecoySealCount(): number {
  const r = Math.random();
  if (r < 0.3) return 0;
  if (r < 0.75) return 1;
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
 * Runs on EVERY daily floor, so cracks show up on floors 1 and 2 where the hero has no
 * bombs yet and simply can't act on them. Spaced ≥SEAL_SPACING from `avoid` (the real
 * doorway, when there is one) and from each other.
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
  kind: BossEntranceKind
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
    stampCornerMoat(map, "water");
    return { placed: countSubtype(map, TileSubtype.BOSS_ENTRANCE) > before };
  }
  // douse: a few deep-water tiles to snuff the torch, plus the dark portal itself.
  stampCornerWaterPatch(map, hy, hx);
  const before = countSubtype(map, TileSubtype.DARK_PORTAL);
  placeDarkPortal(map, hy, hx);
  return { placed: countSubtype(map, TileSubtype.DARK_PORTAL) > before };
}

function countSubtype(map: MapData, sub: number): number {
  let n = 0;
  for (const row of map.subtypes) for (const cell of row) if (cell.includes(sub)) n++;
  return n;
}
