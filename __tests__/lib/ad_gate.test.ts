/**
 * The portal ad-pacing rule: an ad at a floor transition when it has been a reasonable
 * while OR when a fast player has burned through several floors.
 *
 * Worth pinning down precisely because both clauses exist to cover a case the other gets
 * wrong, and because the failure modes are invisible in testing — too loose and players get
 * interrupted constantly, too tight and the game shows no ads at all.
 */
import {
  AD_MAX_FLOORS,
  AD_MIN_MS,
  createAdGate,
} from "../../lib/ad_gate";
import {
  hasAdBreakHandler,
  runAdBreak,
  setAdBreakHandler,
} from "../../lib/ad_break";

const T0 = 1_000_000_000_000;

describe("ad gate", () => {
  it("does not fire on the very first transition", () => {
    // CrazyGames requires "a reasonable amount of gameplay" before the first ad, and the
    // gate is seeded at session start, so floor 1 -> 2 can never be an ad.
    const gate = createAdGate(T0);
    expect(gate.onFloorTransition(T0 + 1000)).toBe(false);
  });

  it("fires on the time rule for a slow player who has barely descended", () => {
    const gate = createAdGate(T0);
    expect(gate.onFloorTransition(T0 + AD_MIN_MS - 1)).toBe(false);
    expect(gate.onFloorTransition(T0 + AD_MIN_MS)).toBe(true);
  });

  it("fires on the floor rule for a sprinter the clock would never catch", () => {
    const gate = createAdGate(T0);
    // Four floors inside a single minute — the time rule is nowhere close.
    let fired = false;
    for (let i = 1; i <= AD_MAX_FLOORS; i++) {
      fired = gate.onFloorTransition(T0 + i * 5_000);
    }
    expect(fired).toBe(true);
  });

  it("never lets more than AD_MAX_FLOORS pass without one", () => {
    const gate = createAdGate(T0);
    let sinceLast = 0;
    let worst = 0;
    // 40 floors at a blistering 3s each: the clock rule never opens, so the floor rule
    // has to carry the whole run.
    for (let i = 1; i <= 40; i++) {
      sinceLast += 1;
      if (gate.onFloorTransition(T0 + i * 3_000)) {
        worst = Math.max(worst, sinceLast);
        sinceLast = 0;
      }
    }
    expect(worst).toBeLessThanOrEqual(AD_MAX_FLOORS);
    expect(worst).toBeGreaterThan(0); // it did fire
  });

  it("consumes the slot on an attempt, so a refused ad is not retried next floor", () => {
    // The gate can't see whether the ad actually played — an adblocked or cooled-down
    // request still spends the window. Otherwise an adblocked player would trigger a
    // request at every single transition for the rest of the run.
    const gate = createAdGate(T0);
    for (let i = 1; i <= AD_MAX_FLOORS; i++) gate.onFloorTransition(T0 + i * 1000);
    expect(gate.floorsSinceAd()).toBe(0);
    expect(gate.onFloorTransition(T0 + AD_MAX_FLOORS * 1000 + 1000)).toBe(false);
  });

  it("wouldShow peeks without counting a floor or spending the slot", () => {
    const gate = createAdGate(T0);
    for (let i = 0; i < 10; i++) expect(gate.wouldShow(T0 + 1000)).toBe(false);
    expect(gate.floorsSinceAd()).toBe(0);
    expect(gate.wouldShow(T0 + AD_MIN_MS)).toBe(true);
    expect(gate.floorsSinceAd()).toBe(0);
  });

  it("keeps independent state per run", () => {
    const a = createAdGate(T0);
    const b = createAdGate(T0);
    for (let i = 1; i <= AD_MAX_FLOORS; i++) a.onFloorTransition(T0 + i * 1000);
    expect(a.floorsSinceAd()).toBe(0);
    expect(b.floorsSinceAd()).toBe(0);
    expect(b.wouldShow(T0 + 1000)).toBe(false);
  });
});

/**
 * The seam itself. The load-bearing property is that the Next app — which never registers a
 * handler — behaves exactly as if none of this existed.
 */
describe("ad break seam", () => {
  afterEach(() => setAdBreakHandler(null));

  it("reports no handler by default, so the Next app skips the promise path entirely", () => {
    expect(hasAdBreakHandler()).toBe(false);
  });

  it("resolves immediately with no handler", async () => {
    await expect(runAdBreak({ floor: 7 })).resolves.toBeUndefined();
  });

  it("runs a registered handler and passes the floor", async () => {
    const seen: number[] = [];
    setAdBreakHandler(async ({ floor }) => {
      seen.push(floor);
    });
    expect(hasAdBreakHandler()).toBe(true);
    await runAdBreak({ floor: 12 });
    expect(seen).toEqual([12]);
  });

  it("swallows a rejecting handler — an ad failure must never strand the wipe", async () => {
    setAdBreakHandler(async () => {
      throw new Error("adblock");
    });
    await expect(runAdBreak({ floor: 3 })).resolves.toBeUndefined();
  });

  it("unregisters cleanly", async () => {
    setAdBreakHandler(async () => {});
    setAdBreakHandler(null);
    expect(hasAdBreakHandler()).toBe(false);
    await expect(runAdBreak({ floor: 1 })).resolves.toBeUndefined();
  });
});
