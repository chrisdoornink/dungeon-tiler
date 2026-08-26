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
import type { Rng } from "../rng";
import { findPlayerPosition } from "./player";

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
  // Staggered rows within a four-row band (all below the gate), so the switches read as a scattered
  // group rather than a rigid row — one per column, left to right.
  const stagger = [6, 8, 7, 9];
  const switches: Array<[number, number]> = cols.map((c, i) => [stagger[i] ?? 6, c]);
  // The engraving spans TWO adjacent wall tiles on the mural chamber's top WALL (each with floor below
  // at row 15, so the forced-perspective face is visible) — the code split across them, two glyphs a
  // tile, so each mark is big enough to read. A real level needs a two-wide wall for it.
  const muralTiles: Array<[number, number]> = [[14, 5], [14, 6]];

  const gates: Array<[number, number]> = [];
  for (let x = 3; x <= 7; x++) {
    subtypes[4][x] = [TileSubtype.SPIKES];
    gates.push([4, x]);
  }
  switches.forEach(([y, x]) => (subtypes[y][x] = [TileSubtype.TOGGLE_SWITCH]));
  muralTiles.forEach(([my, mx]) => (subtypes[my][mx] = [TileSubtype.MURAL_PANEL]));
  placeReward(subtypes, [[3, 4], [3, 5], [3, 6], [3, 3]], reward);
  subtypes[20][5] = [TileSubtype.PLAYER]; // hero starts in the mural chamber, facing the engraving

  const lock = buildLock(switches, gates, sequence, colors, { mural: { tiles: muralTiles } });
  return { mapData: { tiles, subtypes }, colorLocks: [lock] };
}

/** Build the standalone cipher room as a complete floor (for the bench). */
export function buildCipherRoomFloor(opts: CipherRoomOptions = {}): Built {
  return (opts.legendStyle ?? "mural") === "torches" ? buildTorchVariant(opts) : buildMuralVariant(opts);
}

// ==================================================================================================
// stampCipherRoom — distribute a mural cipher puzzle into an ALREADY-GENERATED floor (a real L2/L3),
// rather than carving a self-contained room. Three pieces get placed into the existing geography:
//   - the SWITCHES: four colour switches, one per column, left-to-right, staggered within a ~4-row
//     band (a loose scattered group, not a rigid row);
//   - a GATED REWARD: a spike gate carved into a wall beside a fresh dead-end pocket holding a loose
//     item (the gate the lock drives; sealing only the new pocket, so it can never sever the floor);
//   - the MURAL: a two-wide wall engraving placed 8-14 tiles from the switches (default) so it is
//     offscreen from them — you read it, remember it, and walk back.
// Returns the ColorLock to attach to the GameState, or null if the floor has no room for all three
// (the caller then just skips it). Uses ONLY the passed rng.
// ==================================================================================================

export interface StampCipherOptions {
  sequence?: number[];
  colors?: number;
  reward?: CipherReward;
  /** Tiles to keep clear (e.g. enemy positions). The hero tile is always avoided. */
  avoid?: Array<[number, number]>;
  /** How far the mural sits from the switch centroid (Euclidean tiles). Default 8..14, aiming ~11. */
  muralMinDist?: number;
  muralMaxDist?: number;
}

