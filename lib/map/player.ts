import { FLOOR, TileSubtype } from "./constants";
import type { MapData } from "./types";
import { cloneMapData } from "./utils";

export function addPlayerToMap(mapData: MapData): MapData {
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  const eligibleTiles: Array<[number, number]> = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligibleTiles.push([y, x]);
      }
    }
  }

  if (eligibleTiles.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligibleTiles.length);
    const [playerY, playerX] = eligibleTiles[randomIndex];
    newMapData.subtypes[playerY][playerX] = [TileSubtype.PLAYER];
  } else {
    console.warn("Could not place player - no eligible floor tiles available");
  }

  return newMapData;
}

/**
 * Place the player on a floor tile that is far from BOTH the exit key and the exit
 * door. The key and exit are already pushed to opposite corners; folding the player
 * into that spread (rather than spawning anywhere) ensures the run requires real
 * traversal toward each objective instead of a lucky short hop.
 *
 * Scores each eligible tile by min(distance-to-key, distance-to-exit) so the spawn is
 * far from the nearer objective, prefers tiles at/above `minDistance`, then picks
 * randomly from the farthest ~30% (for variety, mirroring addExitKeyToMap). Falls back
 * to plain random placement (addPlayerToMap) if the key/exit are missing or no tile
 * clears the threshold-free pool — so it can never fail to place a player.
 */
export function addPlayerToMapAwayFromObjectives(
  mapData: MapData,
  opts?: { minDistance?: number }
): MapData {
  const minDistance = opts?.minDistance ?? 8;
  const newMapData = JSON.parse(JSON.stringify(mapData)) as MapData;
  const grid = newMapData.tiles;
  const h = grid.length;
  const w = grid[0]?.length ?? 0;

  const find = (sub: TileSubtype): [number, number] | null => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (newMapData.subtypes[y][x].includes(sub)) return [y, x];
      }
    }
    return null;
  };
  const key = find(TileSubtype.EXITKEY);
  const exit = find(TileSubtype.EXIT);

  // Without both anchors there is nothing to spread away from — keep old behavior.
  if (!key || !exit) return addPlayerToMap(mapData);

  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        grid[y][x] === FLOOR &&
        (newMapData.subtypes[y][x].length === 0 ||
          newMapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        eligible.push([y, x]);
      }
    }
  }
  if (eligible.length === 0) return addPlayerToMap(mapData);

  const score = (p: [number, number]) =>
    Math.min(
      Math.abs(p[0] - key[0]) + Math.abs(p[1] - key[1]),
      Math.abs(p[0] - exit[0]) + Math.abs(p[1] - exit[1])
    );

  const farEnough = eligible.filter((p) => score(p) >= minDistance);
  const pool = farEnough.length > 0 ? farEnough : eligible;

  let maxScore = -1;
  for (const p of pool) maxScore = Math.max(maxScore, score(p));
  // When the map is too cramped for any tile to clear `minDistance`, drop the floor to
  // 0 so the band is driven purely by the best achievable distance (0.7 * maxScore) —
  // otherwise the band would exceed every tile's score and we'd fall back to a fully
  // random spawn, defeating the spread. With at least one tile we always pick the
  // farthest-available band.
  const effectiveMin = farEnough.length > 0 ? minDistance : 0;
  const band = Math.max(effectiveMin, Math.floor(maxScore * 0.7));

  const ranked = pool
    .filter((p) => score(p) >= band)
    .map((pos) => ({ pos, weight: score(pos) + Math.random() * 0.5 }))
    .sort((a, b) => b.weight - a.weight);

  const top = ranked.slice(0, Math.max(1, Math.floor(ranked.length * 0.3)));
  const choice = (top.length > 0 ? top : ranked)[
    Math.floor(Math.random() * Math.max(1, top.length > 0 ? top.length : ranked.length))
  ];
  if (!choice) return addPlayerToMap(mapData);

  const [py, px] = choice.pos;
  newMapData.subtypes[py][px] = [TileSubtype.PLAYER];
  return newMapData;
}

export function findPlayerPosition(
  mapData: MapData
): [number, number] | null {
  const height = mapData.subtypes.length;
  if (height === 0) return null;

  for (let y = 0; y < height; y++) {
    const row = mapData.subtypes[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (Array.isArray(cell) && cell.includes(TileSubtype.PLAYER)) {
        return [y, x];
      }
    }
  }
  return null;
}

export function removePlayerFromMapData(mapData: MapData): MapData {
  const clone = cloneMapData(mapData);
  for (let y = 0; y < clone.subtypes.length; y++) {
    for (let x = 0; x < clone.subtypes[y].length; x++) {
      const cell = clone.subtypes[y][x];
      if (Array.isArray(cell) && cell.includes(TileSubtype.PLAYER)) {
        clone.subtypes[y][x] = cell.filter((t) => t !== TileSubtype.PLAYER);
      }
    }
  }
  return clone;
}
