// Procedural puzzle generation — phase 2: one idiom, the lava Ferry, built from a known solution.
//
// THE METHOD (build backward from a known solution): we do not scatter hazards and hope. We lay out
// a room whose intended solve — board the raft, ride across the lava, step off, reach the exit — is
// SOLVABLE BY CONSTRUCTION, then hand it to the real-engine solver to CONFIRM it and NUMBER it. The
// solver is the oracle; the generator never has to reason about reachability itself.
//
// WHY LAVA, NOT WATER: phase 1 established that water is swimmable, so a raft over water is only ever
// a decorative alternative — the "mechanic required" check would reject it. Lava kills, so a raft
// across a full-width lava band is the ONLY crossing, which is exactly what makes the platform
// mandatory. See .claude/features/puzzle-generation/index.md.
import type { PuzzleRoomSpec } from "./rooms";
import { parsePuzzleRoom } from "./rooms";
import { solvePuzzleRoom, type SolveResult } from "./solver";

/**
 * A tiny self-contained seeded PRNG (mulberry32). Deterministic: the same seed always yields the
 * same room, which is what lets a generated daily be replayed and a generated bench be shared.
 * Kept local rather than touching lib/rng.ts (whose sequence the daily seeds depend on).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate one lava Ferry room from a seed.
 *
 * The layout is a parametric version of the hand-authored "The Ferry": a full-width lava band, a
 * single vertical rail crossing it with a dry dock flush on each bank, the hero and the exit key on
 * the near bank, and the exit on the far bank. Every dimension the seed varies (room width, band
 * thickness, rail column, and the hero/key/exit positions) preserves the intended solve, so the room
 * is always solvable — which the caller then verifies rather than trusts. Emitted as a normal
 * PuzzleRoomSpec so it flows through the exact same parse -> render -> solve pipeline as the authored
 * rooms.
 */
export function generateFerryRoom(seed: number): PuzzleRoomSpec {
  const rng = mulberry32(seed);
  // Inclusive integer in [lo, hi].
  const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];

  const wInterior = randInt(7, 12); // playable columns between the side walls
  const thickness = randInt(2, 4); // lava band height
  const platformLen = 2; // a two-tile deck reads as a vehicle, and is always < the rail length below

  // Row layout (full map, walls included): wall, near bank, near dock, [thickness lava], far dock,
  // far bank, wall.
  const H = 6 + thickness;
  const W = wInterior + 2;
  const nearBankRow = 1;
  const nearDockRow = 2;
  const bandTop = 3;
  const bandBottom = 2 + thickness;
  const farDockRow = 3 + thickness;
  const farBankRow = 4 + thickness;

  const trackCol = randInt(1, wInterior); // the rail's column, 1-indexed into the interior

  // Start every interior row as floor with side walls; top and bottom rows are solid wall.
  const rows: string[][] = [];
  for (let y = 0; y < H; y++) {
    if (y === 0 || y === H - 1) {
      rows.push(Array(W).fill("#"));
      continue;
    }
    const row: string[] = Array(W).fill(".");
    row[0] = "#";
    row[W - 1] = "#";
    rows.push(row);
  }

  // Fill the lava band across the whole interior...
  for (let y = bandTop; y <= bandBottom; y++) {
    for (let x = 1; x <= wInterior; x++) rows[y][x] = "L";
  }
  // ...then carve the rail column through it, from the near dock down to the far dock. The two dock
  // tiles sit on dry ground (see dryRail below) so the deck rests flush at each end.
  for (let y = nearDockRow; y <= farDockRow; y++) rows[y][trackCol] = "1";

  // Hero + exit key on the near bank (the crossing gates the exit, not the key). The near-bank row
  // is above the near dock, so it carries no rail — any interior column is free real estate.
  const interiorCols = Array.from({ length: wInterior }, (_, i) => i + 1);
  const heroCol = pick(interiorCols);
  const keyCol = pick(interiorCols.filter((c) => c !== heroCol));
  rows[nearBankRow][heroCol] = "H";
  rows[nearBankRow][keyCol] = "k";
  // Exit on the far bank (also below the rail's end, so any column is free).
  rows[farBankRow][pick(interiorCols)] = "E";

  return {
    name: `Generated Ferry (seed ${seed})`,
    asks: "Generated lava ferry: grab the key, then ride the slab across — foot-crossing is death.",
    map: rows.map((r) => r.join("")),
    trackOver: "lava",
    dryRail: [
      [nearDockRow, trackCol],
      [farDockRow, trackCol],
    ],
    lengths: { "1": platformLen },
  };
}

/**
 * Return the room with its platforms removed — every rail tile reverts to what it sits on (the
 * hazard, or dry floor at a dock). This is the "ignore the mechanic" room: if it is UNSOLVABLE, the
 * platform was genuinely required, which is what separates a puzzle from a corridor.
 */
export function stripPlatforms(spec: PuzzleRoomSpec): PuzzleRoomSpec {
  const hazard = spec.trackOver === "lava" ? "L" : "~";
  const dry = new Set((spec.dryRail ?? []).map(([y, x]) => `${y},${x}`));
  const map = spec.map.map((row, y) =>
    row
      .split("")
      .map((ch, x) => (/[1-9]/.test(ch) ? (dry.has(`${y},${x}`) ? "." : hazard) : ch))
      .join("")
  );
  return { ...spec, map, dryRail: undefined, lengths: undefined, parked: undefined };
}

export type DifficultyTier = "gentle" | "tricky" | "fiendish";

/** Bucket the solver's fewest-turn count into a coarse, human-facing tier. */
export function difficultyTier(minTurns: number): DifficultyTier {
  if (minTurns <= 14) return "gentle";
  if (minTurns <= 25) return "tricky";
  return "fiendish";
}

export interface GeneratedRoom {
  spec: PuzzleRoomSpec;
  seed: number;
  minTurns: number;
  tier: DifficultyTier;
  /** The intended mechanic is genuinely required: the platform-stripped room is unsolvable. */
  mechanicRequired: boolean;
  solve: SolveResult;
}

/**
 * Generate a Ferry room for a seed and have the solver certify it: solvable (not merely unproven),
 * numbered by fewest turns, and a real puzzle (unsolvable without the platform). Returns null if the
 * seed somehow produced a room that fails certification — by construction it should not, so a null
 * is a generator bug worth surfacing, not something to paper over.
 */
export function generateVerifiedFerry(seed: number): GeneratedRoom | null {
  const spec = generateFerryRoom(seed);
  const solve = solvePuzzleRoom(parsePuzzleRoom(spec));
  if (!solve.solvable) return null; // capped or genuinely unsolvable — should never happen here

  const stripped = solvePuzzleRoom(parsePuzzleRoom(stripPlatforms(spec)));
  const mechanicRequired = !stripped.solvable && !stripped.capped;
  if (!mechanicRequired) return null; // a lava ferry the hero can beat without the raft is a bug

  return {
    spec,
    seed,
    minTurns: solve.minTurns,
    tier: difficultyTier(solve.minTurns),
    mechanicRequired,
    solve,
  };
}
