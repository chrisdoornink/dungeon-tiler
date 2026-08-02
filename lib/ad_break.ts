/**
 * The one seam the portal builds use to put a video ad inside a floor transition.
 *
 * A module-level handler rather than a prop threaded down through GameView -> TilemapGrid
 * -> FloorTransition, because this is portal-only behavior and CLAUDE.md's standing rule
 * for `standalone/` is that everything portal-specific must be a NO-OP in the Next app.
 * With a registry that is true by construction: only the standalone entry point ever calls
 * setAdBreakHandler, so in the Next app there is no handler, `hasAdBreakHandler()` is
 * false, and the transition never even asks.
 *
 * WHY the floor transition and not some overlay of our own: the iris wipe already blocks
 * input for its whole duration (see the `if (floorTransition) return` guard in
 * TilemapGrid's key handler) and already paints the screen fully black in its middle
 * phase. That satisfies CrazyGames' two hard requirements for a midgame ad — the game must
 * be paused and must not be mid-gameplay — without inventing a pause state the game
 * otherwise has no concept of. There is no audio system yet, so "mute during the ad" is
 * currently free; if sound ships, mute it inside the handler, not here.
 */

/** Awaited while the screen is fully black. Resolve to let the wipe finish opening. */
export type AdBreakHandler = (ctx: { floor: number }) => Promise<void>;

let handler: AdBreakHandler | null = null;

export function setAdBreakHandler(fn: AdBreakHandler | null): void {
  handler = fn;
}

/**
 * Whether anything is registered. Callers check this so the no-handler case skips the
 * promise path entirely rather than awaiting an already-resolved one — the Next app's
 * transition timing stays byte-identical to before this existed.
 */
export function hasAdBreakHandler(): boolean {
  return handler !== null;
}

/**
 * Run the ad break, swallowing everything. An ad that fails, is blocked by an adblocker,
 * or hangs must never strand the player on a black screen — a rejected handler resolves
 * here and the wipe opens as if no ad had been asked for. (The handler is responsible for
 * its own timeout; this only guarantees a rejection is not fatal.)
 */
export async function runAdBreak(ctx: { floor: number }): Promise<void> {
  if (!handler) return;
  try {
    await handler(ctx);
  } catch {
    // ignore — never block the transition on an ad
  }
}
