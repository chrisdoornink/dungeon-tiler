import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildSerinsClinic(): StoryRoom {
  const id = "story-torch-town-home-3" as RoomId;
  const displayLabel = "Serin's Clinic";
  
  const npcs: NPC[] = [
    new NPC({ id: "npc-serin", name: "Serin", sprite: "/images/npcs/torch-town/serin.png", y: 3, x: 2, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Serin is always here (day and night)
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-serin": {
        showWhen: [] // Always show (no conditions)
      }
    }
  };
  
  return room;
}
