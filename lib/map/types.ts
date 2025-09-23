import type { TileSubtype, RoomId } from "./constants";
import type { PlainEnemy } from "../enemy";
import type { PlainNPC } from "../npc";
import type { EnvironmentId } from "../environment";

export interface MapData {
  tiles: number[][];
  subtypes: number[][][];
  environment?: EnvironmentId;
}

export interface RoomSnapshot {
  mapData: MapData;
  entryPoint: [number, number];
  enemies?: PlainEnemy[];
  npcs?: PlainNPC[];
  potOverrides?: Record<string, TileSubtype.FOOD | TileSubtype.MED>;
}

export interface RoomTransition {
  from: RoomId;
  to: RoomId;
  position: [number, number];
  targetEntryPoint?: [number, number];
}
