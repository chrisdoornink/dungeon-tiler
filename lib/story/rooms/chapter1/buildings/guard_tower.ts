import type { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import type { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildGuardTower(): StoryRoom {
  const id = "story-torch-town-guard-tower" as RoomId;
  const displayLabel = "Guard Tower";
  
  // NPCs can be conditionally added here based on time of day or story flags
  const npcs: NPC[] = [];
  
  return buildBuildingInterior(id, 3, 4, "house", displayLabel, npcs);
}
