/**
 * Pure tutorial coordinate constants with NO imports.
 *
 * This module exists to break an import cycle: game-state.ts imports the
 * tutorial director, and the room builder imports the lib/map barrel (which
 * re-exports game-state). By keeping the coordinates the director needs in a
 * dependency-free module, the director never has to import the room builder.
 */

/** Player spawn — left end of the one-wide entry hallway. */
export const TUTORIAL_PLAYER_ENTRY: [number, number] = [14, 2];

/** Column at which the player has crossed into the main goblin room. */
export const TUTORIAL_ROOM_ENTER_COL = 11;

/** Locked treasure chest (contains a sword), top-right of the goblin room. */
export const TUTORIAL_CHEST_POS: [number, number] = [11, 20];
