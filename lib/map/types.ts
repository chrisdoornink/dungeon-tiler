import type { TileSubtype, RoomId } from "./constants";
import type { PlainEnemy } from "../enemy";
import type { PlainNPC } from "../npc";
import type { EnvironmentId } from "../environment";

export interface MapData {
  tiles: number[][];
  subtypes: number[][][];
  environment?: EnvironmentId;
  /**
   * Marks the rare snake-swarm event level. Set during map generation when the
   * swarm RNG roll triggers. Used downstream (e.g. pot reveals) to guarantee
   * at least 2 healing potions are available on this floor.
   */
  snakeSwarm?: boolean;
}

/**
 * Forced pot contents, keyed by `${y},${x}`, consumed the first time that pot is opened
 * (or broken). BERRY is here because a bombed decoy seal leaves a pot holding
 * pink-realm fruit — see SealPayload.
 */
export type PotOverrides = Record<
  string,
  TileSubtype.FOOD | TileSubtype.MED | TileSubtype.BERRY
>;

export interface RoomSnapshot {
  mapData: MapData;
  entryPoint: [number, number];
  enemies?: PlainEnemy[];
  npcs?: PlainNPC[];
  potOverrides?: PotOverrides;
  metadata?: Record<string, unknown>;
}

/**
 * What a WALL_SEAL hides. Kept OFF the tile's subtype array on purpose: every seal must
 * look identical until it is blown open, so a player (or the DOM) can't tell the real
 * doorway from a decoy by anything but the bracketing wall torches.
 *  - "boss"  -> opens into a BOSS_ENTRANCE cave mouth (the real doorway)
 *  - "berry" -> a POT holding a belted berry from the pink realm
 *  - "food"  -> a POT holding ordinary food
 */
export type SealPayload = "boss" | "berry" | "food";

/** Keyed by `${y},${x}` of the sealed wall tile. */
export type SealPayloads = Record<string, SealPayload>;

/**
 * One switch and the spike beds it retracts. Stepping on `plate` sets `open` and turns every
 * tile in `gates` from SPIKES into walkable SPIKE_HOLES, permanently.
 *
 * The wiring lives here rather than in the tile subtypes so an arena can run any number of
 * independent plate/barrier sets — the Quarrymaster's beds each answer to their own switch,
 * and a player watching one retract learns the rule from a single press.
 */
export interface GateGroup {
  plate: [number, number];
  gates: Array<[number, number]>;
  open: boolean;
}

/**
 * One TOGGLE_SWITCH and what it controls. Unlike a GateGroup this NEVER latches — every throw
 * flips `on`, so a room can be reconfigured as many times as the puzzle needs.
 *
 * A toggle can drive two different things at once, and usually should:
 *  - `gates`: spike beds that raise when `on` is false and retract when it is true, so one
 *    switch opens one route while closing another. That trade is the puzzle.
 *  - `platforms`: platform ids this switch starts and stops. Stopping a platform is how the
 *    player PARKS it somewhere useful instead of waiting for its cycle to come round again.
 */
export interface ToggleGroup {
  /** The switch tile. */
  switchAt: [number, number];
  /** Spike beds retracted while `on` and raised while off. */
  gates: Array<[number, number]>;
  /**
   * Beds with the OPPOSITE polarity: raised while `on`, retracted while off.
   *
   * This is what makes a toggle a puzzle piece rather than a slower key. With only `gates` a
   * switch can do nothing but open more of the map, so throwing it is never a decision — you
   * always throw it. Pair a bed here with one in `gates` and the switch becomes a TRADE: this
   * route opens, that one closes, and which of the two you want depends on where you are and
   * what you still need to reach.
   */
  invertedGates: Array<[number, number]>;
  /** Ids of platforms this switch starts and stops. Running while `on`. */
  platforms: string[];
  on: boolean;
}

/**
 * A COLOUR LOCK: several turning switches whose combined COLOURS drive a platform/gates through a
 * predicate, instead of a single on/off flip. Turning a switch cycles its colour (0..colors-1); the
 * lock is SATISFIED when the switch colours meet `rule`, and while satisfied its platforms run and
 * its gates retract (invertedGates rise) — the exact same wiring semantics as a ToggleGroup's `on`,
 * just driven by a many-switch condition rather than one boolean.
 *
 *  - rule "allEqual": satisfied when every switch shows the SAME colour ("all one colour").
 *  - rule "match":    satisfied when the colours equal `target` position-for-position (a pattern).
 *
 * `states[i]` is the current colour of `switches[i]` — the two arrays run in parallel. A single
 * switch belongs to one lock. The switches render as ordinary TOGGLE_SWITCH tiles; their colour is
 * read from here, so the existing multi-colour switch art needs no change.
 */
export interface ColorLock {
  id: string;
  switches: Array<[number, number]>;
  /** Colours each switch cycles through, >= 2. Four is the natural max (four switch colours exist). */
  colors: number;
  /** Current colour per switch, parallel to `switches`. */
  states: number[];
  rule: "allEqual" | "match";
  /** Required colour per switch when `rule === "match"`. */
  target?: number[];
  /** Platforms that run while the lock is satisfied. */
  platforms: string[];
  /** Spike beds that retract while satisfied and rise while not. */
  gates: Array<[number, number]>;
  /** Beds with opposite polarity: rise while satisfied, retract while not. */
  invertedGates: Array<[number, number]>;
}

/**
 * A slab that ferries the hero across a hazard, one tile per turn.
 *
 * `track` is the full route in order, and the slab PING-PONGS along it: it walks to the end,
 * reverses, and comes back. A loop would need the track to close on itself, which authored
 * rooms never do, and ping-pong has the property a puzzle wants — the platform always comes
 * back, so a missed boarding costs turns rather than the run.
 *
 * `index` is where on the track the slab is right now; `dir` is which way it is heading.
 * `running` is false while a toggle switch has it parked.
 */
export interface Platform {
  id: string;
  track: Array<[number, number]>;
  /**
   * Index of the platform's FIRST occupied track tile. It occupies `length` consecutive track
   * tiles from here, so the valid range is 0 .. track.length - length.
   */
  index: number;
  dir: 1 | -1;
  running: boolean;
  /**
   * How many track tiles the deck spans. 1 is a single slab; 2-3 is a raft.
   *
   * A LONGER DECK IS A TEACHING DEVICE, not decoration. The hard part of this mechanic is not the
   * timing, it is getting players to understand that you board and then WAIT rather than keep
   * walking — and a one-tile slab actively teaches the wrong thing, because it looks like a
   * stepping stone. Board a three-tile raft and there is deck ahead of you: you can walk along it
   * while it moves, which reads as a vehicle without a word of instruction. It also widens the
   * boarding window, which is where a one-tile slab is meanest.
   */
  length: number;
  /**
   * When true, enemies riding this deck are NOT carried (it is the hero's alone).
   *
   * PARTIAL as of now: this is honored in CARRYING (advanceMachinery won't ferry an enemy on a
   * heroOnly deck) but NOT yet in enemy PATHING — a rideable enemy can still step onto a heroOnly
   * deck and then be left behind when it moves. So do not author a heroOnly platform that enemies
   * can reach until pathing honors this too; today no room sets it. Kept in the model so a future
   * hero-only platform has a home.
   */
  heroOnly?: boolean;
}

export interface RoomTransition {
  from: RoomId;
  to: RoomId;
  position: [number, number];
  targetEntryPoint?: [number, number];
}
