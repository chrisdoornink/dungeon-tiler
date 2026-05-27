// Import from leaf modules (not the ../map index) to avoid a circular import:
// game-state.ts imports this director, and the ../map index re-exports
// game-state.ts. Pulling types directly breaks that cycle.
import type { GameState } from "../map/game-state";
import { makeTutorialDialogueEvent } from "./tutorial_dialogue";
import { TUTORIAL_ROOM_ENTER_COL } from "./rooms/opening_room";

/**
 * Beat keys tracked on `GameState.tutorialBeats` so each fires exactly once.
 */
const BEAT_GHOST_SPOTTED = "ghost-spotted";
const BEAT_GHOST_SNUFFED = "ghost-snuffed";
const BEAT_GOBLIN_INTRO = "goblin-intro";
const BEAT_GOBLIN_DEFEATED = "goblin-defeated";

/** True once no fire-goblin remains in the enemies list. */
function goblinDefeated(state: GameState): boolean {
  return !(state.enemies ?? []).some((e) => e.kind === "fire-goblin");
}

/** Manhattan distance from the player to the nearest ghost, or Infinity. */
function nearestGhostDistance(
  state: GameState,
  playerPos: { y: number; x: number }
): number {
  let min = Infinity;
  for (const e of state.enemies ?? []) {
    if (e.kind !== "ghost") continue;
    const d = Math.abs(e.y - playerPos.y) + Math.abs(e.x - playerPos.x);
    if (d < min) min = d;
  }
  return min;
}

function queueDialogue(state: GameState, dialogueId: string): void {
  const queue = state.npcInteractionQueue ? [...state.npcInteractionQueue] : [];
  queue.push(makeTutorialDialogueEvent(dialogueId, Date.now()));
  state.npcInteractionQueue = queue;
}

/**
 * Tutorial director — runs as a post-move hook from movePlayer when
 * `state.mode === 'tutorial'`. Idempotent: each beat is gated on
 * `state.tutorialBeats` so repeated calls are safe.
 *
 * The room layout is fully static (see rooms/opening_room.ts) — there's no
 * scripted geometry change. The director's only current job is to fire the
 * goblin-intro dialogue when the player crosses from the one-wide hallway into
 * the wide room.
 *
 * @param state     The post-move game state (mutated in place / returned).
 * @param playerPos The player's new position after the move.
 */
export function applyTutorialDirector(
  state: GameState,
  playerPos: { y: number; x: number }
): GameState {
  if (state.mode !== "tutorial") return state;

  const beats = { ...(state.tutorialBeats ?? {}) };

  // Beat: "This is a ghost." — fires when the player is one slot away from the
  // (frozen) ghost with the torch still lit. The frozen ghost guarantees the
  // player reaches exactly distance 2 before stepping adjacent.
  if (
    !beats[BEAT_GHOST_SPOTTED] &&
    state.heroTorchLit === true &&
    nearestGhostDistance(state, playerPos) === 2
  ) {
    queueDialogue(state, "tutorial-ghost-spotted");
    beats[BEAT_GHOST_SPOTTED] = true;
  }

  // Beat: "Ghosts steal your light." — fires the moment the torch goes out
  // (the ghost snuffed it by ending adjacent this turn).
  if (!beats[BEAT_GHOST_SNUFFED] && state.heroTorchLit === false) {
    queueDialogue(state, "tutorial-ghost-snuffed");
    beats[BEAT_GHOST_SNUFFED] = true;
  }

  // Beat: goblin-intro dialogue once the player crosses into the wide room.
  if (!beats[BEAT_GOBLIN_INTRO] && playerPos.x >= TUTORIAL_ROOM_ENTER_COL) {
    queueDialogue(state, "tutorial-goblin-intro");
    beats[BEAT_GOBLIN_INTRO] = true;
  }

  // Beat: goblin-defeated dialogue once the goblin is gone (only after its
  // intro fired, so it can't trigger before the fight has begun).
  if (
    beats[BEAT_GOBLIN_INTRO] &&
    !beats[BEAT_GOBLIN_DEFEATED] &&
    goblinDefeated(state)
  ) {
    queueDialogue(state, "tutorial-goblin-defeated");
    beats[BEAT_GOBLIN_DEFEATED] = true;
  }

  state.tutorialBeats = beats;
  return state;
}
