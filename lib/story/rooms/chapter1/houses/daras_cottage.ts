import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildDarasCottage(): StoryRoom {
  const id = "story-torch-town-home-7" as RoomId;
  const displayLabel = "Dara's Cottage";
  
  const npcs: NPC[] = [
    new NPC({ id: "npc-dara", name: "Dara", sprite: "/images/npcs/torch-town/dara.png", y: 3, x: 2, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Dara appears here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-dara": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
