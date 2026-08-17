// A level-scale COLOUR-SWITCH puzzle, stamped into a normal dungeon floor: N colour switches
// scattered across the floor that must all be turned to the SAME colour to open a gate guarding a
// reward. The *logic* is trivial (make them match); the *difficulty* is executing it — reaching and
// operating every switch while the floor's enemies and hazards fight you. This is the "level-scale
// motif" from the puzzle-generation plan (§0.5): a recognizable pattern, not a certified pocket.
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

  // 1) THE VAULT. Find a wall `gate` with a reachable-floor approach on one side and a carveable
  //    dead-end wall `reward` on the opposite side, with the gate's PERPENDICULAR neighbours both
  //    walls (so the gate is a stub, never a load-bearing corridor tile). Carving F—gate—reward can
  //    then only ADD a dead-end pocket off already-reachable floor — it can sever nothing.
  const vaults: Array<{ gate: [number, number]; reward: [number, number] }> = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (map.tiles[y][x] !== WALL) continue;
      for (const [dy, dx] of [
        [1, 0],
        [0, 1],
      ] as Array<[number, number]>) {
        const side1: [number, number] = [y - dy, x - dx];
        const side2: [number, number] = [y + dy, x + dx];
        const [pdy, pdx] = [dx, dy]; // perpendicular axis
        const perpWall =
          map.tiles[y - pdy]?.[x - pdx] === WALL && map.tiles[y + pdy]?.[x + pdx] === WALL;
        if (!perpWall) continue;
        for (const [F, B] of [
          [side1, side2],
          [side2, side1],
        ] as Array<[[number, number], [number, number]]>) {
          if (!reach.has(`${F[0]},${F[1]}`)) continue; // approach reachable
          if (B[0] < 1 || B[0] >= H - 1 || B[1] < 1 || B[1] >= W - 1) continue;
          if (map.tiles[B[0]][B[1]] !== WALL) continue; // reward tile carveable
          // reward must be a dead-end: its non-gate neighbours are all walls
          const deadEnd = (
            [
              [B[0] - 1, B[1]],
              [B[0] + 1, B[1]],
              [B[0], B[1] - 1],
              [B[0], B[1] + 1],
            ] as Array<[number, number]>
          )
            .filter(([ny, nx]) => !(ny === y && nx === x))
            .every(([ny, nx]) => map.tiles[ny]?.[nx] === WALL);
          if (!deadEnd) continue;
          vaults.push({ gate: [y, x], reward: B });
        }
      }
    }
  }
  if (vaults.length === 0) return null;
  const vault = vaults[ri(rng, 0, vaults.length - 1)];

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

  // 3) STAMP. Carve the vault (gate shut; reward chest), drop the switches.
  map.tiles[vault.gate[0]][vault.gate[1]] = FLOOR;
  map.subtypes[vault.gate[0]][vault.gate[1]] = [TileSubtype.SPIKES]; // gate: up while unsatisfied
  map.tiles[vault.reward[0]][vault.reward[1]] = FLOOR;
  map.subtypes[vault.reward[0]][vault.reward[1]] = [TileSubtype.CHEST, TileSubtype.FOOD];
  for (const [y, x] of chosen) map.subtypes[y][x] = [TileSubtype.TOGGLE_SWITCH];

  // 4) THE LOCK. allEqual over the switches, started at DISTINCT colours (so it begins UNsatisfied —
  //    gate shut — and the player must make them all match). Drives the gate open while satisfied.
  const states = chosen.map((_, i) => i % colors);
  const lock: ColorLock = {
    id: "cl_daily_color",
    switches: chosen,
    colors,
    states,
    rule: "allEqual",
    platforms: [],
    gates: [vault.gate],
    invertedGates: [],
  };
  return [lock];
}
