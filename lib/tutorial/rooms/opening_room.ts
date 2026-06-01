import { FLOOR, WALL, TileSubtype, type RoomId } from "../../map"
import type { StoryRoom } from "../../story/rooms/types"
import { parseVisualMap } from "../../story/rooms/visual-map-parser"
import { Enemy } from "../../enemy"
import { TUTORIAL_PLAYER_ENTRY } from "../tutorial_constants"

// Re-export so existing imports of these from the room module keep working.
export {
  TUTORIAL_PLAYER_ENTRY,
  TUTORIAL_ROOM_ENTER_COL,
} from "../tutorial_constants";

/**
 * Tutorial Opening Room.
 *
 * Layout is fully driven by VISUAL_MAP — every enemy, key, chest, rock,
 * sword, and pot is expressible as a single glyph in the grid so the level
 * designer can move things around without touching code.
 *
 * ## Visual key
 *
 * Shared parser glyphs (see `lib/story/rooms/visual-map-parser.ts` and
 * `lib/story/rooms/VISUAL_MAP_REFERENCE.md`):
 *
 *     .  floor              #  wall              w  wall torch
 *     W  ghost              G  fire-goblin       p  food pot
 *     d  door               t  torch
 *
 *   (G spawns frozen; thaws when the goblin-intro dialogue fires on sight.)
 *
 * Tutorial-specific glyphs (interpreted by the post-pass below — the shared
 * parser sees them all as plain floor):
 *
 *     g  earth-goblin (active from spawn — pursues like a normal enemy)
 *     u  water-goblin (active from spawn — pursues like a normal enemy)
 *     j  key (universal — unlocks the next locked chest the hero steps on)
 *     x  locked treasure chest containing a SWORD
 *     y  locked treasure chest containing a SHIELD
 *     l  floor sword (no chest, just a sword on the ground)
 *     o  rock on floor
 *     e  exit door
 *     c  exit key
 *     t  floor torch (lighting prop sitting on the ground; walkable)
 *     Q  ghost starting in a wall
 *
 * The post-pass also derives `potOverrides` automatically from every `p` it
 * finds, so all pots reveal as FOOD without a parallel coordinate list.
 *
 * ## Regions
 *
 *   - "Room above" (rows 1-5): a wide horizontal hall stretching most of
 *     the way across the level. Holds the two goblins, the locked shield
 *     chest, the key for it, the floor sword, rocks, and food pots.
 *   - Descent (rows 6-12): geometry varies — currently has two branching
 *     corridors and a ghost guarding one of them. The hero must thread it
 *     to reach the goblin room below.
 *   - "Goblin room" (rows 11-15, cols 11-20): the first fight + locked
 *     sword chest.
 *   - Hallway (row 14, cols 1-15): one tile wide path from the player's
 *     spawn east to the goblin room.
 *   - "Key room" (rows 13-15, cols 22-24): universal key in the center, a
 *     food pot in each corner. The key unlocks the goblin-room chest.
 */
const VISUAL_MAP = [
  // Row 0  — top wall
  "# w # # # # # # # # # # # # # # # # # # # # # # # #",
  // Rows 1-5 — room above
  "# y . . . . . . g . . . # . . . . # c . . . . # # #",
  "# . . . . . . . . . . . # . . . . # # # # u . # # #",
  "# . . j . # # o . . # . . . . . . . o . . . . # # #",
  "# . . . l . . . . o # # . . . . . # . . p p . # # #",
  "# . . . . . o . . . . # . . . . . . . . p p . # # #",
  // Rows 6-12 — descent corridors
  "# # . . . . # # # . . . . # # . # # # # # . # # # #",
  "# # # w . . w # # # . . . . # . # # # # # . . . # #",
  "# # # . . . . # # # . . . . # . # # # # # # # p p #",
  "# # # . . . . # # # # # # # # o # # # # # # # p p #",
  "# # # e . . . # # # # # # # w . w # # x # # # # # #",
  "# # # # # # # # # # # p . . . . . . p . p # # # # #",
  "# # # # # # # # # # # . . . . . . . . . . # # # # #",
  // Rows 13-15 — goblin room, hallway, key room
  "# # # # # Q # w # # # . . . . . . . . . . # t . t #",
  "# . . . . . . . . . . . . . . . G . . o . . . j . #",
  "# # # # # # # # # # # . . . . . o . . . # # t . t #",
  // Rows 16-17 — goblin room bottom
  "# # # # # # # # # # # # . o . . . . . . # # # # # #",
  "# # # # # # # # # # # # # . . o . . . # # # # # # #",
  // Row 18 — bottom wall
  "# # # # # # # # # # # # # # # # # # # # # # # # # #",
];

const ROOM_WIDTH = 26;
const ROOM_HEIGHT = 19;

type EnemyKind = Enemy["kind"];

// The shared parser emits 'fire-goblin' for G and 'ghost' for W.
const PARSER_KIND_MAP: Record<string, EnemyKind> = {
  "fire-goblin": "fire-goblin",
  ghost: "ghost",
};

/**
 * Split a VISUAL_MAP row into per-column tokens. Mirrors `parseVisualMap`'s
 * own tokenization: spaces are ignored (used purely for visual alignment),
 * and bracketed multi-char IDs like `[12]` count as a single cell. The
 * tutorial map doesn't currently use brackets, but the support is here so
 * a designer can drop them in without surprises.
 */
