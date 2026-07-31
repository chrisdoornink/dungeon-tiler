// Coilwyrm arenas: a 15x15 hall (13x13 of floor) whose only furniture is PILLARS.
//
// SIZE IS A BALANCE DECISION, not a frame. At equal speed the head can never run a
// fleeing hero down in open ground, so the thing that actually punishes kiting is the
// coil eating the space you were kiting through. A 19x19 hall was so roomy that a
// 12-segment wyrm never crowded anything and a player could lap it forever; at 13x13
// with the coil growing past 20 segments, your own escape routes close behind you.
//
// PILLARS ARE THE WEAPON. A cut severs everything behind it, so the payoff cut is the one
// nearest the head — and the head is the end that bites. Pillars are how you buy that
// approach: orbit one and the coil has to follow you around it, which folds the body back
// on itself and puts deep segments within reach from a tile the head cannot bite you on.
// Sizes matter for that: a 1x1 block has an 8-tile orbit and a 2x2 has a 12-tile one, so
// every layout offers both and there is a right-sized loop at each length of the fight.
//
// Layout rules: pillars keep >=2 tiles of gap so the hero can always circle one and the
// coil can always follow, and no layout has a dead-end pocket — being encircled should
// be a mistake you made, not a corridor you were handed.
//
// Split from coilwyrm.ts for the same reason as the Shaper: the brain stays pure so the
// registry can import it without cycling back through Enemy/GameState.
import { Enemy } from "../enemy";
import { TileSubtype, Direction } from "../map/constants";
import type { GameState } from "../map/game-state";
import {
  COILWYRM_SEGMENT_HP,
  COILWYRM_START_SEGMENTS,
  COILWYRM_GROW_MIN,
  COILWYRM_GROW_MAX,
  type CoilHeadMemory,
  type CoilTuningMemory,
  type CoilSegmentMemory,
} from "./coilwyrm";

const FLOOR = 0;
const WALL = 1;
const SIZE = 15;

export interface CoilwyrmLayout {
  name: string;
  /** Blocked tiles inside the hall (pillars). */
  pillars: Array<[number, number]>;
  /** Where the hero starts. */
  hero: [number, number];
  /**
   * Head tile, then the tiles the body occupies behind it (index 1..n). Must be long
   * enough for the largest segment count the arena is ever asked for, or the coil is
   * silently built short — keep at least 1 + 8 entries.
   */
  wyrm: Array<[number, number]>;
  /** Loose rocks on the floor at the start. */
  rocks: Array<[number, number]>;
}

// REMOVED — "Pillar Grove" (four 1x1 posts around a 2x2 core) was cut on playtest for being a
// difficulty outlier: a skilled line beat it 20/20 while every other layout sat at 13-18/20, and
// it played as "trivially easy once you have solved it once". Its four short corner orbits plus a
// central one gave a right-sized loop at every coil length, which is exactly what removes the
// pressure. Recoverable from git history if a deliberately gentle layout is ever wanted.

// Two long spines: fewer, bigger obstacles, so a lap is a real commitment — you cannot
// bail out of an orbit halfway through.
const SPINES: CoilwyrmLayout = {
  name: "The Spines",
  pillars: [
    [3, 5], [4, 5], [5, 5],
    [9, 9], [10, 9], [11, 9],
    [3, 9], [11, 5],
  ],
  hero: [12, 12],
  wyrm: [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]],
  rocks: [[12, 1], [7, 7], [1, 12], [9, 2], [5, 12], [12, 6], [2, 7], [7, 11], [9, 12]],
};

// Corner clusters around one open middle: the most inviting arena to kite in circles,
// and therefore the one that punishes it hardest as the coil fills the centre.
const ROTUNDA: CoilwyrmLayout = {
  name: "The Rotunda",
  pillars: [
    [3, 3], [3, 4], [4, 3],
    [3, 11], [3, 10], [4, 11],
    [11, 3], [11, 4], [10, 3],
    [11, 11], [11, 10], [10, 11],
    [7, 7],
  ],
  hero: [7, 12],
  wyrm: [[7, 2], [6, 2], [5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [1, 3], [1, 4]],
  rocks: [[1, 7], [13, 7], [7, 13], [1, 1], [13, 13], [5, 7], [9, 7], [7, 4], [11, 7]],
};

// Two parallel wall runs with an open middle band: crossing the room is a commitment, and
// the central crossroads is where the coil folds back on itself.
const GAUNTLET: CoilwyrmLayout = {
  name: "The Gauntlet",
  pillars: [
    [3, 5], [4, 5], [5, 5], [9, 5], [10, 5], [11, 5],
    [3, 9], [4, 9], [5, 9], [9, 9], [10, 9], [11, 9],
  ],
  hero: [12, 7],
  wyrm: [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10]],
  rocks: [[12, 2], [12, 12], [7, 2], [7, 12], [3, 7], [11, 7], [6, 3], [8, 11], [13, 7]],
};

