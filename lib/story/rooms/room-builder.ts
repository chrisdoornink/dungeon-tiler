import { RoomId, TileSubtype } from "../../map";
import type { MapData } from "../../map/types";
import { Enemy } from "../../enemy";
import type { StoryRoom } from "./types";
import { parseVisualMap, type ParsedMapData } from "./visual-map-parser";

type EnemyKind = "goblin" | "snake" | "ghost" | "stone-exciter";
type EnvironmentId = "outdoor" | "indoor" | "cave" | "dungeon";

/**
 * Room Builder - Shared utility for building story rooms from configuration
 * 
 * This provides a consistent framework for creating rooms with visual maps,
 * transitions, enemies, and NPCs.
 */

export interface TransitionDefinition {
  roomId: RoomId;
  target: [number, number];
  returnPoint: [number, number];
}

export interface RoomConfig {
  id: string;
  size: number;
  visualMap: string[];
  transitions: Record<string, TransitionDefinition>;
  metadata: {
    displayLabel: string;
    description: string;
  };
  environment?: EnvironmentId;
  npcs?: any[]; // Can be typed more specifically when NPCs are added
}

/**
 * Build a StoryRoom from a configuration object
 * 
 * @param config - Room configuration with visual map, transitions, metadata, etc.
 * @returns Complete StoryRoom ready to use in the game
 */
export function buildRoom(config: RoomConfig): StoryRoom {
  const { id, size, visualMap, transitions: transitionDefs, metadata, environment = "outdoor", npcs = [] } = config;

  // Parse the visual map
  const parsedMap: ParsedMapData = parseVisualMap(visualMap, size);

  // Create map data
  const mapData: MapData = {
    tiles: parsedMap.tiles,
    subtypes: parsedMap.subtypes,
    environment,
  };

  // Create enemies from parsed data
  const enemies: Enemy[] = parsedMap.enemies.map(({ y, x, kind }) => {
    const enemy = new Enemy({ y, x });
    enemy.kind = kind as EnemyKind;
    return enemy;
  });

  // Find entry point (tile just above the bottom-most ROOM_TRANSITION)
  let entryPoint: [number, number] = [size - 2, 2];
  let bottomMost: [number, number] | null = null;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (mapData.subtypes[y]?.[x]?.includes(TileSubtype.ROOM_TRANSITION)) {
        if (!bottomMost || y > bottomMost[0]) {
          bottomMost = [y, x];
        }
      }
    }
  }
  
  if (bottomMost) {
    const [by, bx] = bottomMost;
    entryPoint = [Math.max(1, by - 1), bx];
  }

  // Build otherTransitions array from transition definitions and parsed positions
  const otherTransitions: Array<{
    roomId: RoomId;
    position: [number, number];
    targetEntryPoint: [number, number];
    returnEntryPoint: [number, number];
  }> = [];

  parsedMap.transitions.forEach((positions, transitionId) => {
    const transitionDef = transitionDefs[transitionId];
    if (transitionDef) {
      positions.forEach(([y, x]) => {
        otherTransitions.push({
          roomId: transitionDef.roomId,
          position: [y, x],
          targetEntryPoint: transitionDef.target as [number, number],
          returnEntryPoint: transitionDef.returnPoint as [number, number],
        });
      });
    }
  });

  return {
    id: id as RoomId,
    mapData,
    entryPoint,
    enemies,
    npcs,
    metadata,
    otherTransitions,
  };
}
