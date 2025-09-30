import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildMaroAndKirasCottage(): StoryRoom {
  const id = "story-torch-town-home-1" as RoomId;
  const displayLabel = "Maro & Kira's Cottage";
  
  // Create NPCs for this house
  const npcs: NPC[] = [
    new NPC({
      id: "npc-maro",
      name: "Maro",
      sprite: "/images/npcs/torch-town/maro.png",
      y: 3,
      x: 2,
      facing: Direction.DOWN,
      canMove: false,
      metadata: { location: "house" },
    }),
    new NPC({
      id: "npc-kira",
      name: "Kira",
      sprite: "/images/npcs/torch-town/kira.png",
      y: 3,
      x: 3,
      facing: Direction.DOWN,
      canMove: false,
      metadata: { location: "house" },
    }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Maro and Kira appear here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-maro": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-kira": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
