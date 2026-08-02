// Reproduce the Level 2 treasure-chest contents for any daily-challenge date.
//
// The two L2 chests are the run's only variable loot slot, and one of the three
// possible items is the BOMB — the key that unlocks wall-breaking, the outside
// world, and (via bombing a pink goblin) the pink realm. Whether a bomb was
// even available on a given day is therefore essential context for reading the
// "reached pink realm / outside world / blew up the tree" numbers.
//
// The contents are fully deterministic from the date: the daily run is built by
//   withPatchedMathRandom(mulberry32(hashStringToSeed(YYYY-MM-DD)),
//                         () => initializeGameStateForMultiTier(1))
// and `allocateChestsAndKeys()` is that function's FIRST RNG consumer. Calling
// it here inside the identical seeded block replays the exact same draws, so the
// items we compute match what every player saw that day — no need to store chest
// contents in analytics.

import {
  allocateChestsAndKeys,
  L2_OPTIONAL_POOL_V1,
  L2_POOL_V2_START_DATE,
} from "../map/map-features";
import { TileSubtype } from "../map/constants";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../rng";

export interface ChestItemMeta {
  subtype: TileSubtype;
  /** Stable machine key for the item (used in JSON payloads / analytics joins). */
  key:
    | "bomb"
    | "snake_medallion"
    | "extra_heart"
    | "amber_moth"
    | "sword"
    | "shield"
    | "unknown";
  label: string;
  /** Public path to the in-game icon so the stats UI matches the game. */
  icon: string;
}

const ITEM_META: Partial<Record<TileSubtype, Omit<ChestItemMeta, "subtype">>> = {
  [TileSubtype.BOMB]: {
    key: "bomb",
    label: "Bomb",
    icon: "/images/items/bomb-black.png",
  },
  [TileSubtype.SNAKE_MEDALLION]: {
    key: "snake_medallion",
    label: "Snake Medallion",
    icon: "/images/items/snake-medalion.png",
  },
  [TileSubtype.EXTRA_HEART]: {
    key: "extra_heart",
    label: "Extra Heart",
    icon: "/images/items/heart.png",
  },
  [TileSubtype.AMBER_MOTH]: {
    key: "amber_moth",
    label: "Amber Moth",
    icon: "/images/items/amber-moth.png",
  },
  [TileSubtype.SWORD]: {
    key: "sword",
    label: "Sword",
    icon: "/images/items/sword.png",
  },
  [TileSubtype.SHIELD]: {
    key: "shield",
    label: "Shield",
    icon: "/images/items/shield.png",
  },
};

export function chestItemMeta(subtype: TileSubtype): ChestItemMeta {
  const meta = ITEM_META[subtype];
  if (meta) return { subtype, ...meta };
  return { subtype, key: "unknown", label: `Item ${subtype}`, icon: "/images/items/closed-chest.png" };
}

export interface Level2ChestStatus {
  /** The two items drawn into the L2 chests, in generation order. */
  items: ChestItemMeta[];
  /** Whether one of the chests contained a bomb (bomb-gated content reachable). */
  bombAvailable: boolean;
}

/**
 * Compute the two Level 2 chest items for a daily run identified by its local
 * date string (YYYY-MM-DD, the same value stored on analytics as `date_seed`).
 *
 * The pool is pinned to the version that was live on `dateStr`. This matters more than it
 * looks: the pool's Fisher-Yates shuffle makes one RNG call per entry, so replaying an old
 * date against a LARGER pool consumes a different number of draws and reports loot that
 * day never held. Any future pool addition needs another branch here.
 */
export function level2ChestStatusForDate(dateStr: string): Level2ChestStatus {
  const seed = hashStringToSeed(dateStr);
  const rng = mulberry32(seed);
  const l2Pool =
    dateStr < L2_POOL_V2_START_DATE ? L2_OPTIONAL_POOL_V1 : undefined;
  const allocation = withPatchedMathRandom(rng, () =>
    allocateChestsAndKeys({ l2Pool })
  );
  const contents = allocation.get(2)?.chestContents ?? [];
  const items = contents.map((subtype) => chestItemMeta(subtype));
  return {
    items,
    bombAvailable: contents.includes(TileSubtype.BOMB),
  };
}
