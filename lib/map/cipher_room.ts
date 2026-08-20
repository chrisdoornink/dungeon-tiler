// A PRESCRIBED colour-cipher puzzle room — hand-authored, not generated. Four colour switches in a
// row must each be turned to a specific target colour (the "code"); matching all of them retracts a
// spike gate and frees a loose-item reward sealed behind it. The code is spelled out by a row of
// CODE_TORCHes: one sconce per switch that shows that switch's target colour ONCE LIT, so the puzzle
// asks you to first light the torches (walk the row) and then read the flames.
//
// This is the assembled form of shipped parts — colour switches (TOGGLE_SWITCH), the `match`-rule
// ColorLock, and spike gates all already exist and are wired into movement/render — plus the one new
// piece, the CODE_TORCH legend. Because it is authored (not generated) it needs no solver/verifier:
// the layout is fixed and solvable by construction (every switch is reachable and freely cyclable, so
// the target is always achievable; the reward sits behind the gate the lock drives).
//
// v1 ships a STANDALONE room (buildCipherRoomFloor) for the /test-cipher-room bench. Stamping it into
// a real daily floor's corner is a later step and gets its own function.
import { FLOOR, WALL, GRID_SIZE, TileSubtype } from "./constants";
import type { ColorLock, MapData } from "./types";

export type CipherReward =
  | { kind: "items"; items: TileSubtype[] } // loose pickups on the floor behind the gate (no key)
  | { kind: "chest" }
  | { kind: "exit" };

export interface CipherRoomOptions {
  /** The code: target colour index per switch (0..colors-1). Length sets the switch count (default 4). */
  sequence?: number[];
  /** Colours each switch cycles through (default 4 — the palette maxes at four). */
  colors?: number;
  /** What waits behind the gate. Default: two loose hearts (no chest, no key — the puzzle is the lock). */
  reward?: CipherReward;
  /** Torches start lit (code visible immediately). Default false = light-to-reveal. */
  litLegend?: boolean;
}

// Room geometry, expressed relative to the room's top-left wall corner. A 5-wide x 8-tall floor
// interior inside a 7x10 wall ring. Vertical so the flow reads bottom-to-top: enter -> light the
// torch row -> set the switch row above it -> cross the opened gate -> take the reward. Column c pairs
// torch (TORCH_ROW,c) with the switch (SWITCH_ROW,c) right above it. The room is embedded in a full
// GRID_SIZE map (rest solid wall) so the renderer, which assumes standard map dimensions, is happy —
// and so this same relative layout can later be stamped into a real floor at any origin.
const ROOM_W = 7;
const ROOM_H = 10;
const REWARD_ROW = 1;
const GATE_ROW = 2;
const SWITCH_ROW = 4;
const TORCH_ROW = 5;
const SWITCH_COLS = [1, 2, 3, 4];
const HERO = [8, 3] as const;

/** Build the standalone cipher room as a complete floor (for the bench). */
export function buildCipherRoomFloor(opts: CipherRoomOptions = {}): {
  mapData: MapData;
  colorLocks: ColorLock[];
} {
  const colors = Math.max(2, opts.colors ?? 4);
  const sequence = (opts.sequence ?? [0, 2, 3, 1]).map((c) => ((c % colors) + colors) % colors);
  const reward: CipherReward =
    opts.reward ?? { kind: "items", items: [TileSubtype.EXTRA_HEART, TileSubtype.EXTRA_HEART] };
  const litLegend = opts.litLegend ?? false;

  // Full-size map, solid wall, with the room carved near the top-left.
  const N = GRID_SIZE;
  const oy = 2; // room origin row (top wall)
  const ox = 2; // room origin col (left wall)
  const tiles: number[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => WALL));
  const subtypes: number[][][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => [] as number[])
  );
  // Carve the room's floor interior (leave the room's own wall ring solid).
  for (let ry = 1; ry <= ROOM_H - 2; ry++)
    for (let rx = 1; rx <= ROOM_W - 2; rx++) tiles[oy + ry][ox + rx] = FLOOR;

  const at = (ry: number, rx: number): [number, number] => [oy + ry, ox + rx];

  // Switches and their target only span as many columns as the sequence provides.
  const cols = SWITCH_COLS.slice(0, sequence.length);
  const switches: Array<[number, number]> = cols.map((c) => at(SWITCH_ROW, c));
  const torches: Array<[number, number]> = cols.map((c) => at(TORCH_ROW, c));

  // Gate: spikes across the full interior width so there is no way around — the puzzle is the only key.
  const gates: Array<[number, number]> = [];
  for (let rx = 1; rx <= ROOM_W - 2; rx++) {
    const [gy, gx] = at(GATE_ROW, rx);
    subtypes[gy][gx] = [TileSubtype.SPIKES];
    gates.push([gy, gx]);
  }

  switches.forEach(([y, x]) => (subtypes[y][x] = [TileSubtype.TOGGLE_SWITCH]));
  torches.forEach(([y, x]) => (subtypes[y][x] = [TileSubtype.CODE_TORCH]));

  // Reward behind the gate.
  if (reward.kind === "items") {
    const slots: Array<[number, number]> = [at(REWARD_ROW, 2), at(REWARD_ROW, 3), at(REWARD_ROW, 4), at(REWARD_ROW, 1)];
    reward.items.slice(0, slots.length).forEach((it, i) => (subtypes[slots[i][0]][slots[i][1]] = [it]));
  } else if (reward.kind === "chest") {
    const [cy, cx] = at(REWARD_ROW, 3);
    subtypes[cy][cx] = [TileSubtype.CHEST];
  } else {
    // exit: the key sits behind the gate (mandatory).
    const [ky, kx] = at(REWARD_ROW, 3);
    subtypes[ky][kx] = [TileSubtype.EXITKEY];
  }

  const [hy, hx] = at(HERO[0], HERO[1]);
  subtypes[hy][hx] = [TileSubtype.PLAYER];

  // The lock: match rule (each switch must equal its target). Start every switch OFF its target so the
  // room opens fully unsolved and the player must set all of them.
  const target = sequence.slice();
  const states = target.map((t) => (t + 1) % colors);
  const lock: ColorLock = {
    id: "cipher_room",
    switches,
    colors,
    states,
    rule: "match",
    target,
    platforms: [],
    gates,
    invertedGates: [],
    legend: { torches, lit: torches.map(() => litLegend) },
  };

  return { mapData: { tiles, subtypes }, colorLocks: [lock] };
}
