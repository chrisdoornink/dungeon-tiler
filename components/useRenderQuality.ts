"use client";

import { useEffect, useState } from "react";
import {
  detectRenderQuality,
  type RenderQuality,
} from "../lib/render_quality";

/**
 * Current effects tier for this device. See `lib/render_quality` for the policy.
 *
 * Starts at "reduced" and upgrades after mount rather than the other way round: it
 * keeps SSR and hydration in agreement, and it means a phone never paints one frame
 * of the expensive version before we work out that it can't afford it.
 */
export function useRenderQuality(): RenderQuality {
  const [quality, setQuality] = useState<RenderQuality>("reduced");

  useEffect(() => {
    const sync = () => setQuality(detectRenderQuality(window));
    sync();

    window.addEventListener("resize", sync);
    // Re-check if the OS motion preference is toggled mid-session.
    const motion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    motion?.addEventListener?.("change", sync);

    return () => {
      window.removeEventListener("resize", sync);
      motion?.removeEventListener?.("change", sync);
    };
  }, []);

  return quality;
}
