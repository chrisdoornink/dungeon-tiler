import type { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import type { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildStore(): StoryRoom {
  const id = "story-torch-town-store" as RoomId;
  const displayLabel = "Store";
  
  // NPCs can be conditionally added here based on time of day or story flags
  const npcs: NPC[] = [];
  
  return buildBuildingInterior(id, 4, 3, "house", displayLabel, npcs);
}
