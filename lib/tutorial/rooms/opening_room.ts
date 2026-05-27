import { FLOOR, WALL, TileSubtype, type RoomId } from "../../map";
import type { StoryRoom } from "../../story/rooms/types";
import { parseVisualMap } from "../../story/rooms/visual-map-parser";
import { Enemy } from "../../enemy";
import { TUTORIAL_PLAYER_ENTRY, TUTORIAL_CHEST_POS } from "../tutorial_constants";

// Re-export so existing imports of these from the room module keep working.
export {
  TUTORIAL_PLAYER_ENTRY,
  TUTORIAL_ROOM_ENTER_COL,
  TUTORIAL_CHEST_POS,
} from "../tutorial_constants";

/**
 * Tutorial Opening Room (single static grid, expanded).
 *
 * Regions:
 *   - Entry hallway (one tile wide, row 11) with the frozen ghost + relight
 *     torch. Forces the player past the torch and teaches the snuff/relight.
 *   - Central "goblin room" (rows 8-14, cols 11-20) — the first fight, plus:
 *       * a LOCKED treasure chest containing a SWORD in the top-right corner
 *       * a one-tile top opening (with flanking torches) up to the room above
 *       * a single door (with flanking torches) right into the key room
 *   - "Room above" (rows 1-6, cols 11-20): a second sword on the floor and two
 *     different goblin types (earth + water). Goblins are frozen so they don't
 *     swarm down into the first fight; the player engages them on entry.
 *   - "Key room" (3x3, rows 10-12, cols 22-24): a KEY in the center and a
 *     food pot in each of the four corners. The key unlocks the chest.
 *
 * Visual key (see lib/story/rooms/VISUAL_MAP_REFERENCE.md):
 *   .  floor   #  wall   w  wall torch   W  ghost   G  fire-goblin
 *   p  pot (food via potOverrides)   d  door
 * Special tiles (chest, lock, swords, key) are overlaid programmatically below.
 */
const VISUAL_MAP = [
  "# # # # # # # # # # # # # # # # # # # # # # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # # # # # . # # # # # # # # # #",
  "# # # # # # # # # # # # # # # . # # # # # # # # # #",
  "# # # # # # # # # # # # # # # . # # # # # # # # # #",
  "# # # # # # # # # # # # # # # . # # # # # # # # # #",
  "# # # # # # # # # # # # # # w . w # # # # # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # w # # # . . . . . . . . . . w p . p #",
  "# . . . . W . . . . . . . . . . G . . . . . . . . #",
  "# # # # # # # # # # # . . . . . . . . . . . p . p #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  "# # # # # # # # # # # # # # # # # # # # # # # # # #",
];

const ROOM_WIDTH = 26;
const ROOM_HEIGHT = 19;

/** Universal key in the center of the key room. */
const KEY_POS: [number, number] = [14, 23];

/** Second sword on the floor of the room above. */
const ROOM_ABOVE_SWORD_POS: [number, number] = [3, 16];

/** Four food pots in the corners of the key room. */
const KEY_ROOM_POT_POS: Array<[number, number]> = [
  [13, 22],
  [13, 24],
  [15, 22],
  [15, 24],
];

type EnemyKind = Enemy["kind"];

// The parser emits 'fire-goblin' for G and 'ghost' for W.
const PARSER_KIND_MAP: Record<string, EnemyKind> = {
  "fire-goblin": "fire-goblin",
  ghost: "ghost",
};

/** Extra goblins placed in the room above (two different types). */
const ROOM_ABOVE_GOBLINS: Array<{ pos: [number, number]; kind: EnemyKind }> = [
  { pos: [2, 13], kind: "earth-goblin" },
  { pos: [2, 18], kind: "water-goblin" },
];

export function buildTutorialOpeningRoom(): StoryRoom {
  const parsed = parseVisualMap(VISUAL_MAP, ROOM_WIDTH, ROOM_HEIGHT);

  // --- Enemies from the parsed map (ghost + main fire-goblin) ---
  const enemies: Enemy[] = parsed.enemies.map(({ y, x, kind }) => {
    const e = new Enemy({ y, x });
    e.kind = PARSER_KIND_MAP[kind] ?? "ghost";
    // Freeze the tutorial ghost so it holds still while the player approaches,
    // making the 3-beat opening sequence deterministic. It still snuffs the
    // torch on adjacency.
    if (e.kind === "ghost") {
      (e.behaviorMemory as Record<string, unknown>)["frozen"] = true;
    }
    return e;
  });

  // --- Extra goblins in the room above (frozen so they hold their ground) ---
  for (const { pos, kind } of ROOM_ABOVE_GOBLINS) {
    const g = new Enemy({ y: pos[0], x: pos[1] });
    g.kind = kind;
    (g.behaviorMemory as Record<string, unknown>)["frozen"] = true;
    enemies.push(g);
  }

  // --- Overlay special tiles the parser doesn't support ---
  const { subtypes } = parsed;

  // Locked treasure chest containing a sword.
  subtypes[TUTORIAL_CHEST_POS[0]][TUTORIAL_CHEST_POS[1]] = [
    TileSubtype.CHEST,
    TileSubtype.LOCK,
    TileSubtype.SWORD,
  ];

  // Universal key in the key room center.
  subtypes[KEY_POS[0]][KEY_POS[1]] = [TileSubtype.KEY];

  // Second sword on the floor of the room above.
  subtypes[ROOM_ABOVE_SWORD_POS[0]][ROOM_ABOVE_SWORD_POS[1]] = [
    TileSubtype.SWORD,
  ];

  // Guarantee the four key-room pots reveal as food.
  const potOverrides: Record<string, TileSubtype.FOOD | TileSubtype.MED> = {};
  for (const [py, px] of KEY_ROOM_POT_POS) {
    potOverrides[`${py},${px}`] = TileSubtype.FOOD;
  }

  return {
    id: "tutorial-opening" as RoomId,
    mapData: {
      tiles: parsed.tiles,
      subtypes,
      environment: "cave",
    },
    entryPoint: TUTORIAL_PLAYER_ENTRY,
    enemies,
    potOverrides,
    metadata: { displayLabel: "Tutorial" },
  };
}

export const TUTORIAL_OPENING_DIMENSIONS = {
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
};

export function assertTutorialRoomShape(room: StoryRoom): void {
  if (room.mapData.tiles.length !== ROOM_HEIGHT) {
    throw new Error(
      `Tutorial opening room height mismatch: ${room.mapData.tiles.length} != ${ROOM_HEIGHT}`
    );
  }
  if (room.mapData.tiles[0]?.length !== ROOM_WIDTH) {
    throw new Error(
      `Tutorial opening room width mismatch: ${room.mapData.tiles[0]?.length} != ${ROOM_WIDTH}`
    );
  }
  void FLOOR;
  void WALL;
}
