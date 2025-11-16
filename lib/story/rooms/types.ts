import type { MapData, RoomId } from "../../map";
import type { Enemy } from "../../enemy";
import type { NPC } from "../../npc";
import { TileSubtype } from "../../map";

export type StoryRoomLink = {
  id: string; // Unique ID for this transition
  roomId: RoomId;
  position: [number, number];
  targetTransitionId: string; // ID of the partner transition in destination room
  offsetX?: number; // Optional X offset from partner transition position
  offsetY?: number; // Optional Y offset from partner transition position
};

export interface StoryRoom {
  id: RoomId;
  mapData: MapData;
  entryPoint: [number, number];
  returnEntryPoint?: [number, number];
  entryFromNext?: [number, number];
  transitionToNext?: [number, number];
  transitionToPrevious?: [number, number];
  enemies?: Enemy[];
  npcs?: NPC[];
  potOverrides?: Record<string, TileSubtype.FOOD | TileSubtype.MED>;
  metadata?: Record<string, unknown>;
  otherTransitions?: StoryRoomLink[];
}
