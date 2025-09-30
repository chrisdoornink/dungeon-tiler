import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildEldrasCottage(): StoryRoom {
  const id = "story-torch-town-home-0" as RoomId;
  const displayLabel = "Eldra's Cottage";
  
  // Create NPCs for this house - they'll be shown/hidden based on time of day
  const npcs: NPC[] = [
    new NPC({
      id: "npc-eldra",
      name: "Eldra",
      sprite: "/images/npcs/torch-town/eldra.png",
      y: 3,
      x: 2,
      facing: Direction.DOWN,
      canMove: false,
      metadata: { location: "house" },
    }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Eldra appears here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-eldra": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
