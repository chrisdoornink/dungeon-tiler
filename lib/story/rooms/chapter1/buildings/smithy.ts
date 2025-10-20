import { Direction, type RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";
import { HOUSE_LABELS } from "../torch_town";

export function buildSmithy(): StoryRoom {
  const id = "story-torch-town-smithy" as RoomId;
  const displayLabel = "Smithy";
  
  const jorin = new NPC({
    id: "npc-jorin",
    name: "Jorin",
    sprite: "/images/npcs/torch-town/jorin.png",
    y: 3,
    x: 3,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "smithy", nightLocation: "house3", house: HOUSE_LABELS.HOUSE_3 },
  });

  // NPCs can be conditionally added here based on time of day or story flags
  const npcs: NPC[] = [jorin];
  
  return buildBuildingInterior(id, 4, 3, "house", displayLabel, npcs);
}
