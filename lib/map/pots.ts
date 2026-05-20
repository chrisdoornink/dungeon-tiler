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

    // Snake-swarm level: guarantee at least 2 healing potions among the
    // non-snake pots. The flag is set at map generation time (see
    // addSnakesPerRules) because runtime subtype counting misses floor snakes
    // and incorrectly counts the snake-pot itself.
    if (mapData.snakeSwarm) {
      let nonSnakePotIndex = -1;
      let nonSnakePotCount = 0;
      for (let yy = 0; yy < mapData.subtypes.length; yy++) {
        for (let xx = 0; xx < mapData.subtypes[yy].length; xx++) {
          const subs = mapData.subtypes[yy][xx];
          if (!subs.includes(TileSubtype.POT)) continue;
          if (subs.includes(TileSubtype.SNAKE)) continue;
          if (yy === y && xx === x) nonSnakePotIndex = nonSnakePotCount;
          nonSnakePotCount++;
        }
      }
      if (nonSnakePotIndex >= 0 && nonSnakePotIndex < 2) {
        return TileSubtype.MED;
      }
    }

    const bit = hash & 1;
    return bit === 0 ? TileSubtype.FOOD : TileSubtype.MED;
  } catch {
    return Math.random() < 0.5 ? TileSubtype.FOOD : TileSubtype.MED;
  }
}
