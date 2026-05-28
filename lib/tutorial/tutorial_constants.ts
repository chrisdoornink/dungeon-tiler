/**
 * Pure tutorial coordinate constants with NO imports.
 *
 * This module exists to break an import cycle: game-state.ts imports the
 * tutorial director, and the room builder imports the lib/map barrel (which
 * re-exports game-state). By keeping the few coordinates the director needs
 * in a dependency-free module, the director never has to import the room
 * builder.
 *
 * Most level content (chests, keys, goblins, rocks, etc.) lives in the
 * VISUAL_MAP in `rooms/opening_room.ts` — so a level designer can move
 * things around by editing the grid. Only the player spawn and the column
 * threshold for the goblin-intro fallback are pinned to constants here.
 */

/** Player spawn — left end of the one-wide entry hallway. */
export const TUTORIAL_PLAYER_ENTRY: [number, number] = [14, 2];

/**
 * Column at which the player has crossed into the main goblin room. Used as
 * a fallback trigger for the goblin-intro dialogue when the LOS check would
 * otherwise miss (e.g. the goblin has already been defeated).
 */
export const TUTORIAL_ROOM_ENTER_COL = 11;
