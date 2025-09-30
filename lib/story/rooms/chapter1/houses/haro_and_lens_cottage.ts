import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildHouseInterior } from "./house_builder";

export function buildHaroAndLensCottage(): StoryRoom {
  const id = "story-torch-town-home-5" as RoomId;
  const displayLabel = "Haro & Len's Cottage";
  
  // Create NPCs for this house - they'll be shown/hidden based on time of day
  const npcs: NPC[] = [
    new NPC({
      id: "npc-haro",
      name: "Haro",
      sprite: "/images/npcs/torch-town/haro.png",
      y: 3, // Inside the house
      x: 2,
      facing: Direction.DOWN,
      canMove: false,
      metadata: { location: "house" },
    }),
    new NPC({
      id: "npc-len",
      name: "Len",
      sprite: "/images/npcs/torch-town/len.png",
      y: 3, // Inside the house
      x: 3,
      facing: Direction.DOWN,
      canMove: false,
      metadata: { location: "house" },
    }),
  ];
  
  const room = buildHouseInterior(id, 3, 2, "house", displayLabel, npcs);
  
  // Add conditional NPC visibility - Haro and Len appear here at night
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-haro": {
        showWhen: [{ timeOfDay: "night" }]
      },
      "npc-len": {
        showWhen: [{ timeOfDay: "night" }]
      }
    }
  };
  
  return room;
}
