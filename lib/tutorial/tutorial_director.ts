// Import from leaf modules (not the ../map index) to avoid a circular import:
// game-state.ts imports this director, and the ../map index re-exports
// game-state.ts. Pulling types directly breaks that cycle.
import { TileSubtype, FLOOR } from "../map/constants";
import type { GameState } from "../map/game-state";
import { makeTutorialDialogueEvent } from "./tutorial_dialogue";
// lib/line_of_sight has no imports, so pulling it in here is cycle-safe.
import { canSee } from "../line_of_sight";
// Import coordinates from the dependency-free constants module (NOT the room
// builder) to avoid an import cycle back through the lib/map barrel.
import { TUTORIAL_ROOM_ENTER_COL } from "./tutorial_constants";

/**
 * Beat keys tracked on `GameState.tutorialBeats` so each fires exactly once.
 */
const BEAT_GHOST_SPOTTED = "ghost-spotted";
const BEAT_GHOST_SNUFFED = "ghost-snuffed";
const BEAT_LIGHT_RELIT = "light-relit";
const BEAT_ROCK_PICKUP = "rock-pickup";
const BEAT_GOBLIN_INTRO = "goblin-intro";
// Internal one-step delay flag: the goblin-intro trigger (HUD sight, distance
// <= 8) can be met a step before the goblin is actually drawn in the hero's
// torchlight. We "arm" on the step the trigger is first met and fire the
// dialogue on the following director call so the line lands when the goblin
// is visible on screen.
const BEAT_GOBLIN_INTRO_ARMED = "goblin-intro-armed";
const BEAT_GOBLIN_DEFEATED = "goblin-defeated";
const BEAT_CHEST_LOCKED = "chest-locked";
const BEAT_SWORD_PICKUP = "sword-pickup";
const BEAT_SHIELD_PICKUP = "shield-pickup";
const BEAT_LOW_HEALTH = "low-health";
const BEAT_EXIT_LOCKED = "exit-locked";
const BEAT_EXIT_APPROACH = "exit-approach";

/**
 * Distance at which an enemy starts appearing in the "Enemies in sight" HUD
 * (see TilemapGrid.tsx — same filter is used here so the goblin-intro
 * dialogue fires the moment the goblin appears in that HUD, not earlier).
 */
const HUD_SIGHT_DISTANCE = 8;

/** True once no fire-goblin remains in the enemies list. */
function goblinDefeated(state: GameState): boolean {
  return !(state.enemies ?? []).some((e) => e.kind === "fire-goblin");
}

/**
 * True if there is a fire-goblin the hero can actually see — same filter the
 * "Enemies in sight" HUD uses: clear line of sight via `canSee` plus Manhattan
 * distance within HUD_SIGHT_DISTANCE. This matches the player's expectation
 * that the goblin-intro dialogue fires when the goblin shows up in their HUD,
 * not when the goblin's own AI starts pursuing from across the map.
 */
function fireGoblinIsInSight(
  state: GameState,
  playerPos: { y: number; x: number }
): boolean {
  for (const e of state.enemies ?? []) {
    if (e.kind !== "fire-goblin") continue;
    if (!canSee(state.mapData.tiles, [playerPos.y, playerPos.x], [e.y, e.x])) {
      continue;
    }
    const dist = Math.abs(playerPos.y - e.y) + Math.abs(playerPos.x - e.x);
    if (dist <= HUD_SIGHT_DISTANCE) return true;
  }
  return false;
}

/**
 * Manhattan distance from the player to the nearest VISIBLE ghost, or
 * Infinity. "Visible" here means the ghost is standing on a floor tile —
 * ghosts inside walls (Q glyph in VISUAL_MAP) are invisible to the hero and
 * deliberately don't count, so the "This is a ghost" dialogue waits until
 * the ghost has actually emerged into the open.
 */
function nearestGhostDistance(
  state: GameState,
  playerPos: { y: number; x: number }
): number {
  let min = Infinity;
  for (const e of state.enemies ?? []) {
    if (e.kind !== "ghost") continue;
    const tile = state.mapData.tiles[e.y]?.[e.x];
    if (tile !== FLOOR) continue;
    const d = Math.abs(e.y - playerPos.y) + Math.abs(e.x - playerPos.x);
    if (d < min) min = d;
  }
  return min;
}

