"use client";

import React, { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import { CRITICAL_ASSETS } from "../lib/assets_manifest";

interface BlockingPreloaderProps {
  onReady: () => void;
}

/**
 * Blocking preloader that loads a curated list of images.
 * Shows a loading message with thumbnails of assets as they load to build intrigue.
 * Calls onReady() once all assets are successfully cached (or attempted).
 */
const BlockingPreloader: React.FC<BlockingPreloaderProps> = ({ onReady }) => {
  const manifest = useMemo(() => CRITICAL_ASSETS.slice(), []);
  const [loaded, setLoaded] = useState<number>(0);
  const [failed, setFailed] = useState<number>(0);
  const [thumbs, setThumbs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const warm = async () => {
      // Load in parallel but limit concurrency a bit to avoid spikes
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
              img.onload = () => {
                if (!cancelled) {
                  setLoaded((n) => n + 1);
                  setThumbs((arr) => (arr.includes(cur) ? arr : [...arr, cur]));
                }
                resolve();
              };
              img.onerror = () => {
                if (!cancelled) setFailed((n) => n + 1);
                resolve();
              };
              img.src = cur;
            } catch {
              if (!cancelled) setFailed((n) => n + 1);
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
  }, [manifest, onReady]);

  const total = manifest.length;
  const done = loaded + failed;
  const pct = Math.min(100, Math.round((done / total) * 100));

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="w-full max-w-3xl mx-auto bg-black/70 text-gray-100 rounded-lg p-6 border border-gray-700 shadow-xl">
        <h1 className="text-xl font-semibold mb-2">Preparing the Dungeon…</h1>
        <p className="text-sm text-gray-300 mb-4">
          Fetching textures and sprites so everything appears instantly.
        </p>
        <div className="w-full bg-gray-800 rounded h-2 overflow-hidden mb-3">
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-gray-400 mb-4">
          Loaded {loaded} / {total} assets {failed > 0 ? `(failed: ${failed})` : ""}
        </div>
        <div className="grid grid-cols-8 gap-2 max-h-48 overflow-auto rounded border border-gray-700 p-2 bg-black/40">
          {thumbs.map((src) => (
            <div key={src} className="w-12 h-12 bg-gray-800 rounded overflow-hidden">
              <NextImage
                src={src}
                alt="asset"
                width={48}
                height={48}
                className="w-full h-full object-contain"
                priority
                sizes="48px"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-400">
          Loading only critical assets first. Additional sprites load in the background.
        </div>
      </div>
    </div>
  );
};

export default BlockingPreloader;
