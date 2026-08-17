// A level-scale COLOUR-SWITCH puzzle, stamped into a normal dungeon floor: N colour switches
// scattered across the floor that must all be turned to the SAME colour to open a gate that seals
// the floor's EXIT KEY. The *logic* is trivial (make them match); the *difficulty* is executing it —
// reaching and operating every switch while the floor's enemies and hazards fight you. Gating the
// key (rather than an optional chest) makes the puzzle mandatory: you cannot leave the floor until
// it is solved. This is the "level-scale motif" from the plan (§0.5): a pattern, not a certified
// pocket.
//
// It stays winnable by construction: the switches only drive the one gate (never each other or any
// other door), and each is independently reachable (verified) and freely cyclable, so all-same is
// always achievable — the key is therefore always obtainable once the puzzle is placed.
//
// SAFETY / DETERMINISM CONTRACT (this is why it can go into the live daily without breaking /stats):
//  - It takes its OWN seeded `rng` and NEVER touches Math.random, so it consumes nothing from the
//    daily's shared RNG stream. Called LAST in the floor build, it therefore leaves enemy placement,
//    chest contents, boss selection, etc. byte-identical whether or not it runs — so /stats, which
//    reconstructs past days by re-running the shared stream, stays correct for every date.
//  - It only ever CARVES INTO WALLS (the gate + the reward pocket are a dead-end stub) and drops
//    switches on empty floor, so it can never sever the floor's own path to the key/exit.
//  - If it can't find a safe spot, it returns null and stamps nothing — that day simply has no
//    puzzle. Never throws, never ships a broken floor.
import { FLOOR, WALL, TileSubtype } from "./constants";
import type { ColorLock, MapData } from "./types";
import { findPlayerPosition } from "./player";
import type { Rng } from "../rng";

const ri = (rng: Rng, lo: number, hi: number): number =>
  lo + Math.floor(rng.next() * (hi - lo + 1));

/** A tile the hero can stand on: floor that isn't raised spikes or lava (deep water is wadeable). */
function walkable(map: MapData, y: number, x: number): boolean {
  if (map.tiles[y]?.[x] !== FLOOR) return false;
  const sub = map.subtypes[y]?.[x] ?? [];
  return !sub.includes(TileSubtype.SPIKES) && !sub.includes(TileSubtype.LAVA);
}

/** Floor tiles the hero can reach from `start`. */
function floodReachable(map: MapData, start: [number, number]): Set<string> {
  const seen = new Set<string>();
  if (!walkable(map, start[0], start[1])) return seen;
  seen.add(`${start[0]},${start[1]}`);
  const stack: Array<[number, number]> = [start];
  while (stack.length) {
    const [y, x] = stack.pop() as [number, number];
    for (const [ny, nx] of [
      [y - 1, x],
      [y + 1, x],
      [y, x - 1],
      [y, x + 1],
    ] as Array<[number, number]>) {
      const k = `${ny},${nx}`;
      if (seen.has(k) || !walkable(map, ny, nx)) continue;
      seen.add(k);
      stack.push([ny, nx]);
    }
  }
  return seen;
}

/** Floor with no meaningful subtype — safe to drop a switch on. */
function isEmptyFloor(map: MapData, y: number, x: number): boolean {
  if (map.tiles[y]?.[x] !== FLOOR) return false;
  const sub = map.subtypes[y]?.[x] ?? [];
  return sub.length === 0 || (sub.length === 1 && sub[0] === TileSubtype.NONE);
}

export interface ColorPuzzleOptions {
  /** How many colour switches (default 4). */
  switches?: number;
  /** How many colours each cycles through (default 4; MUST be >= 3 so the renderer shows the palette). */
  colors?: number;
  /** Tiles to avoid when placing switches (e.g. enemy positions). */
  avoid?: Array<[number, number]>;
}

/**
 * Stamp the puzzle onto `map` in place and return the ColorLock(s) to attach to the GameState, or
 * null if no safe placement exists (then nothing is stamped). Uses ONLY `rng`, never Math.random.
 */
