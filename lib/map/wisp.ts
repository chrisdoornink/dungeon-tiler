/**
 * Wisps: little glowing lights that can be coaxed out of the dungeon, caught, and
 * carried as a silent companion that trails the hero's footsteps. A carried wisp is a
 * life: when the hero would die, one wisp spends itself — it whirls around the body,
 * restores WISP_RESTORE_HEARTS hearts, and tugs the hero back onto the tile it was
 * hovering over (which is always a tile the hero recently stood on, so a lava or
 * spike death doesn't just re-kill them on the spot).
 *
 * PROTOTYPE STATUS: nothing spawns wisps outside /test-wisp. Every spawn source is
 * gated on GameState.wispConfig, which only the test room sets. See
 * .claude/features/wisp-life-regen/index.md for the brainstorm this is exploring.
 *
 * The core loop being tested:
 *
 *  - WILD wisps appear from a spawn source (smashed pot, a defeated enemy's spark,
 *    or "pity" — one senses a hero at their last heart). They drift one tile per
 *    hero step, floating 8-directionally over any floor tile, and gutter out after
 *    `lifespan` steps — flashing for the last WISP_FLASH_MOVES so you know the
 *    window is closing.
 *  - Wisps are SHY OF FIRE. While the hero's torch is lit they wander aimlessly and
 *    usually bolt when you get adjacent, though they sometimes hesitate or flutter
 *    another way. Douse your torch
 *    and they invert: drawn to the dark hero, drifting closer each step until one
 *    settles on you and is caught. (Snakes also hunt you in the dark. That's the
 *    trade.)
 *  - Catching = sharing a tile, from either side. Carried wisps cap at
 *    WISP_MAX_COMPANIONS.
 *
 * Like rewind.ts, this module takes GameState as a TYPE-only import so
 * game-state.ts -> wisp.ts stays a one-way edge with no runtime cycle.
 */

import { TileSubtype } from "./constants";
import { findPlayerPosition } from "./player";
import type { GameState } from "./game-state";

/**
 * Hearts a spent wisp restores (clamped to heroMaxHealth). 5 = a full heal for a
 * base-health hero: three sometimes wasn't enough to survive the very next turn
 * depending on what was killing you, and a rarer thing deserves a bigger reward.
 */
export const WISP_RESTORE_HEARTS = 5;
/** Hero steps a wild wisp survives before guttering out. */
export const WISP_DEFAULT_LIFESPAN = 12;
/** A wild wisp flashes for its last N steps as a vanish warning. */
export const WISP_FLASH_MOVES = 3;
/** Hard ceiling on carried wisps (real modes cap lower via config). */
export const WISP_MAX_COMPANIONS = 3;
/** How many recently-vacated tiles the companion drifts between. */
export const WISP_TRAIL_LENGTH = 3;
/** A lit torch spooks wild wisps within this Chebyshev distance. */
export const WISP_FLEE_RADIUS = 1;
/** Chance a nearby wild wisp actively flees a lit torch on each drift step. */
export const WISP_FLEE_CHANCE = 0.75;
/** Chance a plain pot is stamped to hold a wisp at map generation (see stampWispPots). */
export const WISP_POT_CHANCE = 0.03;
/**
 * Pity spawn distance band (Chebyshev): far enough to never be "right in front of
 * you", close enough to be ON SCREEN — a 75%-that-fires-across-the-map would be a
 * roll nobody ever witnesses. The glimpse at the edge of view, and the choice to
 * chase it at one heart, is the whole moment.
 */
export const WISP_PITY_MIN_DIST = 4;
export const WISP_PITY_MAX_DIST = 8;

export interface WildWisp {
  id: number;
  y: number;
  x: number;
  /** Hero steps remaining before it gutters out. */
  movesLeft: number;
  /** Just spawned, hasn't drifted yet — the render layer plays its emerge spiral. */
  fresh?: boolean;
  /** Source tile it burst out of (a pot, a dying enemy) for the emerge animation. */
  bornFrom?: [number, number];
}

/**
 * Spawn-source tuning. A state with no wispConfig has the whole system dormant —
 * that is what keeps story/tutorial/legacy modes untouched.
 */
