/**
 * The Amber Moth's rewind: a ring buffer of recent world snapshots, and the restore
 * that winds the hero back into one of them.
 *
 * See .claude/features/amber-moth-rewind/index.md for the design. The short version:
 *
 *  - Up to REWIND_MAX_DEPTH (10) snapshots live on GameState.rewindHistory, newest last.
 *  - Snapshots are pushed from movePlayer — the one choke point every turn passes
 *    through — and only when the hero actually MOVED, so wall-bumps and standing
 *    actions never burn a history slot. "Rewind five steps" then means five real steps.
 *  - A rewind restores the whole world (map, enemies, NPCs, health, items) but
 *    deliberately does NOT restore cumulative stats or the charm's own charge. See
 *    CARRY_FORWARD_KEYS below for why each exception exists.
 *
 * This module imports the enemy/NPC serializers from ./utils directly and takes
 * GameState as a TYPE-only import, so game-state.ts -> rewind.ts stays a one-way edge
 * with no runtime import cycle.
 */

import { rehydrateEnemies, type PlainEnemy } from "../enemy";
import { rehydrateNPCs, type PlainNPC } from "../npc";
import { serializeEnemies, serializeNPCs } from "./utils";
import type { GameState } from "./game-state";

/** The furthest back a manual rewind can reach. */
export const REWIND_MAX_DEPTH = 10;

/**
 * How far the automatic on-death rewind goes. Fixed rather than player-chosen: the hero
 * is dead, there is nobody left to make the choice. Clamped to what history actually
 * holds, so dying on your third step of a floor winds back three.
 */
export const REWIND_DEATH_DEPTH = 5;

/**
 * One recorded moment. The payload is the same shape checkpoints use (enemies and NPCs
 * flattened to plain JSON, the RNG closure dropped) plus the context it was taken in.
 */
export interface RewindSnapshot {
  /** Floor + sub-area identity at capture time. A change here invalidates the buffer. */
  context: string;
  /** Cumulative step count at capture time — what the overlay counts back from. */
  steps: number;
  state: RewindPayload;
}

type RewindPayload = Omit<
  GameState,
  "combatRng" | "enemies" | "npcs" | "rewindHistory"
> & {
  enemies?: PlainEnemy[];
  npcs?: PlainNPC[];
};

/**
 * Fields the present keeps when winding back. Everything else comes from the snapshot.
 *
 *  - `stats`: cumulative counters stay monotonic. The fiction says those steps never
 *    happened, but `steps` is the daily score and lib/endless_validation.ts shadow-flags
 *    any run whose steps/kills/damage regress (`stats:regressed`). Monotonic stats mean
 *    the charm can never forge a better score, and keep it safe to extend to endless.
 *  - `rewindCharges`: the caller sets this explicitly to the post-spend value. Taking it
 *    from a snapshot recorded BEFORE the charm was spent would refund the charge and
 *    make the rewind infinitely reusable.
 *  - `lastCheckpoint`: a checkpoint is progress you earned; a rewind shouldn't revoke it.
 *  - The `reached*`/`bossDefeated` latches: run-level achievement flags. You did find the
 *    pink realm, whatever time says.
 */
const CARRY_FORWARD_KEYS = [
  "stats",
  "lastCheckpoint",
  "reachedPinkRealm",
  "reachedOutsideWorld",
  "reachedBossRoom",
  "bossDefeated",
  "dailyBossKind",
  "bossEntranceKind",
] as const satisfies readonly (keyof GameState)[];

/**
 * Which map the hero is standing on, as a comparable string. Snapshots from a different
 * context are unreachable — winding back across a floor swap or a realm warp would drag
 * the hero into a map that is no longer loaded. Derived from state rather than hooked
 * into each transition site, so warps added later are handled without new code.
 */
export function rewindContext(state: GameState): string {
  return [
    state.currentFloor ?? 1,
    state.inPinkRealm ? "realm" : "",
    state.inNightmare ? "nightmare" : "",
    state.inOutsideWorld ? "outside" : "",
    state.inBossRoom ? "boss" : "",
  ].join("|");
}

function toPayload(state: GameState): RewindPayload {
  const {
    combatRng,
    enemies,
    npcs,
    rewindHistory,
    ...rest
  } = state;
  void combatRng;
  void rewindHistory; // never nest a history inside a snapshot — that grows exponentially
  return {
    ...(JSON.parse(JSON.stringify(rest)) as Omit<
      GameState,
      "combatRng" | "enemies" | "npcs" | "rewindHistory"
    >),
    enemies: serializeEnemies(enemies),
    npcs: serializeNPCs(npcs),
  };
}

