// Random multi-element puzzle rooms — the generator the calibration set was building toward.
//
// Every room is a JOURNEY across 2-3 hazard bands to a pair of sealed chambers (key + exit) whose
// gates are a mutual exclusion, with a colour lock gating one crossing and goblins applying
// pressure along the way. Within that spine everything varies: orientation (rooms transpose
// whole), band count and hazards (lava ferries, swimmable water moats), region sizes, rail
// positions, lock rule (agreement vs combination), switch placement (stranded vs pre-settable),
// and trip plan (one-way vs forced round trip).
//
// THE RULESET THE GENERATOR ENCODES (gleaned from the hand-authored calibration rooms — the full
// write-up lives in .claude/features/puzzle-generation/index.md):
//   1. Lava gates the hero; water only costs. Required crossings are lava. Water bands get NO
//      ferry — they exist to pen goblins (who can't swim) and vary the map, not to gate the hero.
//   2. A required ferry needs a full-width lava band thicker than the rock budget (a rock melts
//      one lava tile to obsidian).
//   3. Rails dock on dry land at both ends or boarding needs timing; deck < rail or it can't move.
//   4. A switch is a puzzle only as a TRADE — the chamber pair is opposite-polarity beds.
//   5. Chambers are genuinely sealed: a solid gate row, the beds the only doors.
//   6. Colour locks create order through PLACEMENT: one switch stranded past the previous band
//      forces the crossing order; a near-bank switch rewards pre-setting. <=2 switches per lock
//      keeps certification tractable.
//   7. Softlocks: a satisfied lock stays satisfied while you're away (only the hero turns
//      switches), so toggles NEVER park platforms here — they only swap chambers — and the first
//      crossing always runs.
//   8. Controls live at-or-before what they control; the swap toggle in the final region is a
//      one-way trip, in a middle region a forced round trip.
//   9. Enemies are pressure, not puzzle: certification strips them (combatRng), the hero is armed.
//  10. Rock budget < band thickness (rule 2); a rock is also a remote switch-turn.
//
// CERTIFICATION: a room only ships if (a) the goblin-stripped room is SOLVABLE by the real-engine
// solver, (b) it is NOT solvable with its platforms stripped (the machinery is required), and
// (c) the optimum clears a floor (not trivial). Deterministic: seed -> same room, always.
import type { PuzzleRoomSpec } from "./rooms";
import { parsePuzzleRoom } from "./rooms";
import { mulberry32, stripPlatforms, difficultyTier, type DifficultyTier } from "./generate";
import { solvePuzzleRoom, type Action } from "./solver";

interface Rng {
  (): number;
}