export interface WispConfig {
  /**
   * TEST-ROOM ONLY: runtime chance [0..1] that any smashed pot releases a wisp.
   * Real modes leave this unset — their wisp pots are STAMPED at map generation
   * (stampWispPots) so the same pots hold wisps for every player on a daily seed.
   */
  potChance?: number;
  /** Chance [0..1] that a defeated enemy leaves a wisp behind at its death tile. */
  enemyDropChance?: number;
  /**
   * When true, the FIRST time each floor the hero falls to exactly 1 heart, a
   * wisp is drawn out at the edge of view (4-8 tiles). Guaranteed, once per
   * floor: deterministic (nothing to seed, fair across players) and a hard cap
   * against yo-yo farming.
   */
  pity?: boolean;
  /** Wild lifespan override in hero steps. */
  lifespan?: number;
  /** Carry cap for this mode (clamped to WISP_MAX_COMPANIONS). */
  maxCompanions?: number;
}

/**
 * The real-mode tuning (daily + endless), from the 2026-08-10 balance pass. With
 * ~13 pots and ~27 enemies per daily run this lands around 1-1.5 wisp sightings
 * per run, weighted toward the pity rescue; carrying one is roughly a coin flip
 * on top (they expire and flee the torch), safely below Amber Moth frequency.
 */
export const WISP_STANDARD_CONFIG: WispConfig = {
  enemyDropChance: 0.02,
  pity: true,
  maxCompanions: 1,
};

/** True when a wisp may float over this tile: any in-bounds floor tile. */
function isFloatable(state: GameState, y: number, x: number): boolean {
  const row = state.mapData.tiles[y];
  return row !== undefined && row[x] === 0;
}

/** Safe to STAND on after a rescue tug: floatable and not lethal ground. */
function isSafeLanding(state: GameState, y: number, x: number): boolean {
  if (!isFloatable(state, y, x)) return false;
  const subs = state.mapData.subtypes[y]?.[x] ?? [];
  if (subs.includes(TileSubtype.LAVA) && !subs.includes(TileSubtype.OBSIDIAN))
    return false;
  if (subs.includes(TileSubtype.POT)) return false;
  return !(state.enemies ?? []).some((e) => e.y === y && e.x === x);
}

const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function chebyshev(ay: number, ax: number, by: number, bx: number): number {
  return Math.max(Math.abs(ay - by), Math.abs(ax - bx));
}

let nextWispId = 1;

function spawnAt(y: number, x: number, lifespan: number): WildWisp {
  return { id: nextWispId++, y, x, movesLeft: lifespan, fresh: true };
}

/**
 * Stamp WISP markers into a floor's pots at map-generation time, so which pots
 * hold wisps is part of the map itself — same pots for every player on the same
 * seed. Plain pots only: snake and rune pots already have contents, and a pot
 * should hold one surprise.
 *
 * MUST be called LAST in the floor's seeded RNG stream (after the map, seals,
 * enemies, runes, snakes and switch gate), exactly like maybePlaceSwitchGate and
 * for the same reason: every draw it makes lands after the existing draws, so
 * turning wisps on cannot change what any past date replays to — the historical
 * answers /stats gets by re-running the generators stay true.
 *
 * Mutates mapData in place (matching the other stamp* passes). Returns how many
 * pots were stamped.
 */
export function stampWispPots(
  mapData: GameState["mapData"],
  chance: number = WISP_POT_CHANCE,
  rng: () => number = Math.random
): number {
  let stamped = 0;
  for (const row of mapData.subtypes) {
    for (let x = 0; x < row.length; x++) {
      const subs = row[x] ?? [];
      if (!subs.includes(TileSubtype.POT)) continue;
      if (
        subs.includes(TileSubtype.SNAKE) ||
        subs.includes(TileSubtype.RUNE) ||
        subs.includes(TileSubtype.WISP)
      ) {
        continue;
      }
      if (rng() < chance) {
        row[x] = [...subs, TileSubtype.WISP];
        stamped++;
      }
    }
  }
  return stamped;
}

