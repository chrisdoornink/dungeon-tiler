// PRESCRIBED colour-cipher puzzle rooms — hand-authored, not generated. Four colour switches must
// each be turned to a target colour (the "code"); matching all of them (the `match`-rule ColorLock)
// retracts a spike gate and frees a loose-item reward sealed behind it. Two legend styles say WHAT the
// code is:
//
//  - "torches": a row of CODE_TORCHes above the switches, lit by the hero to reveal each colour. The
//    code sits right on top of the answer, so it is a gentle teaching room.
//  - "mural":   a painted wall mural in a SEPARATE chamber spells the code. You read it, remember it,
//    and walk back to the switches with nothing in view to check against — the difficulty is memory,
//    not the flames. This is the harder, preferred direction.
//
// Assembled from shipped parts (colour switches, the match ColorLock, spike gates) plus the two legend
// tiles (CODE_TORCH / MURAL_PANEL). Authored, so no solver is needed: every layout is solvable by
// construction (all switches reachable and freely cyclable; the reward sits behind the gate the lock
// drives). v1 ships STANDALONE floors for the /test-cipher-room bench; stamping into a real daily-floor
// corner is a later step.
import { FLOOR, WALL, GRID_SIZE, TileSubtype } from "./constants";
import type { ColorLock, MapData } from "./types";

export type CipherReward =
  | { kind: "items"; items: TileSubtype[] } // loose pickups on the floor behind the gate (no key)
  | { kind: "chest" }
  | { kind: "exit" };

export type CipherLegendStyle = "torches" | "mural";

export interface CipherRoomOptions {
  /** Which legend tells the code: an in-room torch row, or a mural in a separate chamber (default). */
  legendStyle?: CipherLegendStyle;
  /** The code: target colour index per switch (0..colors-1). Length sets the switch count (default 4). */
  sequence?: number[];
  /** Colours each switch cycles through (default 4 — the palette maxes at four). */
  colors?: number;
  /** What waits behind the gate. Default: two loose hearts (no chest, no key — the puzzle is the lock). */
  reward?: CipherReward;
  /** Torch style only: torches start lit (code visible). Default false = light-to-reveal. */
  litLegend?: boolean;
}

interface Built {
  mapData: MapData;
  colorLocks: ColorLock[];
}

function blankWalls(n: number): { tiles: number[][]; subtypes: number[][][] } {
  return {
    tiles: Array.from({ length: n }, () => Array.from({ length: n }, () => WALL)),
    subtypes: Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[])),
  };
}

/** Carve a rectangular floor interior, leaving a one-tile wall ring around it. */
function carveRoom(tiles: number[][], top: number, left: number, h: number, w: number): void {
  for (let y = top + 1; y < top + h - 1; y++)
    for (let x = left + 1; x < left + w - 1; x++) tiles[y][x] = FLOOR;
}

function placeReward(subtypes: number[][][], slots: Array<[number, number]>, reward: CipherReward): void {
  if (reward.kind === "items") {
    reward.items.slice(0, slots.length).forEach((it, i) => (subtypes[slots[i][0]][slots[i][1]] = [it]));
  } else if (reward.kind === "chest") {
    const [y, x] = slots[0];
    subtypes[y][x] = [TileSubtype.CHEST];
  } else {
    const [y, x] = slots[0];
    subtypes[y][x] = [TileSubtype.EXITKEY];
  }
}

function normalize(opts: CipherRoomOptions): {
  colors: number;
  sequence: number[];
  reward: CipherReward;
} {
  const colors = Math.max(2, opts.colors ?? 4);
  const sequence = (opts.sequence ?? [0, 2, 3, 1]).map((c) => ((c % colors) + colors) % colors);
  const reward: CipherReward =
    opts.reward ?? { kind: "items", items: [TileSubtype.EXTRA_HEART, TileSubtype.EXTRA_HEART] };
  return { colors, sequence, reward };
}

/** Match lock shared by both styles: every switch OFF its target, so the room opens fully unsolved. */
function buildLock(
  switches: Array<[number, number]>,
  gates: Array<[number, number]>,
  target: number[],
  colors: number,
  extra: Pick<ColorLock, "legend" | "mural">
): ColorLock {
  return {
    id: "cipher_room",
    switches,
    colors,
    states: target.map((t) => (t + 1) % colors),
    rule: "match",
    target: target.slice(),
    platforms: [],
    gates,
    invertedGates: [],
    ...extra,
  };
}

