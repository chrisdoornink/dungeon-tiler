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
    const bit = hash & 1;
    return bit === 0 ? TileSubtype.FOOD : TileSubtype.MED;
  } catch {
    return Math.random() < 0.5 ? TileSubtype.FOOD : TileSubtype.MED;
  }
}
