// Puzzle machinery: toggle switches and moving platforms.
//
// These are the two pieces the existing switch/spike mechanic could not express. A
// PRESSURE_PLATE latches — thrown once, spent forever — which is right for banked progress
// toward a caged boss and wrong for a puzzle, where the interesting act is reconfiguring the
// room more than once. A TOGGLE_SWITCH flips instead, and a MOVING_PLATFORM turns an
// impassable hazard into a timing problem rather than an item check.
//
// WHAT MAKES THESE PUZZLE PIECES RATHER THAN MORE TERRAIN:
//  - A toggle can raise one bed while lowering another, so throwing it is a TRADE, not a win.
//    A latching plate can only ever make the map more open.
//  - A platform's cost is TURNS. Nothing is consumed, so the hero can always eventually cross;
//    what they spend is enemy actions and torch burn. That is a cost a puzzle floor can lean on
//    without ever being unsolvable.
//  - A toggle that parks a platform is the two combined: the platform's cycle is a clock, and
//    the switch is how you stop the clock somewhere useful.
//
// EVERYTHING HERE IS PURE AND MUTATES WHAT IT IS GIVEN. No RNG, no time — a turn is advanced
// only by advanceMachinery(), called once from the shared turn hook in game-state.ts, so the
// whole system is a deterministic function of how many turns have elapsed. That is what makes
// authored puzzle rooms verifiable and replays honest.
import { TileSubtype } from "./constants";
import type { ColorLock, MapData, Platform, ToggleGroup } from "./types";
import { enemyCanRidePlatforms } from "../enemy";

/**
 * The colour a toggle switch shows in each of its states, indexed by state.
 *
 * WHY AN EXPLICIT COLOUR RATHER THAN A CSS FILTER: the switch sprite is a near-black desaturated
 * green (hue ~120deg, value 0.16), and `hue-rotate` on something that dark changes almost nothing
 * you can see. The first version rotated the hue by 165deg and the only colour that actually read
 * was the drop-shadow glow behind it, which is why the state was impossible to tell — and why it
 * looked like it might be blue OR green. State colour is now carried by the glow and an indicator
 * lamp, both of which are drawn rather than filtered.
 *
 * ORDERED FOR DISTINGUISHABILITY, not prettiness. Adjacent states differ in lightness as well as
 * hue so they stay separable with colour-vision deficiency, and the renderer additionally flips the
 * lever for odd states so colour is never the only channel carrying the information.
 *
 * Amber is deliberately absent: a LATCHING pressure plate already glows amber (.plateArmed), and a
 * toggle that borrowed that colour would read as the one thing it is not — spent.
 *
 * Add a state by adding a colour. Indexing wraps, so a group with more states than colours degrades
 * to reused colours rather than to no colour at all.
 */
export const TOGGLE_STATE_COLORS = [
  "#2690b8", // 0 — cold blue
  "#2dad63", // 1 — green
  "#7f59b8", // 2 — violet
  "#b85071", // 3 — rose
] as const;

/** The colour for a given state, wrapping if a group has more states than colours. */
export function toggleStateColor(state: number): string {
  const n = TOGGLE_STATE_COLORS.length;
  return TOGGLE_STATE_COLORS[((state % n) + n) % n];
}

/** The deck's length in track tiles, tolerating a platform authored before `length` existed. */
function deckLength(p: Platform): number {
  return Math.max(1, p.length ?? 1);
}

/** Highest `index` the deck can sit at without hanging off the end of its track. */
function maxIndex(p: Platform): number {
  return p.track.length - deckLength(p);
}

/** The platform's leading-edge tile — the first track tile its deck covers. */
export function platformTile(p: Platform): [number, number] | null {
  return p.track[p.index] ?? null;
}

/**
 * Every tile the deck currently covers, in track order.
 *
 * This is the tile set for everything that cares where the platform IS — rendering, hazard
 * suppression, and whether a given tile is safe to stand on. A one-tile deck returns one tile, so
 * callers need no special case.
 */
export function platformTiles(p: Platform): Array<[number, number]> {
  const len = deckLength(p);
  return p.track.slice(p.index, p.index + len);
}

