"use client";

import React, { useEffect } from "react";
import { assetUrl } from "../lib/asset_url";
import { CRITICAL_ASSETS } from "../lib/assets_manifest";

interface BlockingPreloaderProps {
  onReady: () => void;
}

/**
 * Simple blocking preloader that loads critical assets in the background.
 * Shows a minimal loading spinner while assets are being cached.
 * Calls onReady() once all assets are successfully cached (or attempted).
 */
const BlockingPreloader: React.FC<BlockingPreloaderProps> = ({ onReady }) => {
  useEffect(() => {
    let cancelled = false;

    const warm = async () => {
      const manifest = CRITICAL_ASSETS;
      const MAX_CONCURRENCY = 8;
      let idx = 0;

      const launch = async () => {
        while (!cancelled && idx < manifest.length) {
          const cur = manifest[idx++];
          await new Promise<void>((resolve) => {
            try {
              const img = new Image();
              img.decoding = "async";
              img.loading = "eager";
              img.onload = () => resolve();
              img.onerror = () => resolve();
              // assets_manifest holds canonical absolute paths; resolve for the deploy
              // target here so the portal build warms "./images/..." rather than 404ing
              // on "/images/...". No-op in the Next app. Wrapped at the load point rather
              // than in the manifest so BackgroundAssetLoader's `includes`/`has` set
              // comparisons keep operating on one consistent (unwrapped) key space.
              img.src = assetUrl(cur);
            } catch {
              resolve();
            }
          });
        }
      };

      const workers = Array.from({ length: MAX_CONCURRENCY }, () => launch());
      await Promise.all(workers);
      if (!cancelled) onReady();
    };

    warm();
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: `url(${assetUrl("/images/presentational/wall-up-close.png")})`,
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-gray-300 text-sm">Loading...</p>
      </div>
    </div>
  );
};

export default BlockingPreloader;