// One big 3x3 block in the middle plus corner posts: a long central orbit for a grown coil
// and short ones in the corners for when it is short.
const CHAPEL: CoilwyrmLayout = {
  name: "The Chapel",
  pillars: [
    [6, 6], [6, 7], [6, 8],
    [7, 6], [7, 7], [7, 8],
    [8, 6], [8, 7], [8, 8],
    [3, 3], [3, 11], [11, 3], [11, 11],
  ],
  hero: [12, 7],
  wyrm: [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1]],
  rocks: [[1, 7], [13, 7], [7, 13], [2, 2], [12, 12], [4, 7], [10, 7], [7, 3], [12, 2]],
};

// Staggered stubs on alternating sides: nothing to orbit cleanly, so the coil ends up folded
// into switchbacks and deep cuts open up in unexpected places.
const COMBS: CoilwyrmLayout = {
  name: "The Combs",
  pillars: [
    [3, 4], [3, 5],
    [6, 9], [6, 10],
    [9, 4], [9, 5],
    [11, 9], [11, 10],
  ],
  hero: [12, 2],
  wyrm: [[1, 12], [1, 11], [1, 10], [1, 9], [1, 8], [1, 7], [1, 6], [1, 5], [1, 4]],
  rocks: [[12, 12], [7, 2], [7, 12], [4, 8], [8, 2], [13, 7], [3, 2], [10, 12], [6, 6]],
};

export const COILWYRM_LAYOUTS: CoilwyrmLayout[] = [
  SPINES,
  ROTUNDA,
  GAUNTLET,
  CHAPEL,
  COMBS,
];

/**
 * Build a playable Coilwyrm arena. The head is `enemies[0]` and the segments follow in
 * coil order — load-bearing, not cosmetic: `updateEnemies` ticks in array order and
 * every follower reads the path the head publishes on the same tick, so a segment that
 * ticked before the head would trail a turn behind and the coil would come apart.
 */
export interface CoilwyrmTuning {
  /** Turns between hunger surges; 0 never surges. */
  surgeEvery?: number;
  /** Tiles per lunge. 1 removes every double-move, including the post-cut thrash. */
  lungeTiles?: number;
  /**
   * Bounds on the growth cadence roll (turns between new segments). With double-moves settled
   * off, this is the fight's main difficulty dial: growth has to stay SLOWER than the rate a
   * competent player severs body, or the arithmetic is unwinnable however well they play.
   */
  growMin?: number;
  growMax?: number;
}

/**
 * The encounter as it is meant to be played: one tile per turn, no surge. Chosen on playtest —
 * a double-move is jarring to read and measurement says it is a taste call, not a balance one
 * (cutter win rate is flat across every surge setting; the surge only adds pressure against a
 * hero who does nothing but run). Deliberately set HERE rather than by lowering
 * COILWYRM_LUNGE_TILES: the constant still defines what a lunge IS and keeps the post-cut
 * thrash under test, so the mechanic stays intact and available for a future encounter.
 */
export const COILWYRM_DEFAULT_TUNING: CoilwyrmTuning = {
  lungeTiles: 1,
  surgeEvery: 0,
};