/** Is this tile part of the deck right now? */
export function platformCovers(p: Platform, y: number, x: number): boolean {
  return platformTiles(p).some(([ty, tx]) => ty === y && tx === x);
}

/** Where the leading edge will be after the next advance, without moving anything. */
export function nextPlatformTile(p: Platform): [number, number] | null {
  if (!p.running || maxIndex(p) < 1) return platformTile(p);
  const { index } = stepIndex(p);
  return p.track[index] ?? null;
}

/**
 * Advance one step along the track, bouncing at either end.
 *
 * The bounce REFLECTS rather than wrapping: at the far end the deck turns around and its next
 * position is one step back, so it never teleports from one end to the other. A wrap would be
 * cheaper to write and would strand a rider in the middle of the hazard.
 *
 * The limit is maxIndex, NOT the last track index, because a deck longer than one tile runs out of
 * track that much sooner — a 3-long deck on a 5-tile track reverses at index 2.
 */
function stepIndex(p: Platform): { index: number; dir: 1 | -1 } {
  const max = maxIndex(p);
  let dir = p.dir;
  let index = p.index + dir;
  if (index > max) {
    dir = -1;
    index = Math.max(0, max - 1);
  } else if (index < 0) {
    dir = 1;
    index = Math.min(max, 1);
  }
  return { index, dir };
}

/**
 * Which track index the hero is standing on, or -1 if they are not aboard.
 *
 * Returned as an INDEX rather than a boolean because a rider has to keep their place on the deck:
 * someone standing at the stern must still be at the stern after the platform moves, or walking
 * along a moving raft would slide them around underfoot.
 */
function riderTrackIndex(p: Platform, hero: [number, number] | null): number {
  if (!hero) return -1;
  const len = deckLength(p);
  for (let i = p.index; i < p.index + len; i++) {
    const t = p.track[i];
    if (t && t[0] === hero[0] && t[1] === hero[1]) return i;
  }
  return -1;
}

function has(mapData: MapData, y: number, x: number, sub: TileSubtype): boolean {
  return (mapData.subtypes[y]?.[x] ?? []).includes(sub);
}

function addSub(mapData: MapData, y: number, x: number, sub: TileSubtype): void {
  const cell = mapData.subtypes[y]?.[x];
  if (cell && !cell.includes(sub)) cell.push(sub);
}

function removeSub(mapData: MapData, y: number, x: number, sub: TileSubtype): void {
  const cell = mapData.subtypes[y]?.[x];
  if (!cell) return;
  const i = cell.indexOf(sub);
  if (i >= 0) cell.splice(i, 1);
}

/**
 * Repaint the deck from one span of track tiles to another, carrying any rider with it.
 *
 * Cleared BEFORE it is redrawn, and that order matters once the deck is longer than one tile: the
 * old and new spans overlap, so painting first and clearing second would erase the tiles they share
 * and leave the raft with a hole in it.
 *
 * The rider is moved by rewriting their PLAYER tag, because the hero's position IS that tag (see
 * findPlayerPosition) — there is no separate coordinate, so carrying and moving are one operation.
 */
function repaintDeck(
  mapData: MapData,
  oldSpan: Array<[number, number]>,
  newSpan: Array<[number, number]>,
  rider: { from: [number, number]; to: [number, number] } | null
): void {
  for (const [y, x] of oldSpan) removeSub(mapData, y, x, TileSubtype.MOVING_PLATFORM);
  for (const [y, x] of newSpan) addSub(mapData, y, x, TileSubtype.MOVING_PLATFORM);
  if (rider) {
    removeSub(mapData, rider.from[0], rider.from[1], TileSubtype.PLAYER);
    addSub(mapData, rider.to[0], rider.to[1], TileSubtype.PLAYER);
  }
}

/**
 * One turn of machinery. Called from the shared turn hook, once per turn-consuming action.
 *
 * Only platforms move on a turn; toggles are player-driven and change nothing on their own.
 * Returns the platforms that carried the hero this turn, which the caller needs in order to
 * re-derive the hero's position (it changed without the player having moved).
 */
