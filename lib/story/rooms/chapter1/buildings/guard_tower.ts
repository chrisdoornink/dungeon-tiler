import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildGuardTower(): StoryRoom {
  const id = "story-torch-town-guard-tower" as RoomId;
  const displayLabel = "Guard Tower";
  
  // Create NPCs for the guard tower
  const npcs: NPC[] = [
    new NPC({ id: "npc-captain-bren", name: "Captain Bren", sprite: "/images/npcs/torch-town/captain-bren.png", y: 4, x: 2, facing: Direction.DOWN, canMove: false, metadata: { location: "guard-tower" } }),
    new NPC({ id: "npc-sela", name: "Sela", sprite: "/images/npcs/torch-town/sela.png", y: 4, x: 3, facing: Direction.DOWN, canMove: false, metadata: { location: "guard-tower" } }),
    new NPC({ id: "npc-thane", name: "Thane", sprite: "/images/npcs/torch-town/thane.png", y: 4, x: 4, facing: Direction.DOWN, canMove: false, metadata: { location: "guard-tower" } }),
  ];
  
  const room = buildBuildingInterior(id, 3, 4, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Guards appear here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-captain-bren": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-sela": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-thane": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
