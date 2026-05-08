import { TileSubtype } from "./constants";
import type { MapData } from "./types";
import { computeMapId } from "./utils";

export function pickPotRevealDeterministic(
  mapData: MapData,
  y: number,
  x: number
): TileSubtype.FOOD | TileSubtype.MED {
  try {
    if (
      typeof process !== "undefined" &&
      process.env &&
      process.env.NODE_ENV === "test"
    ) {
      return Math.random() < 0.5 ? TileSubtype.FOOD : TileSubtype.MED;
    }
    const base = computeMapId(mapData);
    const key = `${base}:${y},${x}:pot`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }

    // Check if this is a swarm level (7 snakes) - if so, guarantee 2 potions
    let snakeCount = 0;
    for (let yy = 0; yy < mapData.subtypes.length; yy++) {
      for (let xx = 0; xx < mapData.subtypes[yy].length; xx++) {
        if (mapData.subtypes[yy][xx].includes(TileSubtype.SNAKE)) {
          snakeCount++;
        }
      }
    }

    const isSwarmLevel = snakeCount >= 7;
    if (isSwarmLevel) {
      let potCount = 0;
      let potIndex = -1;
      for (let yy = 0; yy < mapData.subtypes.length; yy++) {
        for (let xx = 0; xx < mapData.subtypes[yy].length; xx++) {
          const subs = mapData.subtypes[yy][xx];
          if (subs.includes(TileSubtype.POT)) {
            if (yy === y && xx === x) potIndex = potCount;
            potCount++;
          }
        }
      }
      if (potIndex >= 0 && potIndex < 2) {
        return TileSubtype.MED;
      }
    }

    const bit = hash & 1;
    return bit === 0 ? TileSubtype.FOOD : TileSubtype.MED;
  } catch {
    return Math.random() < 0.5 ? TileSubtype.FOOD : TileSubtype.MED;
  }
}
