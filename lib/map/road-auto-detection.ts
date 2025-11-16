import { TileSubtype } from "./constants";
import { placeCorner, placeT, placeEnd, placeStraight, layCircularHubIntersection, type Dir } from "./roads";

/**
 * Automatically detects and applies road shapes based on adjacent road tiles.
 * Call this after parsing a visual map that uses 'R' markers for roads.
 */
export function autoDetectRoadShapes(tiles: number[][], subtypes: number[][][]): void {
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      // Check if this tile has the ROAD subtype marker but no shape yet
      const subs = subtypes[y]?.[x] || [];
      const hasRoadMarker = subs.includes(TileSubtype.ROAD);
      const hasRoadShape = subs.includes(TileSubtype.ROAD_STRAIGHT) || 
                           subs.includes(TileSubtype.ROAD_CORNER) || 
                           subs.includes(TileSubtype.ROAD_T) || 
                           subs.includes(TileSubtype.ROAD_END);
      
      if (hasRoadMarker && !hasRoadShape) {
        // Check all 4 neighbors for roads OR checkpoints (treat checkpoints as roads for connectivity)
        const hasNorth = (subtypes[y - 1]?.[x]?.includes(TileSubtype.ROAD) || subtypes[y - 1]?.[x]?.includes(TileSubtype.CHECKPOINT)) ?? false;
        const hasEast = (subtypes[y]?.[x + 1]?.includes(TileSubtype.ROAD) || subtypes[y]?.[x + 1]?.includes(TileSubtype.CHECKPOINT)) ?? false;
        const hasSouth = (subtypes[y + 1]?.[x]?.includes(TileSubtype.ROAD) || subtypes[y + 1]?.[x]?.includes(TileSubtype.CHECKPOINT)) ?? false;
        const hasWest = (subtypes[y]?.[x - 1]?.includes(TileSubtype.ROAD) || subtypes[y]?.[x - 1]?.includes(TileSubtype.CHECKPOINT)) ?? false;
        
        // Count connections
        const connections = [hasNorth, hasEast, hasSouth, hasWest].filter(Boolean).length;
        
        // Determine shape based on connections
        if (connections === 0) {
          // Isolated road tile - treat as end pointing down
          placeEnd(tiles, subtypes, y, x, "N");
        } else if (connections === 1) {
          // End piece
          const dir = getEndDirection(hasNorth, hasEast, hasSouth, hasWest);
          placeEnd(tiles, subtypes, y, x, dir);
        } else if (connections === 2) {
          // Either straight or corner
          if ((hasNorth && hasSouth) || (hasEast && hasWest)) {
            // Straight
            const rot = (hasNorth && hasSouth) ? 90 : 0;
            placeStraight(tiles, subtypes, y, x, rot);
          } else {
            // Corner
            const dirs = getCornerDirs(hasNorth, hasEast, hasSouth, hasWest);
            placeCorner(tiles, subtypes, y, x, dirs);
          }
        } else if (connections === 3) {
          // T-intersection
          const dirs = getTDirs(hasNorth, hasEast, hasSouth, hasWest);
          placeT(tiles, subtypes, y, x, dirs);
        } else if (connections === 4) {
          // 4-way intersection - use two perpendicular straight pieces
          // This creates a simple cross without the large circular hub
          placeStraight(tiles, subtypes, y, x, 0); // Horizontal
          placeStraight(tiles, subtypes, y, x, 90); // Vertical (will layer on top)
        }
      }
    }
  }
}

function getEndDirection(n: boolean, e: boolean, s: boolean, w: boolean): Dir {
  // End points in the direction WHERE it connects (the open end faces the connection)
  if (n) return "N"; // Connects north, open end faces north
  if (e) return "E"; // Connects east, open end faces east
  if (s) return "S"; // Connects south, open end faces south
  return "W"; // Connects west, open end faces west
}

function getCornerDirs(n: boolean, e: boolean, s: boolean, w: boolean): [Dir, Dir] {
  if (n && e) return ["N", "E"];
  if (e && s) return ["E", "S"];
  if (s && w) return ["S", "W"];
  return ["W", "N"]; // n && w
}

function getTDirs(n: boolean, e: boolean, s: boolean, w: boolean): [Dir, Dir, Dir] {
  // T-intersection connects in 3 directions
  if (!n) return ["E", "S", "W"]; // Missing north
  if (!e) return ["N", "S", "W"]; // Missing east
  if (!s) return ["N", "E", "W"]; // Missing south
  return ["N", "E", "S"]; // Missing west
}
