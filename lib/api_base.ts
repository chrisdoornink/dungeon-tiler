/**
 * Where the game's own API lives.
 *
 * In the Next app this is "" — every call is a same-origin relative fetch, exactly as
 * before this module existed.
 *
 * The standalone portal bundle is a static CDN asset with no server of its own, so it sets
 * `window.__API_BASE__` to the real origin (torchboy.com) in its index.html and the
 * endless leaderboard calls go there cross-origin. That is the whole reason
 * /api/endless-run sends CORS headers. Mirrors how `__ASSET_BASE__` works for images.
 */
import { isStandalone } from "./standalone_env";

declare global {
  interface Window {
    /** Absolute origin (no trailing slash) for API calls, e.g. "https://torchboy.com". */
    __API_BASE__?: string;
  }
}

export function apiBase(): string {
  if (typeof window === "undefined") return "";
  return window.__API_BASE__ ?? "";
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}

/**
 * Whether an API call can actually reach a server.
 *
 * The guard that matters is the standalone-with-no-base case: a relative fetch from a
 * portal CDN subpath would resolve against the PORTAL's origin and 404 (or worse, hit
 * someone else's route). A portal build that hasn't been pointed at an origin therefore
 * behaves like the pre-leaderboard standalone did — local best only, no network.
 */
export function hasApiBase(): boolean {
  return !isStandalone() || apiBase() !== "";
}
