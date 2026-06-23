import { FLOOR, FLOWERS, TileSubtype } from "./constants";
import type { MapData } from "./types";

function isWalkable(t: number): boolean {
  return t === FLOOR || t === FLOWERS;
}

/** Nearest walkable tile to (y0,x0), searched in expanding rings. */
function nearestWalkable(
  tiles: number[][],
  y0: number,
  x0: number
): [number, number] {
  const H = tiles.length;
  const W = tiles[0]?.length ?? 0;
  const inb = (y: number, x: number) => y >= 0 && y < H && x >= 0 && x < W;
  if (inb(y0, x0) && isWalkable(tiles[y0][x0])) return [y0, x0];
  for (let r = 1; r < Math.max(H, W); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
        const y = y0 + dy;
        const x = x0 + dx;
        if (inb(y, x) && isWalkable(tiles[y][x])) return [y, x];
      }
    }
  }
  return [y0, x0];
}

/**
 * Build the (prototype) pink realm: a mirrored reflection of the room the player came
 * from, recolored to the pink_realm environment, emptied of items/enemies, with a single
 * return ring placed near the entry. Placeholder content — what the realm ultimately
 * holds (a designed room, a randomized one, etc.) is still TBD; this exists so the
 * teleport logic can be felt end to end.
 */
export function buildPinkRealm(
  source: MapData,
  playerPos: [number, number]
): { mapData: MapData; entry: [number, number] } {
  const H = source.tiles.length;
  const W = source.tiles[0]?.length ?? 0;
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < H; y++) {
    const trow: number[] = [];
    const srow: number[][] = [];
    for (let x = 0; x < W; x++) {
      trow.push(source.tiles[y][W - 1 - x]); // horizontal mirror
      srow.push([]); // emptied of all items/markers
    }
    tiles.push(trow);
    subtypes.push(srow);
  }

  // Enter at the mirror of where the player stepped through, standing ON the return ring:
  // step off and back onto it to return to the dungeon.
  const [py, px] = playerPos;
  const entry = nearestWalkable(tiles, py, W - 1 - px);
  subtypes[entry[0]][entry[1]] = [TileSubtype.PINK_RING];

  const mapData: MapData = { tiles, subtypes, environment: "pink_realm" };
  return { mapData, entry };
}
