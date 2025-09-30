import type { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import type { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildLibrary(): StoryRoom {
  const id = "story-torch-town-library" as RoomId;
  const displayLabel = "Library";
  
  // NPCs can be conditionally added here based on time of day or story flags
  const npcs: NPC[] = [];
  
  return buildBuildingInterior(id, 5, 4, "house", displayLabel, npcs);
}