const ri = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng.next() * (hi - lo + 1));
const euclid = (a: [number, number], b: [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function passable(map: MapData, y: number, x: number): boolean {
  if (map.tiles[y]?.[x] !== FLOOR) return false;
  const s = map.subtypes[y]?.[x] ?? [];
  return (
    !s.includes(TileSubtype.SPIKES) && !s.includes(TileSubtype.LAVA) && !s.includes(TileSubtype.DEEP_WATER)
  );
}

function reachFrom(map: MapData, start: [number, number]): Set<string> {
  const seen = new Set<string>();
  if (!passable(map, start[0], start[1])) return seen;
  seen.add(`${start[0]},${start[1]}`);
  const st: Array<[number, number]> = [start];
  while (st.length) {
    const [y, x] = st.pop() as [number, number];
    for (const [ny, nx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]] as Array<[number, number]>) {
      const k = `${ny},${nx}`;
      if (seen.has(k) || !passable(map, ny, nx)) continue;
      seen.add(k);
      st.push([ny, nx]);
    }
  }
  return seen;
}

function isEmpty(map: MapData, y: number, x: number): boolean {
  if (map.tiles[y]?.[x] !== FLOOR) return false;
  const s = map.subtypes[y]?.[x] ?? [];
  return s.length === 0 || (s.length === 1 && s[0] === TileSubtype.NONE);
}

export function stampCipherRoom(map: MapData, rng: Rng, opts: StampCipherOptions = {}): ColorLock | null {
  const colors = Math.max(3, opts.colors ?? 4);
  const N = 4;
  const sequence = (opts.sequence ?? Array.from({ length: N }, () => ri(rng, 0, colors - 1))).slice(0, N);
  const reward: CipherReward =
    opts.reward ?? { kind: "items", items: [TileSubtype.EXTRA_HEART] };
  const minDist = opts.muralMinDist ?? 13; // keep the mural well offscreen from the switches
  const maxDist = opts.muralMaxDist ?? 40; // effectively "as far as the floor allows"

  const hero = findPlayerPosition(map);
  if (!hero) return null;
  const H = map.tiles.length;
  const Wd = map.tiles[0].length;
  const reach = reachFrom(map, hero);
  const avoid = new Set((opts.avoid ?? []).map(([y, x]) => `${y},${x}`));
  avoid.add(`${hero[0]},${hero[1]}`);

  const free = (y: number, x: number): boolean =>
    reach.has(`${y},${x}`) &&
    isEmpty(map, y, x) &&
    !avoid.has(`${y},${x}`) &&
    Math.abs(y - hero[0]) + Math.abs(x - hero[1]) >= 3;

  // ---- 1) SWITCHES: distinct columns, staggered rows within a ~4-row band, in a compact group ----
  const freeTiles: Array<[number, number]> = [];
  for (const k of reach) {
    const [y, x] = k.split(",").map(Number) as [number, number];
    if (free(y, x)) freeTiles.push([y, x]);
  }
  for (let i = freeTiles.length - 1; i > 0; i--) {
    const j = ri(rng, 0, i);
    [freeTiles[i], freeTiles[j]] = [freeTiles[j], freeTiles[i]];
  }
  let switches: Array<[number, number]> | null = null;
  for (const [ay, ax] of freeTiles) {
    const byCol = new Map<number, Array<[number, number]>>();
    for (const [y, x] of freeTiles) {
      if (x >= ax && x <= ax + 6 && y >= ay - 2 && y <= ay + 2) {
        const list = byCol.get(x) ?? [];
        list.push([y, x]);
        byCol.set(x, list);
      }
    }
    const cols = [...byCol.keys()].sort((a, b) => a - b);
    if (cols.length < N) continue;
    // 4 columns spread across what is available.
    const picked = Array.from({ length: N }, (_, i) => cols[Math.floor((i * (cols.length - 1)) / (N - 1))]);
    if (new Set(picked).size < N) continue;
    const chosen = picked.map((c) => {
      const list = byCol.get(c) as Array<[number, number]>;
      return list[ri(rng, 0, list.length - 1)];
    });
    const rows = chosen.map(([y]) => y);
    if (Math.max(...rows) - Math.min(...rows) > 4) continue; // stagger stays within ~4 rows
    chosen.sort((a, b) => a[1] - b[1]); // left-to-right
    switches = chosen;
    break;
  }
  if (!switches) return null;
  // TRANSACTIONAL: everything below only COMPUTES placements and returns null on failure. Not one
  // tile of the map is written until switches, gate AND mural are all guaranteed (the commit block
  // at the end). This is load-bearing: an earlier version stamped the switches here, then could
  // `return null` at the gate/mural steps — leaving orphaned TOGGLE_SWITCH tiles with no lock (they
  // render as an inert blue lamp), and in the reward:"exit" case a spike gate sealing the relocated
  // key with no switch able to open it (a soft-lock). The caller falls back to the all-same puzzle on
  // a null return, and that fallback must inherit a CLEAN map. Placement order is unchanged, so the
  // only rng draw here (the mural pick) still fires last — success-path output is byte-identical.
  const usedFloor = new Set(switches.map(([y, x]) => `${y},${x}`));
  const centroid: [number, number] = [
    switches.reduce((s, [y]) => s + y, 0) / N,
    switches.reduce((s, [, x]) => s + x, 0) / N,
  ];

  // ---- 2) GATE + REWARD POCKET, carved beside a wall nearest the switches (compute; carve at commit) ----
  const inB = (y: number, x: number) => y >= 1 && y < H - 1 && x >= 1 && x < Wd - 1;
  // A wall we may open. Skip walls wearing a WALL_SEAL crack: carving one would drop the crack tile
  // but leave its sealPayloads entry orphaned (the seal-count invariant would break).
  const carveable = (y: number, x: number) =>
    inB(y, x) && map.tiles[y][x] === WALL && !(map.subtypes[y]?.[x] ?? []).includes(TileSubtype.WALL_SEAL);
  const solid = (y: number, x: number) => map.tiles[y]?.[x] !== FLOOR;
  type Base = { gate: [number, number]; pocket: [number, number] };
  const bases: Base[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < Wd - 1; x++) {
      if (!carveable(y, x)) continue;
      for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
        const ay = y - dy, ax = x - dx; // approach
        const py = y + dy, px = x + dx; // pocket
        if (!reach.has(`${ay},${ax}`) || avoid.has(`${ay},${ax}`) || usedFloor.has(`${ay},${ax}`)) continue;
        if (!carveable(py, px)) continue;
        if (!solid(py + dy, px + dx)) continue; // dead-end back wall
        if (!solid(py - dx, px - dy) || !solid(py + dx, px + dy)) continue; // walled sides
        bases.push({ gate: [y, x], pocket: [py, px] });
      }
    }
  if (bases.length === 0) return null; // nothing written yet — safe to bail
  bases.sort((a, b) => euclid(a.gate, centroid) - euclid(b.gate, centroid));
  const base = bases[0];

  // ---- 3) MURAL: two adjacent wall tiles with floor below, 8-14 tiles from the switches (compute; paint at commit) ----
  const muralCands: Array<{ tiles: [[number, number], [number, number]]; d: number }> = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < Wd - 2; x++) {
      if (map.tiles[y][x] !== WALL || map.tiles[y][x + 1] !== WALL) continue;
      // Don't paint the mural over a decoy crack — it would overwrite the WALL_SEAL and orphan its
      // sealPayloads entry.
      if ((map.subtypes[y][x] ?? []).includes(TileSubtype.WALL_SEAL)) continue;
      if ((map.subtypes[y][x + 1] ?? []).includes(TileSubtype.WALL_SEAL)) continue;
      if (map.tiles[y + 1][x] !== FLOOR || map.tiles[y + 1][x + 1] !== FLOOR) continue;
      const f1 = `${y + 1},${x}`, f2 = `${y + 1},${x + 1}`;
      if (!reach.has(f1) || !reach.has(f2) || usedFloor.has(f1) || usedFloor.has(f2)) continue;
      const d = euclid([y + 1, x], centroid);
      if (d < minDist || d > maxDist) continue;
      muralCands.push({ tiles: [[y, x], [y, x + 1]], d });
    }
  if (muralCands.length === 0) return null; // still nothing written — safe to bail
  muralCands.sort((a, b) => b.d - a.d); // farthest first — prefer the mural as far offscreen as possible
  const pick = muralCands[ri(rng, 0, Math.min(muralCands.length - 1, 4))]; // one of the farthest few

  // ---- COMMIT: switches, gate and mural are all guaranteed, so write the map now (and only now). ----
  // Stamp the switches onto the MAP — the lock alone only wires the mechanic; without this the tiles
  // render as plain floor and the puzzle is invisible (you see the mural but nothing to solve).
  for (const [y, x] of switches) map.subtypes[y][x] = [TileSubtype.TOGGLE_SWITCH];
  map.tiles[base.gate[0]][base.gate[1]] = FLOOR;
  map.subtypes[base.gate[0]][base.gate[1]] = [TileSubtype.SPIKES];
  map.tiles[base.pocket[0]][base.pocket[1]] = FLOOR;
  if (reward.kind === "items" && reward.items.length) {
    map.subtypes[base.pocket[0]][base.pocket[1]] = [reward.items[0]];
  } else if (reward.kind === "chest") {
    map.subtypes[base.pocket[0]][base.pocket[1]] = [TileSubtype.CHEST];
  } else {
    // exit: RELOCATE the floor's existing exit key behind the gate (mandatory — never a second key).
    // Solving the puzzle is now the only way to reach it, so the floor can't be left without it.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < Wd; x++)
        if (map.subtypes[y][x].includes(TileSubtype.EXITKEY))
          map.subtypes[y][x] = map.subtypes[y][x].filter((s) => s !== TileSubtype.EXITKEY);
    map.subtypes[base.pocket[0]][base.pocket[1]] = [TileSubtype.EXITKEY];
  }
  const gates: Array<[number, number]> = [base.gate];
  map.subtypes[pick.tiles[0][0]][pick.tiles[0][1]] = [TileSubtype.MURAL_PANEL];
  map.subtypes[pick.tiles[1][0]][pick.tiles[1][1]] = [TileSubtype.MURAL_PANEL];

  // ---- 4) LOCK (match rule; every switch OFF target so it opens unsolved) ----
  return {
    id: "cipher_room",
    switches,
    colors,
    states: sequence.map((t) => (t + 1) % colors),
    rule: "match",
    target: sequence.slice(),
    platforms: [],
    gates,
    invertedGates: [],
    mural: { tiles: [pick.tiles[0], pick.tiles[1]] },
  };
}
