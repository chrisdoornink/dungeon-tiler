import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildRhettAndMirasCottage(): StoryRoom {
  const id = "story-torch-town-home-4" as RoomId;
  const displayLabel = "Rhett & Mira's Cottage";
  
  const npcs: NPC[] = [
    new NPC({ id: "npc-rhett", name: "Rhett", sprite: "/images/npcs/torch-town/rhett.png", y: 3, x: 2, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
    new NPC({ id: "npc-mira", name: "Mira", sprite: "/images/npcs/torch-town/mira.png", y: 3, x: 3, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Rhett and Mira appear here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-rhett": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-mira": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
