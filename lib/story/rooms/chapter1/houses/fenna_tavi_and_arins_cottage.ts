import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildFennaTaviAndArinsCottage(): StoryRoom {
  const id = "story-torch-town-home-6" as RoomId;
  const displayLabel = "Fenna, Tavi & Arin's Cottage";
  
  const npcs: NPC[] = [
    new NPC({ id: "npc-fenna", name: "Fenna", sprite: "/images/npcs/torch-town/fenna.png", y: 3, x: 2, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
    new NPC({ id: "npc-tavi", name: "Tavi", sprite: "/images/npcs/torch-town/tavi.png", y: 2, x: 3, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
    new NPC({ id: "npc-arin", name: "Arin", sprite: "/images/npcs/torch-town/arin.png", y: 3, x: 3, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Fenna, Tavi, and Arin appear here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-fenna": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-tavi": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-arin": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
