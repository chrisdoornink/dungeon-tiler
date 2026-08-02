// How much per-frame effect work the renderer is allowed to spend on atmosphere.
//
// Mobile GPUs fall off a cliff on layers that are blurred, blended AND animated at the
// same time: each one has to be re-rasterized and re-composited against its backdrop
// every frame, and the pink realm's mist puts one of those on every misty tile. A big
// cloud multiplied that cost by thirty-odd and made the realm unplayable on a phone.
//
// The "reduced" tier keeps the look but pays for it in compositor-only properties
// (opacity/transform), which cost effectively nothing. Policy lives here rather than in
// the components so it is typechecked and unit-tested, and so the Next app and the
// standalone portal build make the same call.

export type RenderQuality = "full" | "reduced";

/** Pink-realm sparkles rendered per tier. */
export const PINK_SPARKLE_COUNT: Record<RenderQuality, number> = {
  full: 40,
  reduced: 12,
};

/** Widths below this are treated as a phone, matching MobileControls' definition. */
export const NARROW_VIEWPORT_PX = 600;

export interface QualityEnvironment {
  /** Touch-primary device — `(pointer: coarse)`. */
  coarsePointer: boolean;
  /** OS-level "reduce motion" accessibility preference. */
  reducedMotion: boolean;
  /** Viewport narrower than NARROW_VIEWPORT_PX. */
  narrowViewport: boolean;
  /** Explicit `?fx=` override, which beats every heuristic. */
  override?: RenderQuality | null;
}

/**
 * Pick a tier. Deliberately biased toward "reduced": the cheap look is close enough
 * that over-triggering on a fast tablet costs the player very little, while
 * under-triggering on a slow phone costs them the whole realm.
 */
export function qualityFor(env: QualityEnvironment): RenderQuality {
  if (env.override) return env.override;
  if (env.reducedMotion) return "reduced";
  if (env.coarsePointer || env.narrowViewport) return "reduced";
  return "full";
}

/** Parse an `?fx=full` / `?fx=reduced` override; anything else is ignored. */
export function parseQualityOverride(
  value: string | null | undefined
): RenderQuality | null {
  return value === "full" || value === "reduced" ? value : null;
}

/** Read the current environment from a browser window. */
export function readQualityEnvironment(win: Window): QualityEnvironment {
  const media = (query: string): boolean =>
    typeof win.matchMedia === "function" && win.matchMedia(query).matches;

  let override: RenderQuality | null = null;
  try {
    override = parseQualityOverride(
      new URLSearchParams(win.location.search).get("fx")
    );
  } catch {
    // Malformed/absent location — fall through to the heuristics.
  }

  return {
    coarsePointer: media("(pointer: coarse)"),
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    narrowViewport: win.innerWidth > 0 && win.innerWidth < NARROW_VIEWPORT_PX,
    override,
  };
}

/** Convenience: environment + decision in one call. SSR-safe (returns "reduced"). */
export function detectRenderQuality(win?: Window): RenderQuality {
  if (!win) return "reduced";
  return qualityFor(readQualityEnvironment(win));
}