function splitMapRow(row: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < row.length) {
    const c = row[i];
    if (c === " ") {
      i++;
      continue;
    }
    if (c === "[") {
      const close = row.indexOf("]", i);
      if (close !== -1) {
        tokens.push(row.substring(i, close + 1));
        i = close + 1;
        continue;
      }
    }
    tokens.push(c);
    i++;
  }
  return tokens;
}

export function buildTutorialOpeningRoom(): StoryRoom {
  const parsed = parseVisualMap(VISUAL_MAP, ROOM_WIDTH, ROOM_HEIGHT);

  // --- Enemies from the parsed map (W → ghost, G → fire-goblin) ---
  // The goblin-room fire-goblin spawns FROZEN: row 14 is a straight open
  // corridor back to the hero's spawn, so an unfrozen goblin would pursue,
  // close the distance, and pop into sight range while the hero is still in
  // the ghost-snuff / torch-relight zone — firing its intro dialogue
  // mid-relight. Frozen, it stays put at the far end of the goblin room and
  // can't be seen until the hero is well past the relight. The director
  // thaws it when the goblin-intro beat fires (on sight). Ghosts are NOT
  // frozen — they must advance to snuff the torch (the ghost lesson).
  const enemies: Enemy[] = parsed.enemies.map(({ y, x, kind }) => {
    const e = new Enemy({ y, x });
    e.kind = PARSER_KIND_MAP[kind] ?? "ghost";
    if (e.kind === "fire-goblin") {
      (e.behaviorMemory as Record<string, unknown>)["frozen"] = true;
    }
    return e;
  });

  const { subtypes } = parsed;
  const potOverrides: Record<string, TileSubtype.FOOD | TileSubtype.MED> = {};

  // --- Tutorial glyph post-pass ---
  // Walk the raw VISUAL_MAP cell-by-cell and apply tutorial-specific effects
  // for glyphs the shared parser doesn't know about. We also harvest every
  // `p` position into potOverrides so all pots reveal as FOOD (pot reveal
  // logic in game-state.ts otherwise re-randomizes contents at open time).
  for (let y = 0; y < VISUAL_MAP.length; y++) {
    const cells = splitMapRow(VISUAL_MAP[y]);
    for (let x = 0; x < cells.length; x++) {
      const ch = cells[x];
      switch (ch) {
        case "p": {
          potOverrides[`${y},${x}`] = TileSubtype.FOOD;
          break;
        }
        case "j": {
          subtypes[y][x] = [TileSubtype.KEY];
          break;
        }
        case "l": {
          subtypes[y][x] = [TileSubtype.SWORD];
          break;
        }
        case "o": {
          subtypes[y][x] = [TileSubtype.ROCK];
          break;
        }
        case "x": {
          subtypes[y][x] = [
            TileSubtype.CHEST,
            TileSubtype.LOCK,
            TileSubtype.SWORD,
          ];
          break;
        }
        case "y": {
          subtypes[y][x] = [
            TileSubtype.CHEST,
            TileSubtype.LOCK,
            TileSubtype.SHIELD,
          ];
          break;
        }
        case "g": {
          const eg = new Enemy({ y, x });
          eg.kind = "earth-goblin";
          enemies.push(eg);
          break;
        }
        case "u": {
          const wg = new Enemy({ y, x });
          wg.kind = "water-goblin";
          enemies.push(wg);
          break;
        }
        case "e": {
          // Exit door — the shared parser binds 'e' to BED_EMPTY_4, so we
          // fully replace the subtypes here to drop that and stamp EXIT.
          // Engine handling lives in game-state.ts: walking onto an EXIT
          // tile with `hasExitKey` true consumes the key and sets win=true
          // (single-tier mode, which is what tutorial mode runs in).
          subtypes[y][x] = [TileSubtype.EXIT];
          break;
        }
        case "c": {
          // Exit key — shared parser binds 'c' to BED_EMPTY_3, fully
          // replaced here. Walking onto the tile sets `hasExitKey = true`
          // (see game-state.ts pickup handler) and clears the subtype.
          subtypes[y][x] = [TileSubtype.EXITKEY];
          break;
        }
        case "t": {
          // Floor torch — same lighting effect as a 'w' wall torch but the
          // tile stays floor so the player can walk past / around it. The
          // engine uses the WALL_TORCH subtype for both wall- and floor-
          // mounted torches; the tile type (floor vs. wall) is what
          // distinguishes them visually.
          subtypes[y][x] = [TileSubtype.WALL_TORCH];
          break;
        }
        case "Q": {
          // Ghost starting inside a wall — invisible to the hero until the
          // pursuit AI walks it out into the open. The tile stays a WALL so
          // (a) the player can't accidentally walk onto it before the ghost
          // emerges and (b) the wall renders normally. Ghosts pass through
          // walls, so the standard pursuit AI handles emergence on its own.
          // Parser sees 'Q' as a ROOM_TRANSITION capital letter, so we
          // force-restamp both the tile type and the subtypes here.
          parsed.tiles[y][x] = WALL;
          subtypes[y][x] = [];
          const hidden = new Enemy({ y, x });
          hidden.kind = "ghost";
          enemies.push(hidden);
          break;
        }
        // Any other glyph (., #, w, W, G, p, d, etc.) is already fully
        // handled by parseVisualMap — nothing extra to do here.
      }
    }
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
