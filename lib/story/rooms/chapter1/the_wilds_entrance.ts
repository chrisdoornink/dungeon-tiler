import { FLOOR, WALL, TileSubtype, generateMap } from "../../../map";
import type { MapData } from "../../../map/types";
import { Enemy } from "../../../enemy";
import type { StoryRoom } from "../types";

const SIZE = 25;

/**
 * FIXED_ROOM_DATA: Set this to freeze a specific map + enemy layout permanently.
 * 
 * How to freeze a map you like:
 * 1. Enter The Wilds and play through the map
 * 2. If you like it, check DevTools Console - it auto-logs the room data
 * 3. Look for: "[The Wilds] Room data ready to freeze (copy command above)"
 * 4. Run the copy() command shown in the console
 * 5. Paste the result here as: const FIXED_ROOM_DATA = <paste>;
 * 6. Save this file and reload
 * 
 * The frozen room will have the same map layout AND enemy positions every time!
 * Set back to null to generate random maps again.
 */
const FIXED_ROOM_DATA: { mapData: MapData; enemies: Array<{ y: number; x: number; kind: string }> } | null = null;

// Example after pasting:
// const FIXED_ROOM_DATA = {
//   mapData: { tiles: [[...]], subtypes: [[...]] },
//   enemies: [{ y: 5, x: 10, kind: "goblin" }, ...]
// };

/**
 * Generate The Wilds map using the same generation as daily mode.
 * This ensures proper connectivity and environment.
 */
function generateWildsMap(): MapData {
  // If a fixed room is set, use its map data
  if (FIXED_ROOM_DATA) {
    console.log('[The Wilds] Using FIXED_ROOM_DATA - map and enemies are frozen');
    return FIXED_ROOM_DATA.mapData;
  }

  // Use the exact same generation as daily mode
  const tiles = generateMap();
  
  // Create subtypes array
  const subtypes: TileSubtype[][][] = Array(SIZE)
    .fill(0)
    .map(() =>
      Array(SIZE)
        .fill(0)
        .map(() => [])
    );

  // Place transition point on the bottom border (replace a wall tile)
  const entryY = SIZE - 1; // Bottom edge
  const entryX = 2; // A bit in from the corner
  
  // Replace the wall with floor for entry
  tiles[entryY][entryX] = FLOOR;
  subtypes[entryY][entryX] = [TileSubtype.ROOM_TRANSITION];
  
  // Carve a short corridor upward to ensure connectivity to the main dungeon
  for (let y = entryY - 1; y >= entryY - 4 && y >= 1; y--) {
    if (tiles[y][entryX] === FLOOR) {
      // Already connected to a floor, stop
      break;
    }
    tiles[y][entryX] = FLOOR;
    subtypes[y][entryX] = [];
  }

  // Place food pots (3-5 pots)
  const numPots = 3 + Math.floor(Math.random() * 3);
  let potsPlaced = 0;
  let potAttempts = 0;
  while (potsPlaced < numPots && potAttempts < 100) {
    const x = 1 + Math.floor(Math.random() * (SIZE - 2));
    const y = 1 + Math.floor(Math.random() * (SIZE - 2));
    if (tiles[y][x] === FLOOR && subtypes[y][x].length === 0) {
      subtypes[y][x] = [TileSubtype.POT, TileSubtype.FOOD];
      potsPlaced++;
    }
    potAttempts++;
  }

  return { tiles, subtypes };
}

/**
 * Place enemies randomly in the wilds (or use fixed positions if FIXED_ROOM_DATA is set)
 */
function generateWildsEnemies(mapData: MapData): Enemy[] {
  // If using fixed room data, recreate enemies from saved positions
  if (FIXED_ROOM_DATA) {
    return FIXED_ROOM_DATA.enemies.map(e => {
      const enemy = new Enemy({ y: e.y, x: e.x });
      enemy.kind = e.kind as "goblin" | "snake";
      return enemy;
    });
  }

  const enemies: Enemy[] = [];
  const floorTiles: Array<[number, number]> = [];

  // Collect all floor tiles (except entry point)
  for (let y = 0; y < mapData.tiles.length; y++) {
    for (let x = 0; x < mapData.tiles[y].length; x++) {
      if (
        mapData.tiles[y][x] === FLOOR &&
        !(y === SIZE - 1 && x === 1) && // Not the entry
        mapData.subtypes[y][x].length === 0 // Not on a pot
      ) {
        floorTiles.push([y, x]);
      }
    }
  }

  // Shuffle floor tiles
  for (let i = floorTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [floorTiles[i], floorTiles[j]] = [floorTiles[j], floorTiles[i]];
  }

  // Place 7 goblins
  for (let i = 0; i < 7 && i < floorTiles.length; i++) {
    const [y, x] = floorTiles[i];
    const goblin = new Enemy({ y, x });
    goblin.kind = "goblin";
    enemies.push(goblin);
  }

  // Place 2 snakes
  for (let i = 7; i < 9 && i < floorTiles.length; i++) {
    const [y, x] = floorTiles[i];
    const snake = new Enemy({ y, x });
    snake.kind = "snake";
    enemies.push(snake);
  }

  return enemies;
}

export function buildTheWildsEntrance(): StoryRoom {
  const mapData = generateWildsMap();
  
  // Find the entry point we marked in the map
  let entryPoint: [number, number] = [SIZE - 2, 1];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (mapData.subtypes[y][x].includes(TileSubtype.ROOM_TRANSITION)) {
        entryPoint = [y, x];
        break;
      }
    }
  }
  
  const enemies = generateWildsEnemies(mapData);

  // Auto-log the room data for easy freezing (only when generating randomly)
  if (!FIXED_ROOM_DATA && typeof window !== 'undefined') {
    const roomSnapshot = {
      mapData,
      enemies: enemies.map(e => ({ y: e.y, x: e.x, kind: e.kind }))
    };
    
    console.log(
      '%c[The Wilds] Generated new random room. To freeze this layout, run:',
      'color: #4CAF50; font-weight: bold'
    );
    console.log(
      '%ccopy(JSON.stringify(' + JSON.stringify(roomSnapshot) + '))',
      'background: #f0f0f0; padding: 8px; border-radius: 4px; font-family: monospace'
    );
    console.log(
      '%c[The Wilds] Room data ready to freeze (copy command above)',
      'color: #2196F3; font-weight: bold'
    );
  }

  return {
    id: "story-the-wilds-entrance",
    mapData: { ...mapData, environment: "outdoor" },
    entryPoint,
    enemies,
    npcs: [],
    metadata: {
      displayLabel: "The Wilds — Entrance",
      description: "A dangerous wilderness area teeming with hostile creatures.",
    },
  };
}
