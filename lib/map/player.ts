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
