/**
 * When a floor transition earns a video ad.
 *
 * This is POLICY, not plumbing, which is why it lives in lib/ next to the rest of the game's
 * tuning rather than in standalone/ with the CrazyGames SDK binding: how often a player is
 * interrupted is a game-feel decision, and standalone/ is excluded from tsconfig and the
 * type check, so anything meaningful in there is untested by construction.
 *
 * THE RULE (from the game's owner): show an ad when it has been a reasonable while, OR when
 * a fast player has burned through several floors. Two clauses because floors and minutes
 * come apart badly at the extremes — a careful player can spend five minutes on one floor,
 * and a confident one can be four floors deep in ninety seconds. Time alone would never
 * interrupt the sprinter; depth alone would interrupt the explorer constantly.
 *
 * CrazyGames enforces its own ~3-minute midgame cooldown on top of this and answers
 * `adCooldown` when asked too soon. That is expected: an attempt spends the slot either way
 * (see onFloorTransition), so asking early costs us that window instead of starting a retry
 * loop on every subsequent floor.
 */

/** Minimum wall-clock gap between ads. Middle of the 3-5 minute range asked for. */
export const AD_MIN_MS = 4 * 60_000;

/** Never let more than this many floors pass without an ad. This is what catches sprinters. */
export const AD_MAX_FLOORS = 4;

export interface AdGate {
  /**
   * Count one floor transition and report whether it earns an ad. Consumes the slot when it
   * returns true, so each transition must call this exactly once.
   */
  onFloorTransition(now?: number): boolean;
  /** Same question, without counting a floor or consuming the slot. For tests and debugging. */
  wouldShow(now?: number): boolean;
  /** Floors counted since the last ad. */
  floorsSinceAd(): number;
  reset(now?: number): void;
}

/**
 * `now` seeds the clock, and seeding it at session start is what keeps an ad off the very
 * first transition: CrazyGames requires "a reasonable amount of gameplay" before the first
 * ad, and a fresh gate has to clear either AD_MIN_MS or AD_MAX_FLOORS to open.
 */
export function createAdGate(now: number = Date.now()): AdGate {
  let lastAdAt = now;
  let floors = 0;

  const wouldShow = (at: number): boolean =>
    at - lastAdAt >= AD_MIN_MS || floors >= AD_MAX_FLOORS;

  return {
    onFloorTransition(at: number = Date.now()): boolean {
      floors += 1;
      if (!wouldShow(at)) return false;
      // Spend the slot on the ATTEMPT, not on a successful play. If the ad is refused
      // (cooldown, adblock, no fill) we wait out the full interval again rather than asking
      // on the next floor — otherwise an adblocked player triggers a request at every single
      // transition for the rest of the run.
      lastAdAt = at;
      floors = 0;
      return true;
    },
    wouldShow(at: number = Date.now()): boolean {
      return wouldShow(at);
    },
    floorsSinceAd(): number {
      return floors;
    },
    reset(at: number = Date.now()): void {
      lastAdAt = at;
      floors = 0;
    },
  };
}