export function buildCoilwyrmArena(
  layout: CoilwyrmLayout = COILWYRM_LAYOUTS[0],
  rng: () => number = Math.random,
  segmentCount: number = COILWYRM_START_SEGMENTS,
  tuning: CoilwyrmTuning = COILWYRM_DEFAULT_TUNING
): GameState {
  const tiles: number[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) tiles[y][x] = FLOOR;
  }
  for (const [y, x] of layout.pillars) {
    if (y > 0 && x > 0 && y < SIZE - 1 && x < SIZE - 1) tiles[y][x] = WALL;
  }

  // Wall torches on the four walls: this fight is fought at full sight, so the coil's
  // shape is always readable. (Darkness is another boss's job.)
  for (const [y, x] of [
    [0, 4], [0, 10], [SIZE - 1, 4], [SIZE - 1, 10],
    [4, 0], [10, 0], [4, SIZE - 1], [10, SIZE - 1],
  ] as Array<[number, number]>) {
    subtypes[y][x] = [TileSubtype.WALL_TORCH];
  }

  for (const [y, x] of layout.rocks) {
    if (tiles[y]?.[x] === FLOOR && subtypes[y][x].length === 0) {
      subtypes[y][x] = [TileSubtype.ROCK];
    }
  }

  const [hy, hx] = layout.hero;
  subtypes[hy][hx] = [TileSubtype.PLAYER];

  // The way out sits behind the wyrm's starting position, so leaving means crossing the
  // hall it owns. Inert until the head dies and drops the gold key.
  const exitPos: [number, number] = [1, SIZE - 2];
  tiles[exitPos[0]][exitPos[1]] = FLOOR;
  subtypes[exitPos[0]][exitPos[1]] = [TileSubtype.EXIT];

  // --- The wyrm ------------------------------------------------------------------
  const coilId = `coil-${Math.floor(rng() * 1e6).toString(36)}`;
  const wanted = 1 + Math.max(1, segmentCount);
  if (layout.wyrm.length < wanted) {
    // Silently truncating here once cost us a coil two segments shorter than every
    // constant and test claimed.
    throw new Error(
      `Coilwyrm layout "${layout.name}" defines ${layout.wyrm.length} body tiles but ${wanted} were requested`
    );
  }
  const body = layout.wyrm.slice(0, wanted);
  const [headY, headX] = body[0];
  const head = new Enemy({ y: headY, x: headX });
  head.kind = "coilwyrm";
  const headMem = head.behaviorMemory as CoilHeadMemory;
  headMem.coilId = coilId;
  headMem.coilRole = "head";
  headMem.path = body.map(([y, x]) => [y, x] as [number, number]);
  headMem.segments = body.length - 1;
  const growLo = tuning.growMin ?? COILWYRM_GROW_MIN;
  const growHi = Math.max(growLo, tuning.growMax ?? COILWYRM_GROW_MAX);
  headMem.growEvery = growLo + Math.floor(rng() * (growHi - growLo + 1));
  headMem.growCountdown = headMem.growEvery;
  headMem.thrash = 0;
  // Stamped on the head AND on every segment. A segment can become a head (a severed or
  // decapitated length promotes one), and promotion rewrites that segment's own memory bag — so
  // anything the bag does not carry is lost, and the new wyrm silently reverts to the module
  // constants. See CoilTuningMemory.
  const applyTuning = (mem: CoilTuningMemory) => {
    if (tuning.surgeEvery !== undefined) mem.surgeEvery = tuning.surgeEvery;
    if (tuning.lungeTiles !== undefined) mem.lungeTiles = tuning.lungeTiles;
    if (tuning.growMin !== undefined) mem.growMin = tuning.growMin;
    if (tuning.growMax !== undefined) mem.growMax = tuning.growMax;
  };
  applyTuning(headMem);

  const enemies: Enemy[] = [head];
  for (let i = 1; i < body.length; i++) {
    const [sy, sx] = body[i];
    const seg = new Enemy({ y: sy, x: sx });
    seg.kind = "coilwyrm-coil";
    seg.health = COILWYRM_SEGMENT_HP;
    seg.maxHealth = COILWYRM_SEGMENT_HP;
    const segMem = seg.behaviorMemory as CoilSegmentMemory;
    segMem.coilId = coilId;
    segMem.coilIndex = i;
    segMem.coilRole = i === body.length - 1 ? "tail" : "body";
    applyTuning(segMem);
    enemies.push(seg);
  }

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.UP,
    enemies,
    // Flagged as a boss arena so the standard flow applies: killing the head drops the
    // gold key (dropBossKeyOnDefeat) and the EXIT then ends the run outright rather
    // than advancing a floor. There is no bossReturn here, so the sandbox has no way
    // back out to a dungeon — the exit is the only door.
    inBossRoom: true,
    // More slack than the Shaper's arena, because this fight is a long dance inside
    // biting range: headless simulation put a 6 HP hero's win rate in the single digits
    // purely on the HP economy. Food and the potion are the pacing valve — spending a
    // turn eating is a turn not cutting, so the budget is real but it is spendable.
    heroHealth: 6,
    heroMaxHealth: 6,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 3,
    runeCount: 0,
    foodCount: 3,
    potionCount: 1,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
  };
}