/**
 * One wisp turn, run from the movePlayer wrapper against the pre-move and fully
 * resolved post-move states. Returns `after` untouched (same reference) when the
 * feature is dormant, so every ordinary run pays nothing.
 *
 * Order matters and mirrors how the play should read:
 *  1. anything the hero just STEPPED ONTO is caught (walking onto a wisp is the
 *     catch — it must not get a flee step first),
 *  2. surviving wild wisps take their drift step and burn a move,
 *  3. anything that drifted onto the hero is caught (the dark-attraction catch),
 *  4. the world's events release new wisps (pots, sparks, pity) — they appear
 *     beside their source and hold still for a beat before drifting,
 *  5. the carried companion picks a new perch on the hero's trail.
 */
export function advanceWispTurn(
  before: GameState,
  after: GameState,
  rng: () => number = Math.random
): GameState {
  const dormant =
    !after.wispConfig &&
    (after.wisps?.length ?? 0) === 0 &&
    (after.wispCompanions ?? 0) === 0;
  if (dormant) return after;

  const moved = (after.stats?.steps ?? 0) > (before.stats?.steps ?? 0);
  const heroPos = findPlayerPosition(after.mapData);
  const config = after.wispConfig ?? {};
  const lifespan = config.lifespan ?? WISP_DEFAULT_LIFESPAN;

  // Positions are only meaningful on the map they were spawned on: drop any wisp
  // whose tile stopped being floor (floor swap, wall bombed in reverse, etc.).
  let wisps = (after.wisps ?? []).filter((w) =>
    isFloatable(after, w.y, w.x)
  );
  let companions = after.wispCompanions ?? 0;

  // Sharing the hero's tile = caught, from either side of the chase.
  const carryCap = Math.min(
    config.maxCompanions ?? WISP_MAX_COMPANIONS,
    WISP_MAX_COMPANIONS
  );
  const catchOnHero = () => {
    if (!heroPos) return;
    const kept: WildWisp[] = [];
    for (const w of wisps) {
      if (companions < carryCap && w.y === heroPos[0] && w.x === heroPos[1]) {
        companions += 1;
      } else {
        kept.push(w);
      }
    }
    wisps = kept;
  };

  // --- 1. The hero stepped onto a wisp: caught before it can take a flee step.
  catchOnHero();

  // --- 2. Drift + burn (only when the hero actually stepped) -------------------
  if (moved && heroPos) {
    const torchLit = after.heroTorchLit !== false;
    wisps = wisps
      .map((w) => {
        const options = DIRS8.map(([oy, ox]) => [w.y + oy, w.x + ox] as const)
          .filter(([y, x]) => isFloatable(after, y, x));
        let target: readonly [number, number] | undefined;
        if (options.length > 0) {
          if (!torchLit) {
            // Drawn to the dark hero: the step that closes the most distance.
            // Chebyshev first (that's what a caught-up wisp reads as), manhattan
            // as the tie-break so the approach beelines instead of zig-zagging.
            const score = ([y, x]: readonly [number, number]) =>
              chebyshev(y, x, heroPos[0], heroPos[1]) * 100 +
              Math.abs(y - heroPos[0]) +
              Math.abs(x - heroPos[1]);
            target = options.reduce((best, cur) =>
              score(cur) < score(best) ? cur : best
            );
          } else if (
            chebyshev(w.y, w.x, heroPos[0], heroPos[1]) <= WISP_FLEE_RADIUS
          ) {
            const currentDistance = chebyshev(
              w.y,
              w.x,
              heroPos[0],
              heroPos[1]
            );
            if (rng() < WISP_FLEE_CHANCE) {
              // Usually spooked by the flame: take the step that opens the most
              // distance, preserving the original flee behavior.
              target = options.reduce((best, cur) =>
                chebyshev(cur[0], cur[1], heroPos[0], heroPos[1]) >
                chebyshev(best[0], best[1], heroPos[0], heroPos[1])
                  ? cur
                  : best
              );
            } else {
              // Sometimes the wisp falters instead. Include its current tile and
              // only moves that do not open distance, so this branch can hold,
              // drift sideways, or even venture toward the hero without secretly
              // increasing the effective flee chance above 75%.
              const nonFleeOptions: ReadonlyArray<readonly [number, number]> = [
                [w.y, w.x],
                ...options.filter(
                  ([y, x]) =>
                    chebyshev(y, x, heroPos[0], heroPos[1]) <= currentDistance
                ),
              ];
              target =
                nonFleeOptions[Math.floor(rng() * nonFleeOptions.length)];
            }
          } else {
            target = options[Math.floor(rng() * options.length)];
          }
        }
        return {
          ...w,
          y: target ? target[0] : w.y,
          x: target ? target[1] : w.x,
          movesLeft: w.movesLeft - 1,
          // Its first drift step ends the emerge animation for good.
          fresh: undefined,
          bornFrom: undefined,
        };
      })
      .filter((w) => w.movesLeft > 0);
  }

  // --- 3. A dark-drawn wisp drifted onto the hero: also caught. ----------------
  catchOnHero();

  // --- 4. Spawn sources --------------------------------------------------------
  // New wisps appear NEXT TO their source tile (a pot bursts, the wisp flits out;
  // and a walk-in smash must not drop it under the hero's feet for a free catch),
  // and hold still until the next step.
  const spawnBeside = (sy: number, sx: number) => {
    const spots = DIRS8.map(([oy, ox]) => [sy + oy, sx + ox] as const).filter(
      ([y, x]) =>
        isFloatable(after, y, x) &&
        !(heroPos && y === heroPos[0] && x === heroPos[1])
    );
    const [y, x] =
      spots.length > 0 ? spots[Math.floor(rng() * spots.length)] : [sy, sx];
    wisps = [...wisps, { ...spawnAt(y, x, lifespan), bornFrom: [sy, sx] }];
  };

  // Smashed pots: any tile that carried POT before the turn and doesn't after.
  // Two ways a smashed pot releases a wisp:
  //  - it was STAMPED at generation ([POT, WISP], the seeded 3%): guaranteed, and
  //    the marker is consumed here (the smash paths only strip the POT tag);
  //  - the test room's runtime potChance roll (real modes leave it unset).
  const potChance = config.potChance ?? 0;
  {
    const beforeSubs = before.mapData.subtypes;
    const afterSubs = after.mapData.subtypes;
    for (let y = 0; y < beforeSubs.length; y++) {
      for (let x = 0; x < beforeSubs[y].length; x++) {
        const was = beforeSubs[y][x];
        if (!was?.includes(TileSubtype.POT)) continue;
        if (afterSubs[y]?.[x]?.includes(TileSubtype.POT)) continue;
        if (was.includes(TileSubtype.WISP)) {
          afterSubs[y][x] = (afterSubs[y][x] ?? []).filter(
            (s) => s !== TileSubtype.WISP
          );
          spawnBeside(y, x);
        } else if (potChance > 0 && rng() < potChance) {
          spawnBeside(y, x);
        }
      }
    }
  }

  // Enemy drops: recentDeaths is this tick's kill VFX list — the exact tiles.
  const enemyDropChance = config.enemyDropChance ?? 0;
  if (enemyDropChance > 0) {
    for (const [dy, dx] of after.recentDeaths ?? []) {
      if (rng() < enemyDropChance) spawnBeside(dy, dx);
    }
  }

  // Pity: the FIRST time each floor the hero falls to exactly one heart,
  // something small and bright notices — guaranteed, once per floor (see
  // WispConfig.pity), spawning at the edge of view so you glimpse it and have to
  // decide whether to chase a light while nearly dead. Latched only on a
  // successful spawn, so a cramped map can retry on a later dip.
  let wispPityFloors = after.wispPityFloors;
  if (
    config.pity &&
    before.heroHealth > 1 &&
    after.heroHealth === 1 &&
    heroPos &&
    !(wispPityFloors ?? []).includes(after.currentFloor ?? 1)
  ) {
    const span = WISP_PITY_MAX_DIST * 2 + 1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const y = heroPos[0] + Math.floor(rng() * span) - WISP_PITY_MAX_DIST;
      const x = heroPos[1] + Math.floor(rng() * span) - WISP_PITY_MAX_DIST;
      const d = chebyshev(y, x, heroPos[0], heroPos[1]);
      if (
        d >= WISP_PITY_MIN_DIST &&
        d <= WISP_PITY_MAX_DIST &&
        isFloatable(after, y, x)
      ) {
        wisps = [...wisps, spawnAt(y, x, lifespan)];
        wispPityFloors = [...(wispPityFloors ?? []), after.currentFloor ?? 1];
        break;
      }
    }
  }

  // --- 5. Trail + companion perch ----------------------------------------------
  // The trail is the last few tiles the hero VACATED, newest last — where the
  // companion is allowed to hover. It reads as the wisp lagging half a beat behind.
  let trail = after.heroTrail ?? [];
  if (moved && heroPos) {
    const beforePos = findPlayerPosition(before.mapData);
    if (
      beforePos &&
      (beforePos[0] !== heroPos[0] || beforePos[1] !== heroPos[1])
    ) {
      const last = trail[trail.length - 1];
      if (!last || last[0] !== beforePos[0] || last[1] !== beforePos[1]) {
        trail = [...trail, [beforePos[0], beforePos[1]] as [number, number]].slice(
          -WISP_TRAIL_LENGTH
        );
      }
    }
  }

  let wispPos = after.wispPos;
  if (companions > 0) {
    const perches = trail.filter(([y, x]) => isFloatable(after, y, x));
    if (perches.length > 0) {
      wispPos = perches[Math.floor(rng() * perches.length)];
    } else if (heroPos) {
      wispPos = [heroPos[0], heroPos[1]];
    }
  } else {
    wispPos = undefined;
  }

  return {
    ...after,
    wisps: wisps.length > 0 ? wisps : undefined,
    wispCompanions: companions > 0 ? companions : undefined,
    heroTrail: trail.length > 0 ? trail : undefined,
    wispPos,
    wispPityFloors,
  };
}

