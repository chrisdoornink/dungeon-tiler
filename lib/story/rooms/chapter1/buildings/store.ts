import { Direction } from "../../../../map";
import type { RoomId } from "../../../../map";
import type { StoryRoom } from "../../types";
import { NPC } from "../../../../npc";
import { buildBuildingInterior } from "./building_builder";

export function buildStore(): StoryRoom {
  const id = "story-torch-town-store" as RoomId;
  const displayLabel = "Store";
  
  // Maro the storekeeper
  const maro = new NPC({
    id: "npc-maro",
    name: "Maro",
    sprite: "/images/npcs/torch-town/maro.png",
    y: 2,
    x: 2,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "store" },
  });
  
  const npcs: NPC[] = [maro];
  
  return buildBuildingInterior(id, 4, 3, "house", displayLabel, npcs);
}
