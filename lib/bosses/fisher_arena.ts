// The Fisher's pond: a 25x25 outdoor arena split by a bed of spikes. You always enter
// from the SOUTH and you never cross. Everything about the layout exists to make a 4-tile
// straight throw the only verb that matters.
//
// EVERYTHING THE FISHER DOES HAPPENS INSIDE THE CAMERA'S VIEW. The camera follows the
// hero, who spends the whole fight within a couple of rows of the barrier — so anything
// more than ~4 rows onto the far bank is off-screen and might as well not exist. The
// Fisher's water, its snakes and its safe pacing row are all packed into rows 9-12,
// hugging the barrier, so the fiction (a heron standing in the shallows, plucking snakes
// out) actually reads on screen. Rows 1-8 are the victory walk, seen only after it falls.
//
// ROW BUDGET (and why each number is what it is — the whole fight is range arithmetic):
//   0        map border
//   1        the EXIT, behind a gap in the treeline
//   2..3     dense far treeline: the back wall of the clearing
//   4..8     the Fisher's deep back water + reeds. Scenery; outside its roam box.
//   9..12    ITS ENTIRE LIFE (BANK_MIN_Y..BANK_MAX_Y) — shallow water it wades, where the
//            snakes live, and all of it on screen during the fight.
//   FISH_ROW=9           its safe pacing row. 5 tiles from the near bank, so while it
//                        fishes here you CANNOT reach it. Passivity is a stall.
//   10..12   its STRIKE rows — the rows a hero at row 14+ can reach with a rock, and the
//            rows from which its 4-tile spear reaches the near bank. Symmetric by
//            construction. Row 12 puts it right at the water's edge, looming over you.
//   13       SPIKES — ONE row, full width. One is enough because the barrier REFUSES the
//            move outright rather than charging per-step damage, so width buys nothing;
//            the row it gives back goes to the Fisher, which needs the space more.
//   14..23   the near bank: ponds, flowers, trees, and ~20 rocks around the pond edges
//   24       map border
//
// THE TREES ARE MECHANICAL, NOT DECORATIVE. A tree is a non-FLOOR tile, so it stops a
// thrown rock AND stops the Fisher's spear. The near-bank treeline therefore defines
// which columns are firing lanes and which are cover — that is the arena's real
// geometry, and the reason the peaceful scenery is load-bearing.
//
// Split from fisher.ts so the Enemy/GameState value imports never cycle through the
// registry (same discipline as shaper_arena.ts). Scatter RNG defaults to Math.random;
// tests pass a seeded one.
import { Enemy } from "../enemy";
import { TileSubtype, Direction, FLOWERS, TREE } from "../map/constants";
import type { GameState } from "../map/game-state";

const FLOOR = 0;
const WALL = 1;
const SIZE = 25;

// A single spike row. See the row budget above: the barrier blocks by refusing the move,
// so extra rows add nothing mechanically and only push the Fisher out of frame.
export const SPIKE_MIN_Y = 13;
export const SPIKE_MAX_Y = 13;
/** First row of the hero's side. The Fisher measures its lure distance from here. */
export const HERO_SIDE_MIN_Y = SPIKE_MAX_Y + 1; // 14
/** The Fisher's whole world: four rows of shallows hugging the barrier, all on camera. */
export const BANK_MIN_Y = 9;
export const BANK_MAX_Y = SPIKE_MIN_Y - 1; // 12 — the water's edge, right at the spikes
export const FISH_ROW = BANK_MIN_Y; // 9 — one tile past the reach of a throw from row 14
export const EXIT_Y = 1;
/** Column of the exit and of the dry corridor carved up to it through the back water. */
export const EXIT_X = 12;

/** Where the hero starts: back of the near bank, out of the Fisher's lure range. */
const HERO_START: [number, number] = [22, 12];

/**
 * Healing pots lining the hero's back and side walls. Guaranteed POTIONS, not food — a
 * dozen thrown snakes plus a 2-damage spear is a lot of chip damage, and food doesn't
 * answer a snake bite. Hugging the perimeter and spread to the corners on purpose: a
 * potion is only worth what it costs to reach, so each one should be a real detour off the
 * firing line, and there should be one within reach of wherever you got cornered.
 */
