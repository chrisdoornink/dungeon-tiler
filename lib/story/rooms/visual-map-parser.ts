import { TileSubtype } from "../../map";

/**
 * Visual Map Parser - Shared utility for parsing visual map strings into game data
 * 
 * This parser converts human-readable ASCII maps into tile data, subtypes, enemies, and transitions.
 * Spaces in the visual map are ignored, allowing for flexible formatting.
 */

export interface ParsedMapData {
  tiles: number[][];
  subtypes: TileSubtype[][][];
  enemies: Array<{ y: number; x: number; kind: string }>;
  transitions: Map<string, Array<[number, number]>>;
}

/**
 * Parse a visual map into game-ready data structures
 * 
 * @param visualMap - Array of strings representing the map layout
 * @param width - Width of the map (number of columns)
 * @param height - Height of the map (number of rows), defaults to width for square maps
 * @returns Parsed map data with tiles, subtypes, enemies, and transitions
 */
export function parseVisualMap(visualMap: string[], width: number, height?: number): ParsedMapData {
  const tiles: number[][] = [];
  const subtypes: TileSubtype[][][] = [];
  const enemies: Array<{ y: number; x: number; kind: string }> = [];
  const transitions = new Map<string, Array<[number, number]>>();
  
  const actualHeight = height ?? width; // Use width if height not specified (square map)

  for (let y = 0; y < visualMap.length; y++) {
    const row = visualMap[y];
    const tileRow: number[] = [];
    const subtypeRow: TileSubtype[][] = [];

    // Ensure we process exactly WIDTH columns (pad with floor if needed)
    for (let x = 0; x < width; x++) {
      // Get character, skipping spaces (used for visual formatting only)
      let char = '.';
      let sourceIndex = 0;
      let tilesProcessed = 0;
      while (sourceIndex < row.length && tilesProcessed <= x) {
        const c = row[sourceIndex];
        if (c !== ' ') {
          if (tilesProcessed === x) {
            char = c;
            break;
          }
          tilesProcessed++;
        }
        sourceIndex++;
      }
      
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
        case 'h':
          tileType = 1; // wall tile (for house walls)
          break;
        case 'R':
          tileType = 4; // roof tile
          break;
        case '=':
          tileType = 0; // floor with road marker (shape auto-detected later)
          cellSubtypes.push(TileSubtype.ROAD);
          break;
        case 'C':
          tileType = 0; // floor with checkpoint
          cellSubtypes.push(TileSubtype.CHECKPOINT);
          break;
        case 'd':
          tileType = 1; // wall tile with door subtype
          cellSubtypes.push(TileSubtype.DOOR);
          break;
        case 'a':
          tileType = 0; // floor with bed empty variant 1
          cellSubtypes.push(TileSubtype.BED_EMPTY_1);
          break;
        case 'b':
          tileType = 0; // floor with bed empty variant 2
          cellSubtypes.push(TileSubtype.BED_EMPTY_2);
          break;
        case 'c':
          tileType = 0; // floor with bed empty variant 3
          cellSubtypes.push(TileSubtype.BED_EMPTY_3);
          break;
        case 'e':
          tileType = 0; // floor with bed empty variant 4
          cellSubtypes.push(TileSubtype.BED_EMPTY_4);
          break;
        case '!':
          tileType = 0; // floor with bed full variant 1
          cellSubtypes.push(TileSubtype.BED_FULL_1);
          break;
        case '~':
          tileType = 0; // floor with bed full variant 2
          cellSubtypes.push(TileSubtype.BED_FULL_2);
          break;
        case '^':
          tileType = 0; // floor with bed full variant 3
          cellSubtypes.push(TileSubtype.BED_FULL_3);
          break;
        case '*':
          tileType = 0; // floor with bed full variant 4
          cellSubtypes.push(TileSubtype.BED_FULL_4);
          break;
        case 'F':
          tileType = 5; // flowers tile
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
        case 'D':
        case 'E':
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
