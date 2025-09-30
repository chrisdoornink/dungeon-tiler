import type { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import type { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildSmithy(): StoryRoom {
  const id = "story-torch-town-smithy" as RoomId;
  const displayLabel = "Smithy";
  
  // NPCs can be conditionally added here based on time of day or story flags
  const npcs: NPC[] = [];
  
  return buildBuildingInterior(id, 4, 3, "house", displayLabel, npcs);
}
