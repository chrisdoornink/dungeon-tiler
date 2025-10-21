import { FLOOR, RoomId, TileSubtype, generateMap } from "../../../map";
import type { MapData } from "../../../map/types";
import { Enemy } from "../../../enemy";
import type { StoryRoom } from "../types";

const SIZE = 25;

/**
 * Transition definitions - maps transition IDs to their destinations
 * Each transition in the visual map (0-9, A-Z) references a key here
 */
const TRANSITIONS = {
  // Torch Town connections (left edge, rows 19-23)
  '0': { roomId: 'story-torch-town' as RoomId, target: [10, 33], returnPoint: [19, 1] },
  '1': { roomId: 'story-torch-town' as RoomId, target: [11, 33], returnPoint: [20, 1] },
  '2': { roomId: 'story-torch-town' as RoomId, target: [12, 33], returnPoint: [21, 1] },
  '3': { roomId: 'story-torch-town' as RoomId, target: [13, 33], returnPoint: [22, 1] },
  '4': { roomId: 'story-torch-town' as RoomId, target: [14, 33], returnPoint: [23, 1] },
  
  // Future transitions can be added here with letters or other numbers
  // 'A': { roomId: 'story-deep-wilds', target: [5, 5], returnPoint: [24, 12] },
} as const;

/**
 * Visual map layout using readable symbols.
 * Legend:
 * - '.' = floor (0)
 * - '#' = wall (1)
 * - 'T' = tree (6)
 * - 'G' = goblin enemy
 * - 'S' = snake enemy
 * - 'W' = wisp (ghost) enemy
 * - '@' = town sign (subtype)
 * - 'f' = torch on floor tile
 * - 'w' = torch on wall tile
 * - 'r' = pot with rune inside
 * - 'p' = pot with food inside
 * - 's' = pot with snake inside
 * 
 * Transitions (use keys from TRANSITIONS object above):
 * - '0', '1', '2', '3', '4' = Torch Town connections (rows 19-23)
 * - '5'-'9', 'A'-'Z' = available for future areas
 */
const VISUAL_MAP = [
  "##TTTTTTTTTTTTTTTTTT.TTTT",
  "##T.TTTTT.T.###TTTTTWTTTTT",
  "##f.TTTT..T.#.#TTTT..TTTTT",
  "##.......T.....TTT..TTTTTT",
  "##......TT.............WTT",
  "##TT....T..............##T",
  "##f.....................T",
  "##......TTT....#.#.....T",
  "##......TTT..TTT.#.....T",
  "##...#..T.....TT..#....T",
  "##fG.G#.T.......#...#..T",
  "##....#.T...........#..T",
  "##..G...T.....######.##.",
  "##....#.......#..#...T",
  "##f...#.....#####....T",
  "##..##.......#.##..T#T",
  "##.....T.####.....TT#T",
  "##..#.####.T....######T",
  "wwf........#...........#T",
  "0@..........#..........T",
  "1..TT.TT...T.TT###....#T",
  "2.........#.......#.#..T",
  "3....T..#...TT..T.T..TTT",
  "4f...T.T..T.TTT.TT.TT..T",
  "##TTTTTTTTTTTTT.TTTTTTTT",
  "##T.TTTTT.T.###........pTT",
  "##f.TTTT..T.#r#.........TT",
  "##.......T..#.#TTT.TTTTTT#"
];

/**
 * Parse the visual map into tiles, subtypes, and enemies
 */