/**
 * Record `before` as the moment preceding `after`, and return the history `after` should
 * carry. No-ops unless the hero actually took a step (`stats.steps` went up), so only
 * real movement fills the buffer.
 *
 * Called by movePlayer with the pre-move and post-move states.
 */
export function recordRewindStep(
  before: GameState,
  after: GameState
): RewindSnapshot[] | undefined {
  // Nothing to rewind to until the hero is carrying the charm. Recording for everyone
  // would mean deep-cloning the whole world every step of every run for nothing.
  //
  // Gated on BEFORE, not after, and that difference is load-bearing: the step that picks
  // the charm up must not be recorded. Gating on `after` records the pre-pickup world —
  // in which the charm is still lying on the floor — so a player could rewind onto it,
  // walk forward, and collect it again for another charge, forever.
  if ((before.rewindCharges ?? 0) <= 0) return after.rewindHistory;

  const moved = (after.stats?.steps ?? 0) > (before.stats?.steps ?? 0);
  if (!moved) return after.rewindHistory;

  const context = rewindContext(before);

  // A step that CHANGED context is a floor swap or a realm warp. Everything older is
  // unreachable, and the pre-warp world isn't worth keeping either — rewinding across a
  // one-way progress gate would let a player re-farm the floor they just left. Drop the
  // buffer and skip the snapshot entirely rather than deep-cloning a world nothing can
  // reach.
  if (rewindContext(after) !== context) return [];

  const kept = (after.rewindHistory ?? []).filter(
    (snap) => snap.context === context
  );
  const next: RewindSnapshot[] = [
    ...kept,
    { context, steps: before.stats?.steps ?? 0, state: toPayload(before) },
  ];
  // Drop the oldest once past the cap.
  return next.slice(-REWIND_MAX_DEPTH);
}

/**
 * How many steps back the hero can currently wind — the number of snapshots that share
 * the hero's present context, capped at REWIND_MAX_DEPTH.
 */
export function rewindDepthAvailable(state: GameState): number {
  const context = rewindContext(state);
  const usable = (state.rewindHistory ?? []).filter(
    (snap) => snap.context === context
  );
  return Math.min(usable.length, REWIND_MAX_DEPTH);
}

/**
 * Wind the hero back `depth` steps. Returns null when history can't reach that far
 * (including depth <= 0), so callers can leave the charm unspent.
 *
 * `spendCharge` defaults true; the preview UI passes false to look at a past state
 * without paying for it, and commits later with the charge spent.
 */
export function rewindStateBy(
  state: GameState,
  depth: number,
  opts?: { spendCharge?: boolean }
): GameState | null {
  const available = rewindDepthAvailable(state);
  if (depth <= 0 || available <= 0) return null;
  const effective = Math.min(depth, available);

  const context = rewindContext(state);
  const usable = (state.rewindHistory ?? []).filter(
    (snap) => snap.context === context
  );
  // depth 1 is the newest snapshot (one step back), so index from the end.
  const index = usable.length - effective;
  const target = usable[index];
  if (!target) return null;

  const { enemies, npcs, ...rest } = target.state;
  const spendCharge = opts?.spendCharge !== false;

  const restored = {
    ...(JSON.parse(JSON.stringify(rest)) as Omit<
      RewindPayload,
      "enemies" | "npcs"
    >),
    enemies: enemies ? rehydrateEnemies(enemies) : [],
    npcs: npcs ? rehydrateNPCs(npcs) : undefined,
    combatRng: state.combatRng,
    // Everything below the snapshot restore: the present's word overrules the past's.
    rewindCharges: Math.max(
      0,
      (state.rewindCharges ?? 0) - (spendCharge ? 1 : 0)
    ),
    // History behind the rewind point survives, so a 10-step charm can be spent as
    // several shorter hops; everything after the landing point is now a future that
    // did not happen.
    rewindHistory: usable.slice(0, index),
    // The rewind exists to undo this.
    deathCause: undefined,
  } as GameState;

  const overrides = restored as unknown as Record<string, unknown>;
  for (const key of CARRY_FORWARD_KEYS) {
    const present = state[key];
    if (present === undefined) {
      delete overrides[key];
    } else {
      overrides[key] = present;
    }
  }

  return restored;
}
