import { RoomId, TileSubtype, FLOOR } from "../../map";
import type { MapData } from "../../map/types";
import { Enemy } from "../../enemy";
import type { StoryRoom } from "./types";
import { parseVisualMap, type ParsedMapData } from "./visual-map-parser";
import type { EnvironmentId } from "../../environment";

type EnemyKind = "goblin" | "snake" | "ghost" | "stone-exciter";

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

export interface RandomItemPlacement {
  subtype: TileSubtype;
  count: number;
}

export interface RoomConfig {
  id: string;
  size: number | [number, number]; // Single number for square, or [width, height] for rectangular
  visualMap: string[];
  transitions: Record<string, TransitionDefinition>;
  metadata: {
    displayLabel?: string;
    description?: string;
    conditionalNpcs?: Record<string, { removeWhen?: Array<{ eventId: string; value: boolean }>; showWhen?: Array<{ eventId: string; value: boolean }> }>;
    onRoomEnter?: { effects: Array<{ eventId: string; value: boolean }> };
    archetype?: string;
    location?: string;
    dayLocation?: string;
    nightLocation?: string;
    house?: string;
    behavior?: string;
    homes?: Record<string, unknown>;
    buildings?: Record<string, unknown>;
  };
  environment?: EnvironmentId;
  npcs?: unknown[]; // Can be typed more specifically when NPCs are added
  randomItems?: RandomItemPlacement[]; // Items to randomly place on empty floor tiles
}

/**
 * Build a StoryRoom from a configuration object
 * 
 * @param config - Room configuration with visual map, transitions, metadata, etc.
 * @returns Complete StoryRoom ready to use in the game
 */
export function buildRoom(config: RoomConfig): StoryRoom {
  const { id, size, visualMap, transitions: transitionDefs, metadata, environment = "outdoor", npcs = [], randomItems = [] } = config;

  // Handle both square (number) and rectangular ([width, height]) sizes
  const width = Array.isArray(size) ? size[0] : size;
  const height = Array.isArray(size) ? size[1] : size;

  // Parse the visual map
  const parsedMap: ParsedMapData = parseVisualMap(visualMap, width, height);

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

  // Place random items on empty floor tiles
  if (randomItems.length > 0) {
    placeRandomItems(mapData, enemies, randomItems);
  }

  // Find entry point (tile just above the bottom-most ROOM_TRANSITION)
  let entryPoint: [number, number] = [height - 2, 2];
  let transitionToPrevious: [number, number] | undefined = undefined;
  let entryFromNext: [number, number] | undefined = undefined;
  let bottomMost: [number, number] | null = null;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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
    transitionToPrevious = [by, bx];
    entryFromNext = [Math.max(1, by - 2), bx];
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
    transitionToPrevious,
    entryFromNext,
    enemies,
    npcs: npcs as StoryRoom['npcs'],
    metadata,
    otherTransitions,
  };
}

/**
 * Place random items on empty floor tiles
 * 
 * @param mapData - The map data to modify
 * @param enemies - Array of enemies to avoid placing items on
 * @param randomItems - Array of item placements to perform
 */
function placeRandomItems(
  mapData: MapData,
  enemies: Enemy[],
  randomItems: RandomItemPlacement[]
): void {
  const size = mapData.tiles.length;
  
  // Find all empty floor tiles (floor with no subtypes, no enemies)
  const emptyFloorTiles: Array<[number, number]> = [];
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Check if it's a floor tile
      if (mapData.tiles[y][x] !== FLOOR) continue;
      
      // Check if it has no subtypes (or only empty array)
      const subtypes = mapData.subtypes[y]?.[x] || [];
      if (subtypes.length > 0) continue;
      
      // Check if there's no enemy on this tile
      const hasEnemy = enemies.some(e => e.y === y && e.x === x);
      if (hasEnemy) continue;
      
      emptyFloorTiles.push([y, x]);
    }
  }
  
  // Shuffle the empty floor tiles for random placement
  const shuffled = [...emptyFloorTiles].sort(() => Math.random() - 0.5);
  
  // Place each type of random item
  let tileIndex = 0;
  for (const { subtype, count } of randomItems) {
    for (let i = 0; i < count && tileIndex < shuffled.length; i++) {
      const [y, x] = shuffled[tileIndex];
      
      // Initialize subtypes array if needed
      if (!mapData.subtypes[y]) {
        mapData.subtypes[y] = [];
      }
      if (!mapData.subtypes[y][x]) {
        mapData.subtypes[y][x] = [];
      }
      
      // Add the subtype
      mapData.subtypes[y][x].push(subtype);
      
      tileIndex++;
    }
  }
}
