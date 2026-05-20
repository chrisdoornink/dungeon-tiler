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

export interface RoomSnapshot {
  mapData: MapData;
  entryPoint: [number, number];
  enemies?: PlainEnemy[];
  npcs?: PlainNPC[];
  potOverrides?: Record<string, TileSubtype.FOOD | TileSubtype.MED>;
  metadata?: Record<string, unknown>;
}

export interface RoomTransition {
  from: RoomId;
  to: RoomId;
  position: [number, number];
  targetEntryPoint?: [number, number];
}