// ---- Torch variant: one vertical room, torches above the switches ---------------------------------
// enter (bottom) -> light the torch row -> set the switch row above it -> cross the opened gate -> reward.
function buildTorchVariant(opts: CipherRoomOptions): Built {
  const { colors, sequence, reward } = normalize(opts);
  const litLegend = opts.litLegend ?? false;
  const { tiles, subtypes } = blankWalls(GRID_SIZE);

  const oy = 2;
  const ox = 2;
  carveRoom(tiles, oy, ox, 10, 7); // interior rows oy+1..oy+8, cols ox+1..ox+5
  const at = (ry: number, rx: number): [number, number] => [oy + ry, ox + rx];

  const cols = [1, 2, 3, 4].slice(0, sequence.length);
  const switches = cols.map((c) => at(4, c));
  const torches = cols.map((c) => at(5, c));

  const gates: Array<[number, number]> = [];
  for (let rx = 1; rx <= 5; rx++) {
    const [gy, gx] = at(2, rx);
    subtypes[gy][gx] = [TileSubtype.SPIKES];
    gates.push([gy, gx]);
  }
  switches.forEach(([y, x]) => (subtypes[y][x] = [TileSubtype.TOGGLE_SWITCH]));
  torches.forEach(([y, x]) => (subtypes[y][x] = [TileSubtype.CODE_TORCH]));
  placeReward(subtypes, [at(1, 2), at(1, 3), at(1, 4), at(1, 1)], reward);
  const [hy, hx] = at(8, 3);
  subtypes[hy][hx] = [TileSubtype.PLAYER];

  const lock = buildLock(switches, gates, sequence, colors, {
    legend: { torches, lit: torches.map(() => litLegend) },
  });
  return { mapData: { tiles, subtypes }, colorLocks: [lock] };
}

// ---- Mural variant: two chambers, the code on a mural you must remember ---------------------------
// Hero starts in the lower MURAL chamber, reads the painted row, then climbs a corridor to the upper
// SWITCH chamber (out of sight of the mural) and sets the switches from memory.
function buildMuralVariant(opts: CipherRoomOptions): Built {
  const { colors, sequence, reward } = normalize(opts);
  const { tiles, subtypes } = blankWalls(GRID_SIZE);

  // Switch chamber (top): rows 2..11, cols 2..8. Interior rows 3..10, cols 3..7.
  carveRoom(tiles, 2, 2, 10, 7);
  // Mural chamber (bottom): rows 14..21, cols 2..8. Interior rows 15..20, cols 3..7.
  carveRoom(tiles, 14, 2, 8, 7);
  // Corridor on col 7 joining the two (switch-room bottom wall -> mural-room top wall).
  for (let y = 11; y <= 14; y++) tiles[y][7] = FLOOR;

  const cols = [3, 4, 5, 6].slice(0, sequence.length);
  const switches: Array<[number, number]> = cols.map((c) => [6, c]);
  // The whole code is one compact engraving on the mural chamber's top WALL (floor below at row 15,
  // so the forced-perspective face is visible) — a single tile, so a real level only needs one wall.
  const muralTile: [number, number] = [14, 5];

  const gates: Array<[number, number]> = [];
  for (let x = 3; x <= 7; x++) {
    subtypes[4][x] = [TileSubtype.SPIKES];
    gates.push([4, x]);
  }
  switches.forEach(([y, x]) => (subtypes[y][x] = [TileSubtype.TOGGLE_SWITCH]));
  subtypes[muralTile[0]][muralTile[1]] = [TileSubtype.MURAL_PANEL];
  placeReward(subtypes, [[3, 4], [3, 5], [3, 6], [3, 3]], reward);
  subtypes[20][5] = [TileSubtype.PLAYER]; // hero starts in the mural chamber, facing the engraving

  const lock = buildLock(switches, gates, sequence, colors, { mural: { tiles: [muralTile] } });
  return { mapData: { tiles, subtypes }, colorLocks: [lock] };
}

/** Build the standalone cipher room as a complete floor (for the bench). */
export function buildCipherRoomFloor(opts: CipherRoomOptions = {}): Built {
  return (opts.legendStyle ?? "mural") === "torches" ? buildTorchVariant(opts) : buildMuralVariant(opts);
}
