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
 * Build the pink realm: a mirrored reflection of the room the player came from, recolored
 * to the pink_realm environment, emptied of the source room's items/enemies, with a single
 * return ring placed near the entry. The realm seeds its own prizes deterministically (no
 * RNG, so a given source room always yields the same layout): one rare pink flaming heart
 * at the walkable tile farthest from the entry, and four belted berries fanned out across
 * the realm via farthest-point sampling so they don't clump.
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
      // Drop the source room's items/enemies, but KEEP structural breach markers: a wall
      // blown open in the dungeon stays a charred breach in the realm, and stepping through
      // it leads into the nightmare room (handled in enterOutsideWorld when inPinkRealm).
      const srcSubs = source.subtypes[y]?.[W - 1 - x] ?? [];
      const carried = srcSubs.filter(
        (s) => s === TileSubtype.BREACH || s === TileSubtype.SINGED
      );
      srow.push(carried);
    }
    tiles.push(trow);
    subtypes.push(srow);
  }

  // Enter at the mirror of where the player stepped through, standing ON the return ring:
  // step off and back onto it to return to the dungeon.
  const [py, px] = playerPos;
  const entry = nearestWalkable(tiles, py, W - 1 - px);
  subtypes[entry[0]][entry[1]] = [TileSubtype.PINK_RING];

  scatterPrizes(tiles, subtypes, entry);

  const mapData: MapData = { tiles, subtypes, environment: "pink_realm" };
  return { mapData, entry };
}

/** Squared Euclidean distance between two [y,x] points. */
function dist2(a: [number, number], b: [number, number]): number {
  const dy = a[0] - b[0];
  const dx = a[1] - b[1];
  return dy * dy + dx * dx;
}

/** Number of belted berries scattered across each pink realm. */
const BERRY_COUNT = 4;

/**
 * Place the realm's prizes onto empty walkable tiles, deterministically:
 *   - the pink flaming heart, locked inside a treasure chest, at the walkable tile farthest
 *     from `entry` (the deepest reward)
 *   - a KEY to unlock that chest, placed far from both the entry and the chest so the hero
 *     must explore the realm to claim it
 *   - up to BERRY_COUNT BERRY tiles fanned out across the rest of the realm
 * Each is chosen greedily to maximize the minimum distance to all already-claimed points,
 * so the prizes spread out. Tiles already carrying a subtype (entry ring, chest, key,
 * earlier berries) are skipped.
 */
function scatterPrizes(
  tiles: number[][],
  subtypes: number[][][],
  entry: [number, number]
): void {
  const H = tiles.length;
  const W = tiles[0]?.length ?? 0;
  const walkables: Array<[number, number]> = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y === entry[0] && x === entry[1]) continue;
      if (subtypes[y][x].length > 0) continue;
      if (isWalkable(tiles[y][x])) walkables.push([y, x]);
    }
  }
  if (walkables.length === 0) return;

  // Treasure chest (holding the locked pink heart): the walkable tile farthest from entry.
  let chestPos = walkables[0];
  let bestDist = -1;
  for (const w of walkables) {
    const d = dist2(w, entry);
    if (d > bestDist) {
      bestDist = d;
      chestPos = w;
    }
  }
  subtypes[chestPos[0]][chestPos[1]] = [
    TileSubtype.CHEST,
    TileSubtype.PINK_HEART,
    TileSubtype.LOCK,
  ];

  const claimed: Array<[number, number]> = [entry, chestPos];

  // Greedy farthest-point pick among the remaining empty walkables (maximizes the minimum
  // distance to every already-claimed point).
  const pickFarthest = (): [number, number] | null => {
    let pick: [number, number] | null = null;
    let pickScore = -1;
    for (const w of walkables) {
      if (subtypes[w[0]][w[1]].length > 0) continue; // skip chest / key / earlier berries
      let minD = Infinity;
      for (const c of claimed) minD = Math.min(minD, dist2(w, c));
      if (minD > pickScore) {
        pickScore = minD;
        pick = w;
      }
    }
    return pick;
  };

  // The key to the heart chest.
  const keyPos = pickFarthest();
  if (keyPos) {
    subtypes[keyPos[0]][keyPos[1]] = [TileSubtype.KEY];
    claimed.push(keyPos);
  }

  // Belted berries, fanned out across the rest of the realm.
  for (let n = 0; n < BERRY_COUNT; n++) {
    const pick = pickFarthest();
    if (!pick) break;
    subtypes[pick[0]][pick[1]] = [TileSubtype.BERRY];
    claimed.push(pick);
  }
}