export function advanceMachinery(
  state: { mapData: MapData; platforms?: Platform[] },
  hero: [number, number] | null,
  /**
   * The enemies on the board. They live on the game state, not in `subtypes`, so this module
   * cannot see them otherwise. Used two ways: any enemy on a tile the deck is NEWLY covering
   * BLOCKS it (so a deck stalls at a body rather than sliding over it), and any RIDEABLE enemy
   * already ON the deck is CARRIED with it — that is how a goblin chases the hero across a hazard
   * on the same raft. Mutated in place (y,x) when carried. Omit when there are no enemies.
   */
  enemies?: Array<{ y: number; x: number; kind: string }>
): { carried: boolean } {
  if (!state.platforms || state.platforms.length === 0) return { carried: false };
  const occupied = new Set((enemies ?? []).map((e) => `${e.y},${e.x}`));
  let carried = false;
  // Copy-on-write, the same standard throwToggle holds for toggleGroups: the platforms array is
  // shared by reference with the pre-action state (and any snapshot), and performWait / the
  // consumables only shallow-copy it, so mutating p.index/p.dir in place would rewrite the
  // committed previous React state's platform records. A platform that MOVES is replaced with a
  // copy; one that does not is returned untouched (same ref), and the array is only swapped in if
  // something actually moved. (The map is the caller's concern — see endShallowCopyTurn.)
  let mutated = false;
  const nextPlatforms = state.platforms.map((p) => {
    // maxIndex < 1 means the deck fills its whole track and has nowhere to go. That is an authoring
    // mistake (a 3-long raft on a 3-tile rail), and stalling beats thrashing in place.
    if (!p.running || maxIndex(p) < 1) return p;
    const prevIndex = p.index;
    const oldSpan = platformTiles(p);
    const { index, dir } = stepIndex(p);
    if (index === p.index) return p;

    const riderIdx = riderTrackIndex(p, hero);
    const riderFrom = riderIdx >= 0 ? p.track[riderIdx] : null;
    // The rider keeps their offset along the deck, so they travel exactly one track step — the
    // same distance the deck does. Derived from the track rather than from a delta so a bent track
    // would carry them round the corner too.
    const riderTo = riderIdx >= 0 ? p.track[riderIdx + dir] : null;

    const newSpan = p.track.slice(index, index + deckLength(p));
    // The deck never shoves anything off a tile it is moving onto, and never lands a rider ON a
    // body. Only tiles it is NEWLY covering can block. The rider's OWN destination is excused for
    // the PLAYER tag alone — the hero moves with the deck, so his tag arriving on riderTo is not a
    // collision. An ENEMY on riderTo is NOT excused: skipping it (the old bug) let the deck carry
    // the hero straight on top of a goblin standing on the far dock. Now it stalls there instead.
    const blocked = newSpan.some(([ny, nx]) => {
      if (oldSpan.some(([oy, ox]) => oy === ny && ox === nx)) return false;
      const isRiderDest = !!(riderTo && riderTo[0] === ny && riderTo[1] === nx);
      if (has(state.mapData, ny, nx, TileSubtype.PLAYER) && !isRiderDest) return true;
      return occupied.has(`${ny},${nx}`);
    });
    if (blocked) return p;
    if (riderIdx >= 0 && !riderTo) return p; // would carry the rider off the end of the rail

    repaintDeck(
      state.mapData,
      oldSpan,
      newSpan,
      riderFrom && riderTo ? { from: riderFrom, to: riderTo } : null
    );

    // Carry rideable enemies riding the deck. An enemy at oldSpan[k] = track[prevIndex+k] keeps
    // its offset and moves one track step, exactly like the hero. Non-riders stay put (and blocked
    // the move if they were in the deck's path). A heroOnly deck carries no enemies. Positions are
    // mutated in place; uniform +dir shift preserves every rider's separation, so no two entities
    // can land on one tile.
    if (!p.heroOnly && enemies) {
      for (const e of enemies) {
        const k = oldSpan.findIndex(([oy, ox]) => oy === e.y && ox === e.x);
        if (k < 0) continue;
        if (!enemyCanRidePlatforms(e.kind)) continue;
        const dest = p.track[prevIndex + k + dir];
        if (dest) {
          e.y = dest[0];
          e.x = dest[1];
        }
      }
    }

    if (riderIdx >= 0) carried = true;
    mutated = true;
    return { ...p, index, dir };
  });
  if (mutated) state.platforms = nextPlatforms;
  return { carried };
}

