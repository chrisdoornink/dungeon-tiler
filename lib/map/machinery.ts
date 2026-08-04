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
import type { MapData, Platform, ToggleGroup } from "./types";

/** Where a platform is standing this instant, or null if its track is empty. */
export function platformTile(p: Platform): [number, number] | null {
  return p.track[p.index] ?? null;
}

/** The tile a platform will occupy after its next advance, without moving it. */
export function nextPlatformTile(p: Platform): [number, number] | null {
  if (!p.running || p.track.length < 2) return platformTile(p);
  const { index, dir } = stepIndex(p);
  void dir;
  return p.track[index] ?? null;
}

/**
 * Advance one step along the track, bouncing at either end.
 *
 * The bounce REFLECTS rather than wrapping: at the last tile the slab turns around and its next
 * position is the second-to-last, so it never teleports from one end to the other. A wrap would
 * be cheaper to write and would strand a rider in the middle of the hazard.
 */
function stepIndex(p: Platform): { index: number; dir: 1 | -1 } {
  const last = p.track.length - 1;
  let dir = p.dir;
  let index = p.index + dir;
  if (index > last) {
    dir = -1;
    index = Math.max(0, last - 1);
  } else if (index < 0) {
    dir = 1;
    index = Math.min(last, 1);
  }
  return { index, dir };
}

/** Is the hero riding this platform right now? */
function heroIsAboard(p: Platform, hero: [number, number] | null): boolean {
  const at = platformTile(p);
  return !!at && !!hero && at[0] === hero[0] && at[1] === hero[1];
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
 * Move the platform's slab from one tile to another, carrying its rider.
 *
 * The PLAYER subtype is moved with the slab rather than the hero being re-placed afterwards,
 * because the hero's position IS their PLAYER tag on the map (see findPlayerPosition) — there is
 * no separate coordinate to update, so carrying and moving are the same operation.
 */
function relocateSlab(
  mapData: MapData,
  from: [number, number],
  to: [number, number],
  carryRider: boolean
): void {
  removeSub(mapData, from[0], from[1], TileSubtype.MOVING_PLATFORM);
  addSub(mapData, to[0], to[1], TileSubtype.MOVING_PLATFORM);
  if (carryRider) {
    removeSub(mapData, from[0], from[1], TileSubtype.PLAYER);
    addSub(mapData, to[0], to[1], TileSubtype.PLAYER);
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
  hero: [number, number] | null
): { carried: boolean } {
  if (!state.platforms || state.platforms.length === 0) return { carried: false };
  let carried = false;
  for (const p of state.platforms) {
    if (!p.running || p.track.length < 2) continue;
    const from = platformTile(p);
    if (!from) continue;
    const rider = heroIsAboard(p, hero);
    const { index, dir } = stepIndex(p);
    const to = p.track[index];
    if (!to) continue;
    // A slab never shoves an entity off its destination. Enemies do not path onto hazard tiles,
    // so in practice this only fires if a room is authored with something parked on the track;
    // stalling for a turn is a far better failure than deleting whatever was standing there.
    if (has(state.mapData, to[0], to[1], TileSubtype.PLAYER) && !rider) continue;
    relocateSlab(state.mapData, from, to, rider);
    p.index = index;
    p.dir = dir;
    if (rider) carried = true;
  }
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
  // Replaced rather than mutated in place: toggleGroups is shared by reference with the pre-move
  // state and with any checkpoint snapshot, and a mutated group would corrupt a restore. Same
  // reason gateGroups is replaced in pressPlate.
  state.toggleGroups = (state.toggleGroups ?? []).map((g) =>
    g === group ? { ...g, on } : g
  );

  const crushed: Array<[number, number]> = [];
  const setBed = (gy: number, gx: number, raise: boolean): void => {
    if (raise) {
      if (has(state.mapData, gy, gx, TileSubtype.PLAYER)) return; // never rise under the hero
      if (!has(state.mapData, gy, gx, TileSubtype.SPIKE_HOLES)) return;
      if (occupied.has(`${gy},${gx}`)) crushed.push([gy, gx]);
      removeSub(state.mapData, gy, gx, TileSubtype.SPIKE_HOLES);
      addSub(state.mapData, gy, gx, TileSubtype.SPIKES);
    } else {
      // Retracting is always safe.
      if (!has(state.mapData, gy, gx, TileSubtype.SPIKES)) return;
      removeSub(state.mapData, gy, gx, TileSubtype.SPIKES);
      addSub(state.mapData, gy, gx, TileSubtype.SPIKE_HOLES);
    }
  };
  for (const [gy, gx] of group.gates) setBed(gy, gx, !on);
  for (const [gy, gx] of group.invertedGates ?? []) setBed(gy, gx, on);

  if (group.platforms.length > 0) {
    const ids = new Set(group.platforms);
    state.platforms = (state.platforms ?? []).map((p) =>
      ids.has(p.id) ? { ...p, running: on } : p
    );
  }

  return { crushed };
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
  const at = platformTile(p);
  if (at) addSub(mapData, at[0], at[1], TileSubtype.MOVING_PLATFORM);
}