export const POTION_POTS: Array<[number, number]> = [
  // Back wall, pushed out to the corners.
  [23, 2],
  [23, 12],
  [23, 22],
  // Side walls, up near the middle of the near bank.
  [18, 1],
  [19, 23],
];

export interface FisherLayout {
  name: string;
  /** How much of the near bank is water. More water = fewer safe firing positions. */
  ponds: "twin" | "broad";
}

export const FISHER_LAYOUTS: FisherLayout[] = [
  { name: "The Still Ponds", ponds: "twin" },
  { name: "The Wide Shallows", ponds: "broad" },
];

type Grid = number[][];
type Subs = number[][][];

/** A pond: shallow water over the whole ellipse, deep in the middle. */
function pond(
  subtypes: Subs,
  cy: number,
  cx: number,
  ry: number,
  rx: number,
  deep: boolean
): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (y < 1 || x < 1 || y >= SIZE - 1 || x >= SIZE - 1) continue;
      const d = ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2;
      if (d > 1) continue;
      if (subtypes[y][x].length > 0) continue;
      // Deep only well inside the ellipse, so shallow always rings it — the hero can
      // wade in and out without the torch snuffing by accident.
      subtypes[y][x] = [
        deep && d < 0.28 ? TileSubtype.DEEP_WATER : TileSubtype.SHALLOW_WATER,
      ];
    }
  }
}

/** Ring the pond edge with rocks: ammunition, and traps to salt the firing line with. */
function rocksAroundPonds(tiles: Grid, subtypes: Subs, want: number, rng: () => number): number {
  const edges: Array<[number, number]> = [];
  for (let y = HERO_SIDE_MIN_Y; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (tiles[y][x] !== FLOOR && tiles[y][x] !== FLOWERS) continue;
      if (subtypes[y][x].length > 0) continue;
      const touchesWater = [
        [y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1],
      ].some(([ny, nx]) => {
        const s = subtypes[ny]?.[nx] ?? [];
        return s.includes(TileSubtype.SHALLOW_WATER) || s.includes(TileSubtype.DEEP_WATER);
      });
      if (touchesWater) edges.push([y, x]);
    }
  }
  // Fisher-Yates over the shoreline so the rocks read as scattered, not placed.
  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [edges[i], edges[j]] = [edges[j], edges[i]];
  }
  let placed = 0;
  for (const [y, x] of edges) {
    if (placed >= want) break;
    subtypes[y][x] = [TileSubtype.ROCK];
    placed++;
  }
  return placed;
}

/** Fill the remaining rock quota anywhere open on the near bank. */
function rocksAnywhere(tiles: Grid, subtypes: Subs, want: number, rng: () => number): void {
  const open: Array<[number, number]> = [];
  for (let y = HERO_SIDE_MIN_Y; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (tiles[y][x] !== FLOOR && tiles[y][x] !== FLOWERS) continue;
      if (subtypes[y][x].length > 0) continue;
      open.push([y, x]);
    }
  }
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  for (let i = 0; i < Math.min(want, open.length); i++) {
    const [y, x] = open[i];
    subtypes[y][x] = [TileSubtype.ROCK];
  }
}

export const FISHER_ROCK_COUNT = 20;