/**
 * True if the hero is standing directly adjacent (Manhattan distance 1) to an
 * EXIT door tile. Subtype scan rather than a hard-coded position so the level
 * designer can move the door in VISUAL_MAP without touching code. Without the
 * exit key the EXIT tile blocks movement (see game-state.ts), so the hero ends
 * up adjacent rather than on it — distance 1 is the right trigger for both the
 * locked-hint and the with-key outro beats.
 */
function isAdjacentToExit(
  state: GameState,
  playerPos: { y: number; x: number }
): boolean {
  for (let y = 0; y < state.mapData.subtypes.length; y++) {
    const row = state.mapData.subtypes[y];
    for (let x = 0; x < row.length; x++) {
      if (!row[x].includes(TileSubtype.EXIT)) continue;
      const dist = Math.abs(playerPos.y - y) + Math.abs(playerPos.x - x);
      if (dist === 1) return true;
    }
  }
  return false;
}

function queueDialogue(state: GameState, dialogueId: string): void {
  const queue = state.npcInteractionQueue ? [...state.npcInteractionQueue] : [];
  // TilemapGrid's consumeNpcInteraction filters the queue by exact timestamp
  // match (queue.filter(e => e.timestamp !== consumed)), so any two events
  // queued in the same millisecond would be consumed together — dismissing
  // one would silently eat the other. That collision is easy to hit here:
  // multiple beats can fire on a single player turn (e.g. ghost-snuffed AND
  // goblin-intro both firing as the ghost rushes adjacency while the goblin
  // starts pursuing). Force strictly-increasing timestamps to keep each
  // tutorial dialogue independently dismissable.
  const maxTs = queue.reduce(
    (m, e) => (e.timestamp > m ? e.timestamp : m),
    0
  );
  const timestamp = Math.max(Date.now(), maxTs + 1);
  queue.push(makeTutorialDialogueEvent(dialogueId, timestamp));
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

  // The guided run is a teaching space, not a place to game-over. Floor the
  // hero at 1 HP: a brand-new player can take hits, still trigger the
  // low-health beat below (which fires at exactly 1 HP), and always reach the
  // payoff instead of being bounced to the /end screen. movePlayer ticks all
  // damage (combat, poison, hazards) before calling the director, so clamping
  // here covers every source. Side effect: no tutorial death ever fires, so
  // tutorial runs stop polluting the game_complete analytics.
  if (state.heroHealth < 1) {
    state.heroHealth = 1;
  }

  const beats = { ...(state.tutorialBeats ?? {}) };

  // Beat: "This is a ghost." — fires when a ghost is within two tiles of the
  // hero and the torch is still lit. The ghost is no longer frozen, so the
  // relative distance can jump (player +1 east, ghost +1 west on the same
  // turn). The `<= 2` check fires on either of those landing positions; if
  // the ghost rushes straight into adjacency and snuffs the torch on the
  // same turn this beat can be skipped — that's acceptable, since the
  // ghost-snuffed beat below carries the essential "ghosts steal your light"
  // lesson on its own.
  if (
    !beats[BEAT_GHOST_SPOTTED] &&
    state.heroTorchLit === true &&
    nearestGhostDistance(state, playerPos) <= 2
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

  // Beat: "That's better." — fires the first time the hero is back in the
  // light after a ghost had snuffed their torch. Gated on ghost-snuffed
  // having fired so we know the current lit state is a relight, not the
  // initial spawn condition.
  if (
    !beats[BEAT_LIGHT_RELIT] &&
    beats[BEAT_GHOST_SNUFFED] &&
    state.heroTorchLit === true
  ) {
    queueDialogue(state, "tutorial-light-relit");
    beats[BEAT_LIGHT_RELIT] = true;
  }

  // Beat: goblin-intro dialogue. The trigger — the fire-goblin entering the
  // "Enemies in sight" HUD (canSee + distance <= 8), or the col-11 room entry
  // fallback in case the goblin won't be seen — can be met one step before the
  // goblin is actually rendered in the hero's torchlight, making the "A goblin!"
  // line land while the screen is still empty. So we arm on the step the trigger
  // is first met and fire on the NEXT director call, lining the dialogue up with
  // the goblin appearing on screen. The goblin spawns frozen (see
  // rooms/opening_room.ts) and stays frozen across the armed step; we thaw it
  // when the intro actually fires.
  if (!beats[BEAT_GOBLIN_INTRO]) {
    if (beats[BEAT_GOBLIN_INTRO_ARMED]) {
      queueDialogue(state, "tutorial-goblin-intro");
      for (const enemy of state.enemies ?? []) {
        if (enemy.kind !== "fire-goblin") continue;
        const memory = enemy.behaviorMemory as Record<string, unknown> | undefined;
        if (memory && memory.frozen === true) {
          memory.frozen = false;
        }
      }
      beats[BEAT_GOBLIN_INTRO] = true;
    } else if (
      fireGoblinIsInSight(state, playerPos) ||
      playerPos.x >= TUTORIAL_ROOM_ENTER_COL
    ) {
      beats[BEAT_GOBLIN_INTRO_ARMED] = true;
    }
  }

  // Beat: rock-pickup — fires once the player has collected their first rock.
  // Rocks are placed on the goblin room floor on the way to the fight; pickup
  // increments rockCount during movePlayer, which runs before this hook.
  if (!beats[BEAT_ROCK_PICKUP] && (state.rockCount ?? 0) > 0) {
    queueDialogue(state, "tutorial-rock-pickup");
    beats[BEAT_ROCK_PICKUP] = true;
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

  // (The room-above goblins are no longer frozen — they pursue from spawn —
  // so there's no thaw beat for them here any more.)

  // Beat: chest-locked dialogue the first time the hero steps onto ANY
  // locked chest tile without a key. The dialogue is a generic "It's locked;
  // you might need a key.", so firing on whichever locked chest the player
  // encounters first is what we want — works for both the goblin-room sword
  // chest and the room-above shield chest, in whatever order the player
  // hits them, without anchoring to a hard-coded position.
  const chestTile = state.mapData.subtypes[playerPos.y]?.[playerPos.x] ?? [];
  if (
    !beats[BEAT_CHEST_LOCKED] &&
    !state.hasKey &&
    chestTile.includes(TileSubtype.CHEST) &&
    chestTile.includes(TileSubtype.LOCK)
  ) {
    queueDialogue(state, "tutorial-chest-locked");
    beats[BEAT_CHEST_LOCKED] = true;
  }

  // Beat: sword-pickup — fires the first turn the hero is carrying a sword.
  if (!beats[BEAT_SWORD_PICKUP] && state.hasSword === true) {
    queueDialogue(state, "tutorial-sword-pickup");
    beats[BEAT_SWORD_PICKUP] = true;
  }

  // Beat: shield-pickup — fires the first turn the hero is carrying a shield.
  if (!beats[BEAT_SHIELD_PICKUP] && state.hasShield === true) {
    queueDialogue(state, "tutorial-shield-pickup");
    beats[BEAT_SHIELD_PICKUP] = true;
  }

  // Beat: low-health — fires the first time the hero drops to 1 HP. The
  // food/no-food variant picks the dialogue at trigger time so we don't tell
  // a player to press F if they don't have any food yet.
  if (!beats[BEAT_LOW_HEALTH] && state.heroHealth === 1) {
    const hasFood = (state.foodCount ?? 0) > 0;
    queueDialogue(
      state,
      hasFood ? "tutorial-low-health-with-food" : "tutorial-low-health-no-food"
    );
    beats[BEAT_LOW_HEALTH] = true;
  }

  // Beat: exit-locked hint — fires when the hero reaches the exit door
  // WITHOUT the exit key. The door blocks them, so this nudges them to go
  // find the key rather than getting stuck wondering why it won't open.
  if (
    !beats[BEAT_EXIT_LOCKED] &&
    state.hasExitKey !== true &&
    isAdjacentToExit(state, playerPos)
  ) {
    queueDialogue(state, "tutorial-exit-locked");
    beats[BEAT_EXIT_LOCKED] = true;
  }

  // Beat: exit-approach outro — fires when the hero is standing adjacent to
  // the exit door AND already holds the exit key (so they're about to step
  // through, not just sightseeing).
  if (
    !beats[BEAT_EXIT_APPROACH] &&
    state.hasExitKey === true &&
    isAdjacentToExit(state, playerPos)
  ) {
    queueDialogue(state, "tutorial-exit-approach");
    beats[BEAT_EXIT_APPROACH] = true;
  }

  state.tutorialBeats = beats;
  return state;
}