/**
 * Throw a toggle switch: flip it and everything wired to it.
 *
 * Spikes go down when the switch turns on and back up when it turns off — EXCEPT under an
 * occupied tile. A bed that rose under the hero would either have to kill them or shove them,
 * and in a puzzle room both read as the game cheating: the player threw a switch across the
 * room and died for it. Beds that cannot rise stay retracted and will rise on a later throw,
 * once whoever is standing there has moved.
 *
 * Enemies get no such mercy. A bed rising under one kills it, which gives a toggle a second,
 * discoverable use and is the kind of thing a player enjoys finding.
 *
 * Returns the ids of any enemies-at-coordinates the caller should kill (the caller owns the
 * enemy list; this module deliberately knows nothing about it).
 */
/**
 * Set a spike bed up (raise) or down. Raising is REFUSED under the hero — a bed that impaled the
 * player for a switch thrown across the room reads as the game cheating, which a puzzle must never
 * do. Raising it under an ENEMY is fair, and the coordinate is pushed to `crushed` for the caller to
 * kill. Retracting is always safe. Shared by every wiring driver below.
 */
function setBed(
  mapData: MapData,
  gy: number,
  gx: number,
  raise: boolean,
  occupied: ReadonlySet<string>,
  crushed: Array<[number, number]>
): void {
  if (raise) {
    if (has(mapData, gy, gx, TileSubtype.PLAYER)) return; // never rise under the hero
    if (!has(mapData, gy, gx, TileSubtype.SPIKE_HOLES)) return;
    if (occupied.has(`${gy},${gx}`)) crushed.push([gy, gx]);
    removeSub(mapData, gy, gx, TileSubtype.SPIKE_HOLES);
    addSub(mapData, gy, gx, TileSubtype.SPIKES);
  } else {
    if (!has(mapData, gy, gx, TileSubtype.SPIKES)) return;
    removeSub(mapData, gy, gx, TileSubtype.SPIKES);
    addSub(mapData, gy, gx, TileSubtype.SPIKE_HOLES);
  }
}

/**
 * Drive a set of beds and platforms from ONE boolean — `on` for a toggle, `satisfied` for a colour
 * lock. gates retract while true and rise while false; invertedGates do the opposite; platforms run
 * while true. Platforms are REPLACED with copies rather than mutated in place (the array is shared
 * with the pre-action state, same as advanceMachinery). Returns the beds that crushed an enemy.
 */
function applyWiring(
  state: { mapData: MapData; platforms?: Platform[] },
  wiring: {
    gates: Array<[number, number]>;
    invertedGates?: Array<[number, number]>;
    platforms?: string[];
  },
  on: boolean,
  occupied: ReadonlySet<string>
): Array<[number, number]> {
  const crushed: Array<[number, number]> = [];
  for (const [gy, gx] of wiring.gates) setBed(state.mapData, gy, gx, !on, occupied, crushed);
  for (const [gy, gx] of wiring.invertedGates ?? [])
    setBed(state.mapData, gy, gx, on, occupied, crushed);
  if (wiring.platforms && wiring.platforms.length > 0) {
    const ids = new Set(wiring.platforms);
    state.platforms = (state.platforms ?? []).map((p) =>
      ids.has(p.id) ? { ...p, running: on } : p
    );
  }
  return crushed;
}

/**
 * Throw a toggle switch: flip its `on` and drive everything wired to it (see applyWiring). A toggle
 * NEVER latches — every throw flips it — which is what lets a puzzle be reconfigured repeatedly.
 *
 * `toggleGroups` is REPLACED rather than mutated: it is shared by reference with the pre-move state
 * and any checkpoint snapshot, and a mutated group would corrupt a restore (same reason gateGroups
 * is replaced in pressPlate).
 */
