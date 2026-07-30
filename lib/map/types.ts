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

export interface RoomTransition {
  from: RoomId;
  to: RoomId;
  position: [number, number];
  targetEntryPoint?: [number, number];
}
