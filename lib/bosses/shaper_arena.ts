// Shaper arenas: a 25x25 keep. FOUR concentric hall tiers (1-wide corridors, one
// space apart) wrap an open 7x7 center where the Shaper waits. The tiers form a
// difficulty gradient:
//   - OUTER tiers (rings at dist 8 & 10): randomized, misaligned, NARROW (1-wide)
//     gaps -> a real maze; hard to navigate, and you can't sneak straight in.
//   - INNER tiers (rings at dist 4 & 6): ALIGNED, WIDER (3-wide) gaps on all four
//     sides -> straight sightlines from the center out to the inner halls, so the
//     Shaper sees you coming and you can't sneak up on it.
// Ring walls sit at dist 4/6/8/10 (border 12); corridors at dist 5/7/9/11; the
// center (dist <=3, rows/cols 9-15) is the open 7x7 room. The Shaper's lava melts
// walls as it fights, opening the maze further.
//
// Split from shaper.ts so the Enemy/GameState value imports never cycle back
// through the registry. Gap RNG defaults to Math.random; tests pass a seed.
import { Enemy } from "../enemy";
import { TileSubtype, Direction } from "../map/constants";
import type { GameState } from "../map/game-state";

const FLOOR = 0;
const WALL = 1;
const SIZE = 25;
const CENTER = 12;
const CENTER_LO = 9; // open 7x7 center / boss roam box: rows/cols 9-15
const CENTER_HI = 15;

export interface ShaperLayout {
  name: string;
  seed: "water" | "lava";
}

export const SHAPER_LAYOUTS: ShaperLayout[] = [
  { name: "The Sunken Keep", seed: "water" },
  { name: "The Ember Keep", seed: "lava" },
];

export type ShaperEntry = "north" | "south" | "east" | "west";
export const SHAPER_ENTRIES: ShaperEntry[] = ["north", "south", "east", "west"];

const ENTRY_HERO: Record<ShaperEntry, [number, number]> = {
  south: [23, 12],
  north: [1, 12],
  east: [12, 23],
  west: [12, 1],
};

// The keep's own way out, on the side OPPOSITE the hero's entry: fight in, kill the
// Shaper for its gold key in the middle, then leave through the far side instead of
// backtracking. It sits on the outermost FLOOR tile of that side (the mirror of the
// entry tile) rather than in the border wall, so it reads as a doorway you walk onto.
const ENTRY_EXIT: Record<ShaperEntry, [number, number]> = {
  south: [1, 12],
  north: [SIZE - 2, 12],
  east: [12, 1],
  west: [12, SIZE - 2],
};

type Grid = number[][];
type Subs = number[][][];
type Side = "N" | "S" | "E" | "W";
const SIDES: Side[] = ["N", "S", "E", "W"];

// Gap coords for a side of the ring at `dist`, centred `offset` tiles along that side
// (0 = the side's midpoint, which is where the sightlines run). Narrow = one tile; wide
// = that tile plus its two neighbours along the wall.
function gapCoords(
  dist: number,
  side: Side,
  wide: boolean,
  offset = 0
): Array<[number, number]> {
  const spread = wide ? [-1, 0, 1] : [0];
  return spread.map((d) => {
    const o = offset + d;
    if (side === "N") return [CENTER - dist, CENTER + o] as [number, number];
    if (side === "S") return [CENTER + dist, CENTER + o] as [number, number];
    if (side === "W") return [CENTER + o, CENTER - dist] as [number, number];
    return [CENTER + o, CENTER + dist] as [number, number]; // E
  });
}

// The hall loops run at the ODD distances, between the ring walls.
const CORRIDORS = [5, 7, 9, 11];
/**
 * How far off the midline each hall loop is cut. Nonzero on purpose: severing exactly
 * on the midline would also block the boss's cardinal sightlines out of the chamber.
 */
const SEVER_OFFSET = 2;

/** Which way the keep is traversed, from the entry side to the exit side. */
type Axis = "NS" | "EW";
const AXIS_FOR_ENTRY: Record<ShaperEntry, Axis> = {
  north: "NS",
  south: "NS",
  east: "EW",
  west: "EW",
};

/**
 * Cut every hall loop at two points on the axis PERPENDICULAR to the entry→exit run, so
 * the loops stop being loops: each becomes an entry-side arc and an exit-side arc that
 * only meet through the middle. This is what stops you strolling around the outer rim
 * to the exit — the Shaper's chamber is the sole way across the keep.
 */
function severCorridors(tiles: Grid, axis: Axis): void {
  for (const d of CORRIDORS) {
    if (axis === "NS") {
      tiles[CENTER + SEVER_OFFSET][CENTER - d] = WALL;
      tiles[CENTER + SEVER_OFFSET][CENTER + d] = WALL;
    } else {
      tiles[CENTER - d][CENTER + SEVER_OFFSET] = WALL;
      tiles[CENTER + d][CENTER + SEVER_OFFSET] = WALL;
    }
  }
}

function drawRing(tiles: Grid, dist: number, gaps: Array<[number, number]>): void {
  const lo = CENTER - dist;
  const hi = CENTER + dist;
  const gapSet = new Set(gaps.map(([y, x]) => `${y},${x}`));
  for (let i = lo; i <= hi; i++) {
    for (const [yy, xx] of [[lo, i], [hi, i], [i, lo], [i, hi]] as Array<[number, number]>) {
      if (!gapSet.has(`${yy},${xx}`)) tiles[yy][xx] = WALL;
    }
  }
}