/**
 * The save itself. Non-null only when the hero is dead AND carrying a wisp: one
 * companion is spent, WISP_RESTORE_HEARTS come back, and the hero is tugged onto
 * the wisp's perch (or the nearest safe trail tile) so a ground-hazard death can't
 * immediately repeat. Returns a fresh state object for React.
 *
 * Runs BEFORE the Amber Moth's death rewind in the component: the wisp is the
 * cheaper save, so it goes first and the charm is preserved.
 */
export function wispDeathSave(state: GameState): GameState | null {
  if (state.heroHealth > 0) return null;
  const companions = state.wispCompanions ?? 0;
  if (companions <= 0) return null;

  const heroPos = findPlayerPosition(state.mapData);
  if (!heroPos) return null;

  const candidates: Array<[number, number]> = [];
  if (state.wispPos) candidates.push(state.wispPos);
  for (const t of [...(state.heroTrail ?? [])].reverse()) candidates.push(t);
  const landing =
    candidates.find(
      ([y, x]) =>
        (y !== heroPos[0] || x !== heroPos[1]) && isSafeLanding(state, y, x)
    ) ?? null;

  // Rebuild only the rows the tug touches; every other row is shared.
  let subtypes = state.mapData.subtypes;
  if (landing) {
    subtypes = subtypes.map((row, y) => {
      if (y !== heroPos[0] && y !== landing[0]) return row;
      return row.map((subs, x) => {
        if (y === heroPos[0] && x === heroPos[1]) {
          return subs.filter((s) => s !== TileSubtype.PLAYER);
        }
        if (y === landing[0] && x === landing[1]) {
          return subs.includes(TileSubtype.PLAYER)
            ? subs
            : [...subs, TileSubtype.PLAYER];
        }
        return subs;
      });
    });
  }

  const remaining = companions - 1;
  return {
    ...state,
    mapData: { ...state.mapData, subtypes },
    heroHealth: Math.min(WISP_RESTORE_HEARTS, state.heroMaxHealth ?? 5),
    wispCompanions: remaining > 0 ? remaining : undefined,
    // The spent wisp's perch is where the hero now stands; the survivors re-perch
    // on the next step.
    wispPos: remaining > 0 ? state.wispPos : undefined,
    deathCause: undefined,
  };
}