function parseVisualMap(visualMap: string[]): {
  tiles: number[][];
  subtypes: TileSubtype[][][];
  enemies: Array<{ y: number; x: number; kind: string }>;
  transitions: Map<string, Array<[number, number]>>; // transitionId -> array of [y, x] positions
} {
  const tiles: number[][] = [];
  const subtypes: TileSubtype[][][] = [];
  const enemies: Array<{ y: number; x: number; kind: string }> = [];
  const transitions = new Map<string, Array<[number, number]>>();

  for (let y = 0; y < visualMap.length; y++) {
    const row = visualMap[y];
    const tileRow: number[] = [];
    const subtypeRow: TileSubtype[][] = [];

    // Ensure we process exactly SIZE columns (pad with floor if needed)
    for (let x = 0; x < SIZE; x++) {
      const char = x < row.length ? row[x] : '.'; // Default to floor if row is short
      let tileType = 0; // default to floor
      const cellSubtypes: TileSubtype[] = [];

      switch (char) {
        case '.':
          tileType = 0; // floor
          break;
        case '#':
          tileType = 1; // wall
          break;
        case 'T':
          tileType = 6; // tree
          break;
        case 'G':
          tileType = 0; // floor with goblin
          enemies.push({ y, x, kind: 'goblin' });
          break;
        case 'S':
          tileType = 0; // floor with snake
          enemies.push({ y, x, kind: 'snake' });
          break;
        case 'W':
          tileType = 0; // floor with wisp (ghost)
          enemies.push({ y, x, kind: 'ghost' });
          break;
        case '@':
          tileType = 0; // floor with town sign
          cellSubtypes.push(TileSubtype.TOWN_SIGN);
          break;
        case 'f':
          tileType = 0; // floor with torch
          cellSubtypes.push(TileSubtype.WALL_TORCH);
          break;
        case 'w':
          tileType = 1; // wall with torch
          cellSubtypes.push(TileSubtype.WALL_TORCH);
          break;
        case 'r':
          tileType = 0; // floor with pot containing rune
          cellSubtypes.push(TileSubtype.POT);
          cellSubtypes.push(TileSubtype.RUNE);
          break;
        case 'p':
          tileType = 0; // floor with pot containing food
          cellSubtypes.push(TileSubtype.POT);
          cellSubtypes.push(TileSubtype.FOOD);
          break;
        case 's':
          tileType = 0; // floor with pot containing snake
          cellSubtypes.push(TileSubtype.POT);
          cellSubtypes.push(TileSubtype.SNAKE);
          break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
        case 'A':
        case 'B':
        case 'C':
        case 'D':
        case 'E':
        case 'F':
        case 'H':
        case 'I':
        case 'J':
        case 'K':
        case 'L':
        case 'M':
        case 'N':
        case 'O':
        case 'P':
        case 'Q':
        case 'R':
        case 'U':
        case 'V':
        case 'X':
        case 'Y':
        case 'Z':
          tileType = 0; // floor with room transition
          cellSubtypes.push(TileSubtype.ROOM_TRANSITION);
          // Track this transition position
          if (!transitions.has(char)) {
            transitions.set(char, []);
          }
          transitions.get(char)!.push([y, x]);
          break;
        default:
          tileType = 0; // default to floor for unknown chars
      }

      tileRow.push(tileType);
      subtypeRow.push(cellSubtypes);
    }

    tiles.push(tileRow);
    subtypes.push(subtypeRow);
  }

  return { tiles, subtypes, enemies, transitions };
}

const PARSED_MAP = parseVisualMap(VISUAL_MAP);

/**
 * FIXED_ROOM_DATA: Set this to freeze a specific map + enemy layout permanently.
 * 
 * This map has been customized with tree borders (tile type 6).
 * Trees act as non-walkable obstacles with grass floor backgrounds.
 */
const FIXED_ROOM_DATA: { mapData: MapData; enemies: Array<{ y: number; x: number; kind: string }> } | null = {
  mapData: {
    tiles: PARSED_MAP.tiles,
    subtypes: PARSED_MAP.subtypes
  },
  enemies: PARSED_MAP.enemies
};

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

/**
 * Place 20 rocks randomly in the wilds (or use fixed positions if FIXED_ROOM_DATA is set)
 */
function generateRocks(mapData: MapData): TileSubtype[][][] {
    // Add 20 rocks randomly on empty floor tiles (non-blocking variety)
    const { tiles, subtypes } = mapData;
    const want = 20;
    let placed = 0;
    const rand = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;
    for (let attempts = 0; attempts < 500 && placed < want; attempts++) {
      const y = rand(1, mapData.tiles.length - 2);
      const x = rand(1, mapData.tiles[y].length - 2);
      if (tiles[y][x] !== FLOOR) continue;
      if (subtypes[y][x].length > 0) continue; // keep clear of other features/NPCs/etc
      subtypes[y][x] = [TileSubtype.ROCK];
      placed++;
    }
    
    return subtypes;
}

export function buildTheWildsEntrance(): StoryRoom {
  const mapData = generateWildsMap();

  // Transitions are now defined in the visual map using numbers (0-9)
  // No need for hardcoded transition logic - they're already in the parsed map!
  
  // Find the entry point: choose the tile just above the bottom-most ROOM_TRANSITION
  let entryPoint: [number, number] = [SIZE - 2, 2];
  let bottomMost: [number, number] | null = null;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
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
  
  const enemies = generateWildsEnemies(mapData);

  const rocks = generateRocks(mapData);

  // Build otherTransitions array from TRANSITIONS map and parsed positions
  const otherTransitions: Array<{
    roomId: RoomId;
    position: [number, number];
    targetEntryPoint: [number, number];
    returnEntryPoint: [number, number];
  }> = [];

  PARSED_MAP.transitions.forEach((positions, transitionId) => {
    const transitionDef = TRANSITIONS[transitionId as keyof typeof TRANSITIONS];
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
    otherTransitions, // Dynamically generated from TRANSITIONS map
  };
}