export function throwToggle(
  state: { mapData: MapData; toggleGroups?: ToggleGroup[]; platforms?: Platform[] },
  y: number,
  x: number,
  occupied: ReadonlySet<string>
): { crushed: Array<[number, number]> } {
  const group = state.toggleGroups?.find(
    (g) => g.switchAt[0] === y && g.switchAt[1] === x
  );
  if (!group) return { crushed: [] };
  const on = !group.on;
  state.toggleGroups = (state.toggleGroups ?? []).map((g) =>
    g === group ? { ...g, on } : g
  );
  return { crushed: applyWiring(state, group, on, occupied) };
}

/** Is a colour lock satisfied by its switches' current colours? */
export function colorLockSatisfied(lock: ColorLock): boolean {
  if (lock.states.length === 0) return false;
  if (lock.rule === "allEqual") return lock.states.every((s) => s === lock.states[0]);
  const target = lock.target ?? [];
  return lock.states.every((s, i) => s === target[i]);
}

/** True if a colour switch sits at (y,x) — the dispatch signal between turnColorSwitch and throwToggle. */
export function isColorSwitch(
  state: { colorLocks?: ColorLock[] },
  y: number,
  x: number
): boolean {
  return (state.colorLocks ?? []).some((l) =>
    l.switches.some(([sy, sx]) => sy === y && sx === x)
  );
}

/**
 * Apply a colour lock's CURRENT satisfaction to its beds and platforms WITHOUT turning anything.
 * Used at authoring time so a room starts consistent with the lock's initial colours.
 */
export function applyColorLock(
  state: { mapData: MapData; platforms?: Platform[] },
  lock: ColorLock,
  occupied: ReadonlySet<string>
): { crushed: Array<[number, number]> } {
  return { crushed: applyWiring(state, lock, colorLockSatisfied(lock), occupied) };
}

/**
 * Turn the colour switch at (y,x): cycle its colour one step, re-evaluate the lock it belongs to,
 * and drive that lock's beds/platforms from whether it is now satisfied. Never latches, and
 * copy-on-writes the locks array (shared with the pre-action state). No-op if (y,x) is not a colour
 * switch.
 */
export function turnColorSwitch(
  state: { mapData: MapData; colorLocks?: ColorLock[]; platforms?: Platform[] },
  y: number,
  x: number,
  occupied: ReadonlySet<string>
): { crushed: Array<[number, number]> } {
  const locks = state.colorLocks ?? [];
  const lockIdx = locks.findIndex((l) =>
    l.switches.some(([sy, sx]) => sy === y && sx === x)
  );
  if (lockIdx < 0) return { crushed: [] };
  const lock = locks[lockIdx];
  const swIdx = lock.switches.findIndex(([sy, sx]) => sy === y && sx === x);
  const states = lock.states.slice();
  states[swIdx] = (states[swIdx] + 1) % Math.max(2, lock.colors);
  const next = { ...lock, states };
  state.colorLocks = locks.map((l, i) => (i === lockIdx ? next : l));
  return { crushed: applyWiring(state, next, colorLockSatisfied(next), occupied) };
}

/**
 * Does a platform currently make this tile safe to stand on?
 *
 * This is the MOVING_PLATFORM equivalent of the `!subtype.includes(OBSIDIAN)` guard on the lava
 * death check: the hazard subtype stays on the tile (so it still renders as lava or water, and
 * still kills once the slab leaves) and the slab suppresses it only while it is here.
 */
export function tileIsPlatformed(mapData: MapData, y: number, x: number): boolean {
  return has(mapData, y, x, TileSubtype.MOVING_PLATFORM);
}

/**
 * Stamp a platform's route and starting slab onto a map.
 *
 * Authored rooms call this so the track decal and the slab can never disagree with the
 * `Platform` record that drives them — the single most likely authoring mistake, and an
 * invisible one until a slab appears to slide over open floor.
 */
export function stampPlatform(mapData: MapData, p: Platform): void {
  for (const [ty, tx] of p.track) {
    addSub(mapData, ty, tx, TileSubtype.PLATFORM_TRACK);
  }
  for (const [ty, tx] of platformTiles(p)) {
    addSub(mapData, ty, tx, TileSubtype.MOVING_PLATFORM);
  }
}
