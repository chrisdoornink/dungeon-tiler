// Central asset-URL resolver.
//
// The same shared engine runs in two places:
//   - The Next.js app: assets are served from the site root as absolute paths
//     ("/images/hero/hero-front.png").
//   - The standalone HTML5 bundle (Poki/CrazyGames): the game is hosted at an
//     arbitrary CDN subpath and loaded in an iframe, so every asset URL must be
//     RELATIVE to the document — an absolute "/images/..." would 404.
//
// The base is read from `window.__ASSET_BASE__`, which the standalone's index.html
// sets in a classic <script> that runs BEFORE any ES module evaluates. Reading it
// lazily (per call) means module-level data such as the enemy registry and the
// environment config can call assetUrl() at import time and still see the base.
//
// The Next.js app and Jest never define `window.__ASSET_BASE__`, so assetUrl() is a
// NO-OP there and returns the absolute path unchanged — byte-for-byte identical output.

declare global {
  // eslint-disable-next-line no-var
  interface Window {
    __ASSET_BASE__?: string;
  }
}

function currentBase(): string {
  if (typeof window === "undefined") return "";
  const b = window.__ASSET_BASE__;
  if (!b || b === "/") return "";
  return b.endsWith("/") ? b : b + "/";
}

/**
 * Resolve an absolute "/images/..." asset path for the current deploy target.
 * No-op (returns input unchanged) when no base is set — always pass the canonical
 * absolute path (also works when passed a partial prefix like "/images/wall/wall-").
 */
export function assetUrl(path: string): string {
  const base = currentBase();
  return base ? base + path.replace(/^\/+/, "") : path;
}

export {};