export function buildFisherArena(
  layout: FisherLayout = FISHER_LAYOUTS[0],
  rng: () => number = Math.random
): GameState {
  const tiles: Grid = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => FLOOR)
  );
  const subtypes: Subs = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );
  // Border wall
  for (let i = 0; i < SIZE; i++) {
    tiles[0][i] = WALL;
    tiles[SIZE - 1][i] = WALL;
    tiles[i][0] = WALL;
    tiles[i][SIZE - 1] = WALL;
  }

  // --- The Fisher's shallows, packed into rows 9-12 so they sit DIRECTLY behind it on
  // camera (0-2 tiles behind wherever it's standing) instead of off the top of the
  // viewport. Three overlapping ellipses rather than a rectangle, so the waterline is
  // ragged and the bank reads as a real pond edge. All SHALLOW — it is a wading bird and
  // must be able to cross its whole territory, and snakes won't enter deep water.
  pond(subtypes, 11, 6, 2, 5, false);
  pond(subtypes, 11, 18, 2, 5, false);
  pond(subtypes, 10, 12, 2, 4, false);
  // Deeper back water + reeds behind the treeline gap: pure scenery on the victory walk,
  // and it keeps rows 4-8 from reading as an empty field.
  pond(subtypes, 6, 8, 2, 4, true);
  pond(subtypes, 6, 17, 2, 4, true);

  // --- The barrier. Full width, no gaps, ever: the promise of this arena is that the
  // boss is unreachable, and a single gap would turn it back into a melee fight.
  for (let y = SPIKE_MIN_Y; y <= SPIKE_MAX_Y; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      subtypes[y][x] = [TileSubtype.SPIKES];
    }
  }

  // --- Near bank ponds.
  if (layout.ponds === "twin") {
    pond(subtypes, 18, 6, 2, 3, true);
    pond(subtypes, 19, 18, 2, 3, true);
  } else {
    pond(subtypes, 18, 12, 2, 6, true);
    pond(subtypes, 22, 5, 1, 2, false);
  }

  // --- Trees. These are the firing-lane blockers AND the hero's cover: standing behind
  // one drops you out of every lane, which is how you make the Fisher come forward
  // without being spearable while it does. Columns are hand-placed, not random, so the
  // lanes they leave open are a designed set rather than a lottery.
  const nearTrees: Array<[number, number]> = [
    [15, 3], [15, 9], [15, 15], [15, 21],
    [17, 11], [17, 13],
    [20, 2], [20, 22],
    [21, 10], [21, 14],
    [16, 6], [16, 18],
  ];
  for (const [y, x] of nearTrees) {
    if (subtypes[y]?.[x]?.length === 0) tiles[y][x] = TREE;
  }
  // The far treeline: a dense back wall of trees so the Fisher's water reads as a
  // clearing rather than an open field. Two staggered rows, offset so there is no
  // straight sightline through.
  for (let x = 1; x < SIZE - 1; x++) {
    if (subtypes[2]?.[x]?.length === 0 && x % 2 === 1) tiles[2][x] = TREE;
    if (subtypes[3]?.[x]?.length === 0 && x % 2 === 0) tiles[3][x] = TREE;
  }
  // Guarantee the victory walk up to the exit, without gouging a bare-earth channel
  // through the middle of the pond (which is what clearing the column outright looked
  // like). Only what actually blocks a LIT walk gets touched: trees come down, and deep
  // water is shallowed so the hero wades instead of swimming out blind. Shallow water and
  // plain ground are left exactly as they are, so the corridor is invisible.
  for (let y = EXIT_Y; y < SPIKE_MIN_Y; y++) {
    if (tiles[y][EXIT_X] === TREE) tiles[y][EXIT_X] = FLOOR;
    const cell = subtypes[y][EXIT_X];
    if (cell.includes(TileSubtype.DEEP_WATER)) {
      subtypes[y][EXIT_X] = cell.map((s) =>
        s === TileSubtype.DEEP_WATER ? TileSubtype.SHALLOW_WATER : s
      );
    }
  }

  // --- Potion pots around the hero's perimeter. Placed BEFORE the flowers and the rock
  // scatter, both of which skip occupied tiles, so the count is never eaten by a roll.
  //
  // Contents are written straight into the tile as `[POT, MED]` rather than declared in the
  // potOverrides side table. Both force the same result, but the tile-level tag travels
  // WITH the map — a state clone, a room transition or a stale save can't separate a pot
  // from its contents and quietly hand back the food/potion coin flip. Whether these are
  // potions is load-bearing: food does not answer a snake bite.
  for (const [py, px] of POTION_POTS) {
    if (tiles[py]?.[px] !== FLOOR) continue;
    if (subtypes[py][px].length > 0) continue;
    subtypes[py][px] = [TileSubtype.POT, TileSubtype.MED];
  }

  // --- Flowers: the "peaceful and pretty" read, and a quiet trap — FLOWERS is a
  // non-FLOOR tile id, so a flower patch ALSO eats a thrown rock. Kept off the strike
  // columns on purpose; scattered at the back where it can only cost a careless throw.
  const flowerPatch: Array<[number, number]> = [
    [22, 8], [22, 9], [23, 8], [21, 17], [22, 17], [23, 16], [16, 12], [23, 3], [23, 20],
  ];
  for (const [y, x] of flowerPatch) {
    if (tiles[y]?.[x] === FLOOR && subtypes[y][x].length === 0) tiles[y][x] = FLOWERS;
  }

  // --- Rocks: shoreline first (the user's "20 rocks around the pond edges"), then top
  // up anywhere open so the count is reliable regardless of the pond roll.
  const onShore = rocksAroundPonds(tiles, subtypes, FISHER_ROCK_COUNT, rng);
  if (onShore < FISHER_ROCK_COUNT) {
    rocksAnywhere(tiles, subtypes, FISHER_ROCK_COUNT - onShore, rng);
  }

  // --- The exit, behind the Fisher. Useless until the bird falls across the spikes and
  // hands over the key (see collapseFisherIntoBridge). Placed after the corridor carve so
  // it isn't wiped by it.
  tiles[EXIT_Y][EXIT_X] = FLOOR;
  subtypes[EXIT_Y][EXIT_X] = [TileSubtype.EXIT];

  // --- The Fisher. Starts at its fishing row, out of rock range, facing away.
  const fisher = new Enemy({ y: FISH_ROW, x: 12 });
  fisher.kind = "fisher";
  const mem = fisher.behaviorMemory as Record<string, unknown>;
  mem.bankMinY = BANK_MIN_Y;
  mem.bankMaxY = BANK_MAX_Y;
  mem.bankMinX = 1;
  mem.bankMaxX = SIZE - 2;
  mem.heroSideMinY = HERO_SIDE_MIN_Y;
  mem.fishRow = FISH_ROW;

  // --- Snakes on ITS side: the Fisher's ammunition, and the entire reason denying it a
  // spear lane isn't free. Every spot is inside the roam box (rows 9-12) for two reasons:
  // the Fisher can only seize a snake it can physically reach, and a snake outside the
  // camera's view is a threat the player never sees coming.
  //
  // A DOZEN is deliberate. The count is the length of the fight's second pressure and of
  // its whole final phase (see FISHER_PANIC_HP — below half health it stops spearing and
  // empties the bank at you), so a thin stock made both feel like nothing. Spread across
  // all four rows and the full width so it always has some within a stride or two.
  const snakeSpots: Array<[number, number]> = [
    [9, 4], [9, 10], [9, 16], [9, 21],
    [10, 7], [10, 13], [10, 19],
    [11, 3], [11, 9], [11, 17],
    [12, 6], [12, 14],
  ];
  const snakes = snakeSpots
    .filter(([y, x]) => {
      if (tiles[y]?.[x] !== FLOOR) return false;
      if (y < BANK_MIN_Y || y > BANK_MAX_Y) return false;
      // Snakes won't enter deep water; the far shallows are fine to slither.
      return !(subtypes[y][x] ?? []).includes(TileSubtype.DEEP_WATER);
    })
    .map(([y, x]) => {
      const s = new Enemy({ y, x });
      s.kind = "snake";
      return s;
    });

  const [hy, hx] = HERO_START;
  tiles[hy][hx] = FLOOR;
  subtypes[hy][hx] = [TileSubtype.PLAYER];

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.UP,
    enemies: [fisher, ...snakes],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    // Two in hand; the other ~20 are lying on the ground to be gathered. Running the
    // near bank to restock is the fight's second pressure, after the spear.
    rockCount: 2,
    runeCount: 0,
    foodCount: 0,
    potionCount: 1,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "outdoor" },
    recentDeaths: [],
    mode: "normal",
    inBossRoom: true,
  };
}

/**
 * The Fisher's death: it topples forward across the spikes and its body becomes the
 * crossing. Clears the spike band in the column it died in (plus one either side, so
 * the gap is actually walkable) and hands over the exit key — you leave by walking over
 * the boss, which is the only way anyone ever gets to the far bank.
 */
export function collapseFisherIntoBridge(
  state: GameState,
  deathX: number
): void {
  const subs = state.mapData.subtypes;
  const lo = Math.max(1, deathX - 1);
  const hi = Math.min(SIZE - 2, deathX + 1);
  for (let y = SPIKE_MIN_Y; y <= SPIKE_MAX_Y; y++) {
    for (let x = lo; x <= hi; x++) {
      const cell = subs[y]?.[x];
      if (!cell) continue;
      // SINGED is the engine's existing "trampled neutral ground" overlay — reusing it
      // means the bridge renders as scuffed earth without a new asset.
      subs[y][x] = cell.includes(TileSubtype.SPIKES)
        ? [TileSubtype.SINGED]
        : cell;
    }
  }
  state.hasExitKey = true;
}
