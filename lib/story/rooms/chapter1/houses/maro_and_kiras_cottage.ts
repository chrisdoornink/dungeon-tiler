import type { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import type { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildMaroAndKirasCottage(): StoryRoom {
  const id = "story-torch-town-home-1" as RoomId;
  const displayLabel = "Maro & Kira's Cottage";
  
  // NPCs can be conditionally added here based on time of day or story flags
  const npcs: NPC[] = [];
  
  return buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
}
