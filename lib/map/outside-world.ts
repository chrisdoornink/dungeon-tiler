import { FLOOR, WALL, TREE, TileSubtype, Direction } from "./constants";
import type { MapData } from "./types";
import type { PlainEnemy } from "../enemy";

/** Number of stone goblins waiting at the far end of an outside-world area. */
export const OUTSIDE_GOBLIN_COUNT = 5;

/**
 * How many tiles thick the tree boundary is on each non-inner side. Trees ARE destructible
 * by bombs (a blast clears a 3x3 area), but a player only ever carries two bombs out here
 * and each bomb only chews ~1 layer deep, so a 3-tile-thick wall can't be tunnelled all the
 * way through — keeping the player off the map edge, where movement/rendering broke down.
 */
export const TREE_BORDER = 3;

/** Which edge of the outside map faces back toward the dungeon. */
export type InnerEdge = "top" | "bottom" | "left" | "right";

/**
 * The dungeon lies opposite the direction the player stepped: stepping RIGHT out of
 * the dungeon puts the dungeon to this world's LEFT, so the inner (dungeon-facing)
 * edge is the left column.
 */
export function innerEdgeForDirection(direction: Direction): InnerEdge {
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

  // Tree boundary on the three non-inner sides (corners included), TREE_BORDER tiles
  // thick so the player can never bomb their way out to the map edge.
  for (let b = 0; b < TREE_BORDER; b++) {
    for (let x = 0; x < width; x++) {
      if (inner !== "top") tiles[b][x] = TREE;
      if (inner !== "bottom") tiles[lastY - b][x] = TREE;
    }
    for (let y = 0; y < height; y++) {
      if (inner !== "left") tiles[y][b] = TREE;
      if (inner !== "right") tiles[y][lastX - b] = TREE;
    }
  }

  // Open the inner edge (FLOOR + BREACH) along its interior span so the player can
  // walk back into the dungeon; the two corners stay as tree boundary.
  const markBreach = (y: number, x: number) => {
    tiles[y][x] = FLOOR;
    if (!subtypes[y][x].includes(TileSubtype.BREACH)) {
      subtypes[y][x].push(TileSubtype.BREACH);
    }
  };
  // The open span runs between the thick side borders so it doesn't punch through them.
  if (inner === "top" || inner === "bottom") {
    const y = inner === "top" ? 0 : lastY;
    for (let x = TREE_BORDER; x <= lastX - TREE_BORDER; x++) markBreach(y, x);
  } else {
    const x = inner === "left" ? 0 : lastX;
    for (let y = TREE_BORDER; y <= lastY - TREE_BORDER; y++) markBreach(y, x);
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
  // Spread `count` positions evenly across the inclusive [lo, hi] range.
  const spread = (count: number, lo: number, hi: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      out.push(Math.max(lo, Math.min(hi, Math.round(lo + t * (hi - lo)))));
    }
    return out;
  };
  if (inner === "top" || inner === "bottom") {
    // Just inside the thick far border, on the first playable row.
    const farY = inner === "top" ? lastY - TREE_BORDER : TREE_BORDER;
    for (const x of spread(OUTSIDE_GOBLIN_COUNT, TREE_BORDER, lastX - TREE_BORDER)) {
      enemies.push({ y: farY, x, kind: "stone-goblin" });
    }
  } else {
    const farX = inner === "left" ? lastX - TREE_BORDER : TREE_BORDER;
    for (const y of spread(OUTSIDE_GOBLIN_COUNT, TREE_BORDER, lastY - TREE_BORDER)) {
      enemies.push({ y, x: farX, kind: "stone-goblin" });
    }
  }

  const mapData: MapData = { tiles, subtypes, environment: "outdoor" };
  return { mapData, enemies, entry };
}

/**
 * Build the pink realm's "nightmare room": the realm equivalent of the outside world,
 * reached by bombing a hole in the realm's outer wall and stepping through. It is a
 * cave-environment room rendered pitch-black (the caller snuffs the hero's torch on
 * entry), so only the tiles immediately around the hero are dimly lit and nothing else
 * — including any danger — is visible. There are no enemies and no reward: the darkness
 * itself is the threat (the caller drains the hero the deeper they wander). The inner
 * (realm-facing) edge is an open BREACH the player walks back through to return.
 */
export function buildNightmareRoom(
  direction: Direction,
  width: number,
  height: number
): { mapData: MapData; entry: [number, number] } {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < height; y++) {
    tiles.push(new Array(width).fill(FLOOR));
    subtypes.push(Array.from({ length: width }, () => [] as number[]));
  }

  const inner = innerEdgeForDirection(direction);
  const lastY = height - 1;
  const lastX = width - 1;

  // Solid wall boundary on the three non-inner sides (unseen in the dark; the hazard
  // kills long before the hero could reach them anyway).
  for (let x = 0; x < width; x++) {
    if (inner !== "top") tiles[0][x] = WALL;
    if (inner !== "bottom") tiles[lastY][x] = WALL;
  }
  for (let y = 0; y < height; y++) {
    if (inner !== "left") tiles[y][0] = WALL;
    if (inner !== "right") tiles[y][lastX] = WALL;
  }

  // Open the inner edge (FLOOR + BREACH) so the player can walk back into the realm.
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

  // pink_realm floor (the nightmare is part of the realm), rendered dark + swirly by the
  // nightmare lighting in TilemapGrid.
  const mapData: MapData = { tiles, subtypes, environment: "pink_realm" };
  return { mapData, entry };
}
