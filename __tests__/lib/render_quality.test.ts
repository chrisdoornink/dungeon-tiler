/**
 * Which devices get the cheap version of the atmosphere effects.
 *
 * Worth pinning down because the failure is invisible from a desk: get it wrong in one
 * direction and desktop players quietly lose the good-looking mist, get it wrong in the
 * other and the pink realm locks up on a phone the moment the cloud grows — which is
 * exactly what shipped before this existed.
 */
import {
  NARROW_VIEWPORT_PX,
  PINK_SPARKLE_COUNT,
  detectRenderQuality,
  parseQualityOverride,
  qualityFor,
  readQualityEnvironment,
  type QualityEnvironment,
} from "../../lib/render_quality";

const DESKTOP: QualityEnvironment = {
  coarsePointer: false,
  reducedMotion: false,
  narrowViewport: false,
};

/** Minimal stand-in for the bits of `window` that readQualityEnvironment touches. */
function fakeWindow(opts: {
  matches?: string[];
  search?: string;
  innerWidth?: number;
  noMatchMedia?: boolean;
}): Window {
  const matches = new Set(opts.matches ?? []);
  return {
    innerWidth: opts.innerWidth ?? 1440,
    location: { search: opts.search ?? "" },
    matchMedia: opts.noMatchMedia
      ? undefined
      : (query: string) => ({ matches: matches.has(query) }),
  } as unknown as Window;
}

describe("render quality policy", () => {
  it("leaves a plain desktop on the full-fat effects", () => {
    expect(qualityFor(DESKTOP)).toBe("full");
  });

  it.each([
    ["a touch device", { coarsePointer: true }],
    ["a narrow viewport", { narrowViewport: true }],
    ["an OS reduce-motion preference", { reducedMotion: true }],
  ])("drops to reduced for %s", (_label, patch) => {
    expect(qualityFor({ ...DESKTOP, ...patch })).toBe("reduced");
  });

  it("lets an explicit override beat every heuristic, in both directions", () => {
    // `?fx=full` on a phone is how you confirm the phone really is the bottleneck;
    // `?fx=reduced` on a desktop is how you look at the cheap version before shipping it.
    const phone = { ...DESKTOP, coarsePointer: true, narrowViewport: true };
    expect(qualityFor({ ...phone, override: "full" })).toBe("full");
    expect(qualityFor({ ...DESKTOP, override: "reduced" })).toBe("reduced");
  });

  it("ignores a junk override rather than guessing", () => {
    expect(parseQualityOverride("potato")).toBeNull();
    expect(parseQualityOverride("")).toBeNull();
    expect(parseQualityOverride(null)).toBeNull();
    expect(parseQualityOverride("full")).toBe("full");
    expect(parseQualityOverride("reduced")).toBe("reduced");
  });

  it("reads the environment off the window", () => {
    const env = readQualityEnvironment(
      fakeWindow({
        matches: ["(pointer: coarse)"],
        search: "?fx=reduced",
        innerWidth: 390,
      })
    );
    expect(env).toEqual({
      coarsePointer: true,
      reducedMotion: false,
      narrowViewport: true,
      override: "reduced",
    });
  });

  it("treats the narrow-viewport boundary as exclusive", () => {
    const at = readQualityEnvironment(
      fakeWindow({ innerWidth: NARROW_VIEWPORT_PX })
    );
    const below = readQualityEnvironment(
      fakeWindow({ innerWidth: NARROW_VIEWPORT_PX - 1 })
    );
    expect(at.narrowViewport).toBe(false);
    expect(below.narrowViewport).toBe(true);
  });

  it("does not call a zero-width window narrow", () => {
    // Some embed/prerender contexts report 0 before layout; that is not a phone.
    expect(readQualityEnvironment(fakeWindow({ innerWidth: 0 })).narrowViewport).toBe(
      false
    );
  });

  it("survives a window with no matchMedia", () => {
    const env = readQualityEnvironment(fakeWindow({ noMatchMedia: true }));
    expect(env.coarsePointer).toBe(false);
    expect(env.reducedMotion).toBe(false);
  });

  it("assumes reduced when there is no window at all", () => {
    // SSR renders the cheap version so a phone never paints one expensive frame before
    // the client works out what it is. Desktop upgrades on mount.
    expect(detectRenderQuality(undefined)).toBe("reduced");
  });

  it("renders strictly fewer sparkles on the reduced tier", () => {
    expect(PINK_SPARKLE_COUNT.reduced).toBeLessThan(PINK_SPARKLE_COUNT.full);
    expect(PINK_SPARKLE_COUNT.reduced).toBeGreaterThan(0);
  });
});