function seedChamberTerrain(subtypes: Subs, seed: "water" | "lava"): void {
  const put = (y: number, x: number, sub: number) => {
    if (y === CENTER && x === CENTER) return;
    subtypes[y][x] = [sub];
  };
  if (seed === "water") {
    for (let y = 10; y <= 12; y++) for (let x = 10; x <= 11; x++) put(y, x, TileSubtype.SHALLOW_WATER);
    put(11, 10, TileSubtype.DEEP_WATER);
    put(13, 14, TileSubtype.LAVA);
    put(14, 13, TileSubtype.LAVA);
  } else {
    for (let y = 10; y <= 12; y++) put(y, 13, TileSubtype.LAVA);
    put(13, 13, TileSubtype.LAVA);
    put(14, 10, TileSubtype.SHALLOW_WATER);
    put(14, 11, TileSubtype.SHALLOW_WATER);
  }
}

// Loot on the corridor loops (odd distances) — never on a ring wall, so it
// always lands on floor whatever the gap rng does.
const RING_ROCKS: Array<[number, number]> = [
  [23, 7], [23, 17], [1, 7], [1, 17], [7, 1], [7, 23], [17, 1], [17, 23], [3, 3], [21, 21], [5, 19], [19, 5],
];
const RING_POTS: Array<[number, number]> = [
  [3, 7], [21, 17], [7, 3], [17, 21],
];

function scatterLoot(tiles: Grid, subtypes: Subs): void {
  for (const [y, x] of RING_ROCKS) {
    if (tiles[y]?.[x] === FLOOR && subtypes[y][x].length === 0) subtypes[y][x] = [TileSubtype.ROCK];
  }
  for (const [y, x] of RING_POTS) {
    if (tiles[y]?.[x] === FLOOR && subtypes[y][x].length === 0) subtypes[y][x] = [TileSubtype.POT];
  }
}

export function buildShaperArena(
  layout: ShaperLayout,
  entry: ShaperEntry = "south",
  rng: () => number = Math.random
): GameState {
  const tiles: Grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => WALL));
  const subtypes: Subs = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );
  for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) tiles[y][x] = FLOOR;

  const axis = AXIS_FOR_ENTRY[entry];
  // The two sides the traverse runs through: one faces the entry, the other the exit.
  // Every outer ring MUST be gapped on both, or one half of the keep would be sealed.
  const axisSides: Side[] = axis === "NS" ? ["N", "S"] : ["E", "W"];
  const crossSides: Side[] = axis === "NS" ? ["E", "W"] : ["N", "S"];

  // Outer maze tiers: narrow gaps, slid to a random offset along each side so the halls
  // still wind (you walk the arc hunting the next opening) — plus an optional dead-end
  // opening on a cross side for a red herring.
  const outerGaps = (dist: number): Array<[number, number]> => {
    const span = dist - 2; // keep the opening clear of the ring's corners
    const gaps = axisSides.flatMap((s) =>
      gapCoords(dist, s, false, Math.floor(rng() * (2 * span + 1)) - span)
    );
    if (rng() < 0.5) {
      const decoy = crossSides[Math.floor(rng() * crossSides.length)];
      gaps.push(...gapCoords(dist, decoy, false, Math.floor(rng() * (2 * span + 1)) - span));
    }
    return gaps;
  };
  drawRing(tiles, 10, outerGaps(10));
  drawRing(tiles, 8, outerGaps(8));
  // Inner tiers: wide, aligned, all four sides -> the boss can see you coming.
  drawRing(tiles, 6, SIDES.flatMap((s) => gapCoords(6, s, true)));
  drawRing(tiles, 4, SIDES.flatMap((s) => gapCoords(4, s, true)));
  // Cut the loops so the rim can't be walked around: entry side and exit side now only
  // connect through the Shaper's chamber.
  severCorridors(tiles, axis);

  seedChamberTerrain(subtypes, layout.seed);
  scatterLoot(tiles, subtypes);

  for (const [y, x] of [
    [0, 6], [0, 18], [SIZE - 1, 6], [SIZE - 1, 18], [6, 0], [18, 0], [6, SIZE - 1], [18, SIZE - 1],
  ] as Array<[number, number]>) {
    subtypes[y][x] = [TileSubtype.WALL_TORCH];
  }

  const [hy, hx] = ENTRY_HERO[entry];
  subtypes[hy][hx] = [TileSubtype.PLAYER];

  // The way out, on the FLOOR of the far side. Visible from the moment you walk in (a
  // promise of an escape you can't use yet): without the gold key you can stand on it
  // and nothing happens; with the key the Shaper drops on death, it ends the run.
  const [ey, ex] = ENTRY_EXIT[entry];
  tiles[ey][ex] = FLOOR;
  subtypes[ey][ex] = [TileSubtype.EXIT];

  tiles[CENTER][CENTER] = FLOOR;
  subtypes[CENTER][CENTER] = [];
  const shaper = new Enemy({ y: CENTER, x: CENTER });
  shaper.kind = "shaper";
  const mem = shaper.behaviorMemory as Record<string, unknown>;
  mem.roamMinY = CENTER_LO;
  mem.roamMaxY = CENTER_HI;
  mem.roamMinX = CENTER_LO;
  mem.roamMaxX = CENTER_HI;

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.UP,
    enemies: [shaper],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 2,
    runeCount: 0,
    foodCount: 0,
    potionCount: 0,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
  };
}
