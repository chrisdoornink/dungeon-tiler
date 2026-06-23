import { FLOOR, TREE, TileSubtype, Direction } from "./constants";
import type { MapData } from "./types";
import type { PlainEnemy } from "../enemy";

/** Number of stone goblins waiting at the far end of an outside-world area. */
export const OUTSIDE_GOBLIN_COUNT = 5;

/** Which edge of the outside map faces back toward the dungeon. */
type InnerEdge = "top" | "bottom" | "left" | "right";

/**
 * The dungeon lies opposite the direction the player stepped: stepping RIGHT out of
 * the dungeon puts the dungeon to this world's LEFT, so the inner (dungeon-facing)
 * edge is the left column.
 */
function innerEdgeForDirection(direction: Direction): InnerEdge {
  switch (direction) {
    case Direction.UP:
      return "bottom";
    case Direction.DOWN:
      return "top";
    case Direction.LEFT:
      return "right";
    case Direction.RIGHT:
    default:
      return "left";
  }
}

/**
 * Build a finite open-grassland map reached by blowing a hole in the dungeon's outer
 * wall and stepping out. The edge facing the dungeon is an open BREACH the player can
 * walk back through; the other three sides are bounded by trees. A cluster of stone
 * goblins waits at the far end — there is no reward out here, only escalating danger.
 *
 * @param direction the outward direction the player stepped through the breach
 * @param width grid width (mirrors the dungeon floor)
 * @param height grid height (mirrors the dungeon floor)
 */
export function buildOutsideWorld(
  direction: Direction,
  width: number,
  height: number
): { mapData: MapData; enemies: PlainEnemy[]; entry: [number, number] } {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < height; y++) {
    tiles.push(new Array(width).fill(FLOOR));
    subtypes.push(Array.from({ length: width }, () => [] as number[]));
  }

  const inner = innerEdgeForDirection(direction);
  const lastY = height - 1;
  const lastX = width - 1;

  // Tree boundary on the three non-inner sides (corners included).
  for (let x = 0; x < width; x++) {
    if (inner !== "top") tiles[0][x] = TREE;
    if (inner !== "bottom") tiles[lastY][x] = TREE;
  }
  for (let y = 0; y < height; y++) {
    if (inner !== "left") tiles[y][0] = TREE;
    if (inner !== "right") tiles[y][lastX] = TREE;
  }

  // Open the inner edge (FLOOR + BREACH) along its interior span so the player can
  // walk back into the dungeon; the two corners stay as tree boundary.
  const markBreach = (y: number, x: number) => {
    tiles[y][x] = FLOOR;
    if (!subtypes[y][x].includes(TileSubtype.BREACH)) {
      subtypes[y][x].push(TileSubtype.BREACH);
    }
  };
  if (inner === "top" || inner === "bottom") {
    const y = inner === "top" ? 0 : lastY;
    for (let x = 1; x < lastX; x++) markBreach(y, x);
  } else {
    const x = inner === "left" ? 0 : lastX;
    for (let y = 1; y < lastY; y++) markBreach(y, x);
  }

  // Player entry: one tile inward from the centre of the inner edge.
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  let entry: [number, number];
  switch (inner) {
    case "top":
      entry = [1, midX];
      break;
    case "bottom":
      entry = [lastY - 1, midX];
      break;
    case "left":
      entry = [midY, 1];
      break;
    case "right":
    default:
      entry = [midY, lastX - 1];
      break;
  }

  // Stone goblins clustered just inside the far edge (opposite the inner edge),
  // spread evenly so the player walking outward eventually meets all of them.
  const enemies: PlainEnemy[] = [];
  const spread = (count: number, span: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      out.push(Math.max(1, Math.min(span - 2, Math.round(t * (span - 1)))));
    }
    return out;
  };
  if (inner === "top" || inner === "bottom") {
    const farY = inner === "top" ? lastY - 1 : 1;
    for (const x of spread(OUTSIDE_GOBLIN_COUNT, width)) {
      enemies.push({ y: farY, x, kind: "stone-goblin" });
    }
  } else {
    const farX = inner === "left" ? lastX - 1 : 1;
    for (const y of spread(OUTSIDE_GOBLIN_COUNT, height)) {
      enemies.push({ y, x: farX, kind: "stone-goblin" });
    }
  }

  const mapData: MapData = { tiles, subtypes, environment: "outdoor" };
  return { mapData, enemies, entry };
}
