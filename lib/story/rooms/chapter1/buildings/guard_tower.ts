import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildGuardTower(): StoryRoom {
  const id = "story-torch-town-guard-tower" as RoomId;
  const displayLabel = "Guard Tower";
  
  // Create NPCs for the guard tower (inside building)
  // Captain Bren goes inside at night, Sela and Thane patrol outside
  const npcs: NPC[] = [
    new NPC({ id: "npc-captain-bren-inside", name: "Captain Bren", sprite: "/images/npcs/torch-town/captain-bren.png", y: 4, x: 2, facing: Direction.DOWN, canMove: false, metadata: { location: "guard-tower" } }),
  ];
  
  const room = buildBuildingInterior(id, 3, 4, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Captain appears here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-captain-bren-inside": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
