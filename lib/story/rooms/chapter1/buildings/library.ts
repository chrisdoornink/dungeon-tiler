import type { RoomId } from "../../../../map";
import { Direction } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildLibrary(): StoryRoom {
  const id = "story-torch-town-library" as RoomId;
  const displayLabel = "Library";
  
  const room = buildBuildingInterior(id, 5, 4, "house", displayLabel, []);
  
  // Place Eldra (the librarian) inside during the day
  const eldraY = Math.max(2, room.entryPoint[0] - 2);
  const eldraX = room.entryPoint[1];
  const eldra = new NPC({
    id: "npc-eldra",
    name: "Eldra",
    sprite: "/images/npcs/torch-town/eldra.png",
    y: eldraY,
    x: eldraX,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "library", nightLocation: "house1" },
  });
  
  room.npcs = [eldra];
  
  // Only show Eldra during the day (she goes home at night)
  room.metadata = {
    ...room.metadata,
    conditionalNpcs: {
      "npc-eldra": { removeWhen: [{ timeOfDay: "night" }] },
    },
  };
  
  return room;
}