export function stampColorSwitchLock(
  map: MapData,
  rng: Rng,
  opts: ColorPuzzleOptions = {}
): ColorLock[] | null {
  const nSwitches = opts.switches ?? 4;
  const colors = opts.colors ?? 4;
  if (colors < 3) return null; // a 2-colour switch renders as a plain toggle, not a colour
  const hero = findPlayerPosition(map);
  if (!hero) return null;
  const H = map.tiles.length;
  const W = map.tiles[0].length;
  const reach = floodReachable(map, hero);
  const avoid = new Set((opts.avoid ?? []).map(([y, x]) => `${y},${x}`));

  // The puzzle gates the EXIT KEY — find it so it can be moved behind the gate. No key => nothing to
  // gate, so decline (floor 2 always has one, so this is just a guard).
  let exitKeyAt: [number, number] | null = null;
  for (let y = 0; y < H && !exitKeyAt; y++)
    for (let x = 0; x < W; x++)
      if ((map.subtypes[y]?.[x] ?? []).includes(TileSubtype.EXITKEY)) {
        exitKeyAt = [y, x];
        break;
      }
  if (!exitKeyAt) return null;

  // 1) THE VAULT. First a single-tile crossing: approach (reachable floor) -> gate (a carveable wall)
  //    -> a sealed dead-end pocket (carved from wall) that will hold the exit key. Then the gate is
  //    WIDENED 1-3 tiles along its run into adjacent wall tiles, each a spike with floor in front and
  //    wall behind (a shallow niche), so the barrier reads as a 1-3 wide band without needing a rare
  //    wide pocket. Everything carved is a solid interior wall becoming a dead-end off already-
  //    reachable floor, so nothing is ever severed and the key stays reachable only across the gate.
  const inB = (y: number, x: number) => y >= 1 && y < H - 1 && x >= 1 && x < W - 1;
  const carve = (y: number, x: number) => inB(y, x) && map.tiles[y][x] === WALL; // interior wall we can open
  const solid = (y: number, x: number) => map.tiles[y]?.[x] !== FLOOR; // wall or off-map
  type Base = {
    gate: [number, number];
    pocket: [number, number];
    through: [number, number];
    perp: [number, number];
  };
  const bases: Base[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!carve(y, x)) continue;
      for (const [dy, dx] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as Array<[number, number]>) {
        const [pdy, pdx] = [dx, dy]; // gate-run direction (perpendicular to through)
        const ay = y - dy, ax = x - dx; // approach (front)
        const py = y + dy, px = x + dx; // pocket (back)
        if (!reach.has(`${ay},${ax}`) || !carve(py, px)) continue; // reachable front + carveable pocket
        if (!solid(py + dy, px + dx)) continue; // pocket has a back wall
        if (!solid(py - pdy, px - pdx) || !solid(py + pdy, px + pdx)) continue; // pocket ends walled
        if (!solid(y - pdy, x - pdx) || !solid(y + pdy, x + pdx)) continue; // gate starts as a clean stub
        bases.push({ gate: [y, x], pocket: [py, px], through: [dy, dx], perp: [pdy, pdx] });
      }
    }
  }
  if (bases.length === 0) return null;
  const base = bases[ri(rng, 0, bases.length - 1)];
  const [tdy, tdx] = base.through;
  const [ppdy, ppdx] = base.perp;
  const targetW = ri(rng, 1, 3);
  const gateTiles: Array<[number, number]> = [base.gate];
  for (const dir of [1, -1]) {
    let step = 1;
    while (gateTiles.length < targetW) {
      const gy = base.gate[0] + dir * step * ppdy;
      const gx = base.gate[1] + dir * step * ppdx;
      // a decorative extension tile: carveable wall, reachable floor in front, wall behind (a niche).
      if (!carve(gy, gx) || !reach.has(`${gy - tdy},${gx - tdx}`) || !solid(gy + tdy, gx + tdx)) break;
      gateTiles.push([gy, gx]);
      step++;
    }
    if (gateTiles.length >= targetW) break;
  }
  const vault = { gates: gateTiles, pocket: [base.pocket] as Array<[number, number]> };

  // 2) THE SWITCHES. Reachable empty floor, off the hero's tile, spread out, avoiding `avoid`.
  const cands: Array<[number, number]> = [];
  for (const k of reach) {
    const [y, x] = k.split(",").map(Number) as [number, number];
    if (!isEmptyFloor(map, y, x) || avoid.has(k)) continue;
    if (Math.abs(y - hero[0]) + Math.abs(x - hero[1]) < 3) continue;
    cands.push([y, x]);
  }
  for (let i = cands.length - 1; i > 0; i--) {
    const j = ri(rng, 0, i);
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  const MIN_D = 4;
  const chosen: Array<[number, number]> = [];
  for (const c of cands) {
    if (chosen.length >= nSwitches) break;
    if (chosen.every((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) >= MIN_D)) chosen.push(c);
  }
  if (chosen.length < nSwitches) return null; // couldn't place enough — skip the puzzle this floor

  // 3) STAMP. Carve the gate run (all shut) + the dead-end pocket, MOVE the exit key into the pocket
  //    (so the floor now requires solving the puzzle to escape), drop the switches.
  for (const [gy, gx] of vault.gates) {
    map.tiles[gy][gx] = FLOOR;
    map.subtypes[gy][gx] = [TileSubtype.SPIKES]; // gate up while unsatisfied
  }
  for (const [py, px] of vault.pocket) {
    map.tiles[py][px] = FLOOR;
    map.subtypes[py][px] = [];
  }
  map.subtypes[exitKeyAt[0]][exitKeyAt[1]] = (map.subtypes[exitKeyAt[0]][exitKeyAt[1]] ?? []).filter(
    (s) => s !== TileSubtype.EXITKEY
  );
  const keyTile = vault.pocket[Math.floor(vault.pocket.length / 2)];
  map.subtypes[keyTile[0]][keyTile[1]] = [TileSubtype.EXITKEY];
  for (const [y, x] of chosen) map.subtypes[y][x] = [TileSubtype.TOGGLE_SWITCH];

  // 4) THE LOCK. allEqual over the switches, started at DISTINCT colours (so it begins UNsatisfied —
  //    the whole gate run shut — and the player must make them all match). Opens every gate tile at
  //    once while satisfied.
  const states = chosen.map((_, i) => i % colors);
  const lock: ColorLock = {
    id: "cl_daily_color",
    switches: chosen,
    colors,
    states,
    rule: "allEqual",
    platforms: [],
    gates: vault.gates,
    invertedGates: [],
  };
  return [lock];
}
