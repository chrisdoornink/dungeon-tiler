import type { MapData, RoomId } from "../../map";
import type { Enemy } from "../../enemy";
import type { NPC } from "../../npc";
import { TileSubtype } from "../../map";

export type StoryRoomLink = {
  roomId: RoomId;
  position: [number, number];
  targetEntryPoint?: [number, number];
  returnEntryPoint?: [number, number];
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
