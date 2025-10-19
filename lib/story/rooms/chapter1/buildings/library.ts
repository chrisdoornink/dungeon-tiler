import type { RoomId } from "../../../../map";
import { Direction, TileSubtype } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildLibrary(): StoryRoom {
  const id = "story-torch-town-library" as RoomId;
  const displayLabel = "Library";
  
  const room = buildBuildingInterior(id, 5, 4, "house", displayLabel, []);
  
  // Add bookshelves as overlays on floor tiles
  // Top row (1, 1-9)
  for (let x = 1; x <= 9; x++) {
    room.mapData.subtypes[1][x] = [TileSubtype.BOOKSHELF];
  }
  
  // Middle row left side (4, 1-3)
  for (let x = 1; x <= 3; x++) {
    room.mapData.subtypes[4][x] = [TileSubtype.BOOKSHELF];
  }
  
  // Middle row right side (4, 7-9)
  for (let x = 7; x <= 9; x++) {
    room.mapData.subtypes[4][x] = [TileSubtype.BOOKSHELF];
  }
  
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