function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick<T>(rng: Rng, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

/** Swap y/x everywhere: the whole room turns on its side, doubling the layout family for free. */
function transposeSpec(spec: PuzzleRoomSpec): PuzzleRoomSpec {
  const h = spec.map.length;
  const w = spec.map[0].length;
  const rows: string[] = [];
  for (let x = 0; x < w; x++) {
    let s = "";
    for (let y = 0; y < h; y++) s += spec.map[y][x];
    rows.push(s);
  }
  const t = ([y, x]: [number, number]): [number, number] => [x, y];
  return {
    ...spec,
    map: rows,
    dryRail: spec.dryRail?.map(t),
    toggles: spec.toggles?.map((g) => ({
      ...g,
      switchAt: t(g.switchAt),
      gates: g.gates?.map(t),
      invertedGates: g.invertedGates?.map(t),
    })),
    colorLocks: spec.colorLocks?.map((l) => ({
      ...l,
      switches: l.switches.map(t),
      gates: l.gates?.map(t),
      invertedGates: l.invertedGates?.map(t),
    })),
  };
}

export interface GeneratedRoomMeta {
  orientation: "vertical" | "horizontal";
  plan: "one-way" | "round-trip";
  crossings: number;
  waterBands: number;
  goblins: number;
  lockRule: "allEqual" | "match";
  /** Count of featured elements (ferries + lock + toggle + goblin pack + water band + rock cache). */
  elements: number;
}

/**
 * Build one room spec from an RNG. Solvable BY CONSTRUCTION (the intended line exists at every
 * decision), but not yet certified — the caller proves it with the solver before shipping it.
 */
function buildSpec(rng: Rng, name: string): { spec: PuzzleRoomSpec; meta: GeneratedRoomMeta } {
  const crossings = rng() < 0.5 ? 2 : 3;
  const interiorW = randInt(rng, 8, 11);
  const W = interiorW + 2;

  // Hazards per band (rule 1): the first band is always lava (the always-running ferry both
  // teaches the mechanic and guarantees entry/return — rule 7). A 3-crossing room may turn one
  // later band into a swimmable water moat.
  const hazards: Array<"lava" | "water"> = ["lava"];
  for (let i = 1; i < crossings; i++) hazards.push("lava");
  if (crossings === 3 && rng() < 0.45) hazards[randInt(rng, 1, 2)] = "water";
  const waterBands = hazards.filter((h) => h === "water").length;

  // The locked crossing: one lava band beyond the first. Its ferry starts parked until the colour
  // lock is satisfied. (Water bands are never locked — nothing to lock, you swim them.)
  const lockableBands: number[] = [];
  for (let i = 1; i < crossings; i++) if (hazards[i] === "lava") lockableBands.push(i);
  const lockedBand = lockableBands.length > 0 ? pick(rng, lockableBands) : -1;

  // Region heights (rows of walkable floor between bands). Region i sits before band i. Kept lean:
  // every extra floor cell multiplies the solver's reachable positions, and certification cost is
  // the binding constraint on room size (see SOLVE_OPTS).
  const heights: number[] = [];
  for (let r = 0; r <= crossings; r++) heights.push(rng() < 0.75 ? 2 : 3);
  const BAND = 2; // thickness; rock budget stays below it (rule 2/10)

  // ---- assemble rows (band-normal space: journey runs downward) ----
  const grid: string[][] = [];
  const wallRow = () => Array(W).fill("#");
  const floorRow = () => {
    const r = Array(W).fill(".");
    r[0] = "#";
    r[W - 1] = "#";
    return r;
  };
  grid.push(wallRow());
  const regionRows: Array<[number, number]> = []; // [firstRow, lastRow] per region
  for (let r = 0; r <= crossings; r++) {
    const first = grid.length;
    for (let i = 0; i < heights[r]; i++) grid.push(floorRow());
    regionRows.push([first, grid.length - 1]);
    if (r < crossings) {
      const ch = hazards[r] === "lava" ? "L" : "~";
      for (let i = 0; i < BAND; i++) {
        const row = floorRow();
        for (let x = 1; x <= interiorW; x++) row[x] = ch;
        grid.push(row);
      }
    }
  }
  // Chamber block (rules 4/5): a solid gate row whose only doors are two opposite-polarity beds,
  // then a chamber row where the ONLY openings are the exit cell and the key cell directly below
  // their beds. Single-cell chambers cannot leak.
  const gateRowY = grid.length;
  grid.push(wallRow());
  const chamberRowY = grid.length;
  grid.push(wallRow());
  grid.push(wallRow());

  const exitCol = randInt(rng, 2, Math.floor(W / 2) - 1);
  const keyCol = randInt(rng, Math.floor(W / 2) + 1, W - 3);
  const exitWest = rng() < 0.5;
  const [eCol, kCol] = exitWest ? [exitCol, keyCol] : [keyCol, exitCol];
  grid[gateRowY][eCol] = "^"; // exit sealed while the toggle is off...
  grid[gateRowY][kCol] = "v"; // ...key open, the mutual exclusion (rule 4)
  grid[chamberRowY][eCol] = "E";
  grid[chamberRowY][kCol] = "k";

  // ---- rails (rule 3): one per lava band, docked on the last row of the region above and the
  // first row of the region below, ping-ponging a 2-long deck over a 4-tile rail ----
  const dryRail: Array<[number, number]> = [];
  const lengths: Record<string, number> = {};
  let prevRailCol = -1;
  const railCols: number[] = [];
  for (let b = 0; b < crossings; b++) {
    if (hazards[b] !== "lava") {
      railCols.push(-1);
      continue;
    }
    let c = randInt(rng, 2, W - 3);
    if (c === prevRailCol) c = c > 2 ? c - 1 : c + 1; // decorrelate successive rails
    prevRailCol = c;
    railCols.push(c);
    const id = String(b + 1);
    const topDock = regionRows[b][1];
    const bottomDock = regionRows[b + 1][0];
    for (let y = topDock; y <= bottomDock; y++) grid[y][c] = id;
    dryRail.push([topDock, c], [bottomDock, c]);
    lengths[id] = 2;
  }

  // ---- entity placement: random free floor cells inside a region ----
  const placeIn = (region: number): [number, number] => {
    const [r0, r1] = regionRows[region];
    for (let tries = 0; tries < 60; tries++) {
      const y = randInt(rng, r0, r1);
      const x = randInt(rng, 1, W - 2);
      if (grid[y][x] === ".") return [y, x];
    }
    throw new Error("no free cell"); // regions are >= 2x9 with a handful of entities; can't happen
  };

  const [hy, hx] = placeIn(0);
  grid[hy][hx] = "H";

  // NO rocks in generated rooms (yet). A single rock multiplies the certification state space by
  // ~20-30x — every throw-at-lava from every reachable position leaves a distinct obsidian world,
  // all of which the sound key must keep apart — and the probe showed those rooms always blow the
  // solver cap and get rejected after a full, wasted search. Rocks return when the solver can
  // afford them; authored rooms still budget them freely.
  const rocks = 0;

  // Colour lock (rule 6): one switch stranded in the region just before the locked band (forces
  // the crossing order), the other either back at the start (pre-settable — the planning reward)
  // or stranded alongside it.
  const lockRule: "allEqual" | "match" = rng() < 0.5 ? "allEqual" : "match";
  const colorLocks: PuzzleRoomSpec["colorLocks"] = [];
  if (lockedBand >= 0) {
    const sFar = placeIn(lockedBand);
    grid[sFar[0]][sFar[1]] = "C";
    const nearRegion = rng() < 0.5 ? 0 : lockedBand;
    const sNear = placeIn(nearRegion);
    grid[sNear[0]][sNear[1]] = "C";
    let initial: number[];
    let target: number[] | undefined;
    if (lockRule === "match") {
      target = [randInt(rng, 0, 3), randInt(rng, 0, 3)];
      do {
        initial = [randInt(rng, 0, 3), randInt(rng, 0, 3)];
      } while (initial[0] === target[0] && initial[1] === target[1]);
    } else {
      initial = [randInt(rng, 0, 3), 0];
      initial[1] = (initial[0] + randInt(rng, 1, 3)) % 4; // guaranteed mismatched at the start
    }
    colorLocks.push({
      switches: [sNear, sFar],
      colors: 4,
      initial,
      rule: lockRule,
      target,
      platforms: [String(lockedBand + 1)],
    });
  }

  // The chamber-swap toggle (rules 4/8): final region = one-way trip; middle region = the round
  // trip, which forces re-crossing everything between it and the chambers. Both are softlock-free
  // (rule 7 — toggles never touch platforms).
  const plan: "one-way" | "round-trip" = rng() < 0.5 ? "one-way" : "round-trip";
  const toggleRegion = plan === "one-way" ? crossings : randInt(rng, 1, crossings - 1);
  const [ty, tx] = placeIn(toggleRegion);
  grid[ty][tx] = "T";

  // Goblins (rule 9): pressure on the islands and the far bank, never in the start region. The
  // hero is always armed to match.
  const goblinCount = randInt(rng, 1, 2);
  for (let i = 0; i < goblinCount; i++) {
    const [gy, gx] = placeIn(randInt(rng, 1, crossings));
    grid[gy][gx] = "g";
  }

  const ferries = railCols.filter((c) => c >= 0).length;
  const meta: GeneratedRoomMeta = {
    orientation: "vertical",
    plan,
    crossings,
    waterBands,
    goblins: goblinCount,
    lockRule,
    elements:
      ferries + (lockedBand >= 0 ? 1 : 0) + 1 /* toggle */ + 1 /* goblins */ + waterBands + rocks,
  };

  let spec: PuzzleRoomSpec = {
    name,
    asks:
      `Generated: ${crossings} crossings (${hazards.join(", ")}), a ${lockRule} colour lock, and a ` +
      `${plan} chamber swap. The key and the exit are sealed behind opposite beds — the toggle ` +
      `trades one for the other${plan === "round-trip" ? ", and it is NOT next to them" : ""}. ` +
      `Water is swimmable; goblins can't swim but they CAN ride the ferries.`,
    map: grid.map((r) => r.join("")),
    trackOver: "lava",
    colorLocks: colorLocks.length > 0 ? colorLocks : undefined,
    toggles: [
      {
        switchAt: [ty, tx],
        gates: [[gateRowY, eCol]],
        invertedGates: [[gateRowY, kCol]],
        on: false,
      },
    ],
    parked: lockedBand >= 0 ? [String(lockedBand + 1)] : undefined,
    dryRail,
    lengths,
    rocks,
    sword: true,
    shield: true,
  };

  // Half the rooms turn on their side (rule 11): the journey runs left-to-right, ferries slide
  // horizontally, chambers sit against the east wall.
  if (rng() < 0.5) {
    spec = transposeSpec(spec);
    meta.orientation = "horizontal";
  }
  return { spec, meta };
}

export interface GeneratedPuzzleRoom {
  /** The playable room, goblins included. */
  spec: PuzzleRoomSpec;
  /** The goblin-stripped variant the solver certified — also drives the intended-line playback. */
  strippedSpec: PuzzleRoomSpec;
  seed: number;
  /** Which build attempt certified (0 = first). Deterministic per seed. */
  attempt: number;
  minTurns: number;
  tier: DifficultyTier;
  solution: Action[];
  meta: GeneratedRoomMeta;
  /** How many states the certifying solve explored — the knob-tuning signal. */
  statesExplored: number;
  /** One line per rejected attempt, for tuning the construction. */
  attemptLog: string[];
}

/** Goblins out: certification must be deterministic, and enemies move under combatRng (rule 9). */
function stripGoblins(spec: PuzzleRoomSpec): PuzzleRoomSpec {
  return { ...spec, map: spec.map.map((r) => r.replace(/g/g, ".")) };
}

// Tuned from the probe: certifying rooms explore ~5-45k states; a capped search is pure wasted
// time before a reject, so the cap sits just above what a legitimate room needs.
const SOLVE_OPTS = { maxStates: 50_000, maxTurns: 220 };
/** Optima below this read as a corridor with props, not a puzzle. */
const MIN_TURNS_FLOOR = 18;

/**
 * Generate a certified room for a seed: built from the ruleset, then PROVEN — the goblin-stripped
 * room solves, the platform-stripped room does not (machinery is required), and the optimum clears
 * the trivial floor. Rooms are solvable by construction, so nearly every attempt certifies; the
 * retry loop exists so a rare degenerate placement costs a rebuild instead of shipping. Fully
 * deterministic: same seed, same room, every time.
 */
export function generateCertifiedRoom(seed: number): GeneratedPuzzleRoom {
  const attemptLog: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const sub = (Math.imul(seed, 2654435761) ^ Math.imul(attempt + 1, 40503)) >>> 0;
    const { spec, meta } = buildSpec(mulberry32(sub), `Generated #${seed}`);
    const stripped = stripGoblins(spec);

    let parsed;
    try {
      parsed = parsePuzzleRoom(stripped);
      parsePuzzleRoom(spec); // the playable variant must be well-formed too
    } catch (e) {
      attemptLog.push(`${attempt}: parse — ${(e as Error).message}`);
      continue; // a placement collision the parser rejects — rebuild
    }

    // The mechanic-required proof runs FIRST because it is the cheap one: with no ferries the hero
    // is confined to the near regions and the reachable space is tiny, so proving "exhaustively
    // unsolvable" costs a fraction of the main solve. Rejecting here skips the expensive check.
    const noPlat = solvePuzzleRoom(parsePuzzleRoom(stripPlatforms(stripped)), SOLVE_OPTS);
    if (noPlat.solvable || noPlat.capped) {
      attemptLog.push(
        `${attempt}: machinery not required (noPlat solvable=${noPlat.solvable} capped=${noPlat.capped})`
      );
      continue;
    }

    const solve = solvePuzzleRoom(parsed, SOLVE_OPTS);
    if (!solve.solvable || solve.minTurns < MIN_TURNS_FLOOR) {
      attemptLog.push(
        `${attempt}: main solve solvable=${solve.solvable} capped=${solve.capped} ` +
          `minTurns=${solve.minTurns} states=${solve.statesExplored}`
      );
      continue;
    }

    return {
      spec,
      strippedSpec: stripped,
      seed,
      attempt,
      minTurns: solve.minTurns,
      tier: difficultyTier(solve.minTurns),
      solution: solve.solution,
      meta,
      statesExplored: solve.statesExplored,
      attemptLog,
    };
  }
  throw new Error(
    `generateCertifiedRoom: no attempt certified for seed ${seed}:\n${attemptLog.join("\n")}`
  );
}
