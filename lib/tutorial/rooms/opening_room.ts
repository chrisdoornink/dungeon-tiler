import { FLOOR, WALL, TileSubtype, type RoomId } from "../../map";
import type { StoryRoom } from "../../story/rooms/types";
import { parseVisualMap } from "../../story/rooms/visual-map-parser";
import { Enemy } from "../../enemy";

/**
 * Tutorial Opening Room (single static grid).
 *
 * Beat outline (rough draft — see `.claude/features/interactive-tutorial/`):
 *
 *   1. Welcome dialogue + ghost-warning dialogue play on load.
 *   2. Player walks right along a ONE-TILE-WIDE hallway; a ghost approaches and
 *      snuffs the torch on adjacency (existing ghost AI + snuff logic).
 *   3. A wall torch sits on the hallway wall. Because the hallway is only one
 *      tile wide, the player has no choice but to pass directly beneath it,
 *      which relights the torch.
 *   4. Just past the torch the corridor opens — by layout, not by any scripted
 *      event — into a larger 10x7 room with a red (fire) goblin already in it.
 *   5. When the player crosses into that room, the goblin-intro dialogue plays.
 *   6. The player fights the goblin (next beat).
 *
 * The room is part of the static map. With full-daylight rendering the player
 * can see it ahead as they approach — that's fine; the "opening up" is the
 * spatial transition from a 1-wide hall into a wide room, not a reveal trick.
 *
 * Visual key (see lib/story/rooms/VISUAL_MAP_REFERENCE.md):
 *   .  floor   #  wall   w  wall torch (on wall)   W  ghost   G  fire-goblin
 */
const VISUAL_MAP = [
  "# # # # # # # # # # # # # # # # # # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . #",
  "# # # # # # # # # # # . . . . . . . . . . #",
  "# # # # # # # w # # # . . . . . . . . . . #",
  "# . . . . W . . . . . . . . . . G . . . . #",
  "# # # # # # # # # # # . . . . . . . . . . #",
  "# # # # # # # # # # # . . . . . . . . . . #",
  "# # # # # # # # # # # . . . . . . . . . . #",
  "# # # # # # # # # # # # # # # # # # # # # #",
];

const ROOM_WIDTH = 22;
const ROOM_HEIGHT = 9;

/** Player spawn — left end of the one-wide hallway. */
export const TUTORIAL_PLAYER_ENTRY: [number, number] = [4, 2];

/**
 * Once the player's column reaches this value they've crossed from the hallway
 * into the wide room, which triggers the goblin-intro dialogue.
 */
export const TUTORIAL_ROOM_ENTER_COL = 11;

type EnemyKind = Enemy["kind"];

// The parser emits 'fire-goblin' for G and 'ghost' for W. Preserve those.
const PARSER_KIND_MAP: Record<string, EnemyKind> = {
  "fire-goblin": "fire-goblin",
  ghost: "ghost",
};

export function buildTutorialOpeningRoom(): StoryRoom {
  const parsed = parseVisualMap(VISUAL_MAP, ROOM_WIDTH, ROOM_HEIGHT);

  const enemies: Enemy[] = parsed.enemies.map(({ y, x, kind }) => {
    const e = new Enemy({ y, x });
    e.kind = PARSER_KIND_MAP[kind] ?? "ghost";
    // Freeze the tutorial ghost so it holds still while the player approaches.
    // This makes the scripted 3-beat sequence deterministic: the player closes
    // the gap one tile per move (3 -> 2 -> adjacent), so we reliably hit the
    // "one slot away" frame with the torch still lit before the snuff. The
    // ghost still snuffs + vanishes when the player steps adjacent.
    if (e.kind === "ghost") {
      (e.behaviorMemory as Record<string, unknown>)["frozen"] = true;
    }
    return e;
  });

  return {
    id: "tutorial-opening" as RoomId,
    mapData: {
      tiles: parsed.tiles,
      subtypes: parsed.subtypes,
      environment: "cave",
    },
    entryPoint: TUTORIAL_PLAYER_ENTRY,
    enemies,
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
  void TileSubtype;
}
