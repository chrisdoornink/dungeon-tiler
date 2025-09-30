import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildJorinAndYannasCottage(): StoryRoom {
  const id = "story-torch-town-home-2" as RoomId;
  const displayLabel = "Jorin & Yanna's Cottage";
  
  const npcs: NPC[] = [
    new NPC({ id: "npc-jorin", name: "Jorin", sprite: "/images/npcs/torch-town/jorin.png", y: 3, x: 2, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
    new NPC({ id: "npc-yanna", name: "Yanna", sprite: "/images/npcs/torch-town/yanna.png", y: 3, x: 3, facing: Direction.DOWN, canMove: false, metadata: { location: "house" } }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Jorin and Yanna appear here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-jorin": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-yanna": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
