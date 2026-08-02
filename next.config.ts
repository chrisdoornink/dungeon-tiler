import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    // Strip console.log/info/debug from PRODUCTION builds so gameplay debug
    // logging ([PLAYER DAMAGE], [ENEMY ATTACK], [SNAKE POT], etc.) never
    // reaches a live player's console. Errors and warnings are kept. Dev
    // builds keep everything for debugging.
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [
          {
            // Art lives at a stable URL (no content hash), so `immutable` was a
            // promise we can't keep: recoloring a sprite in place left every
            // device that had already fetched it pinned to the old art for a
            // full year, with no revalidation even on reload. (That is exactly
            // what happened to the snake medallion when it went blue.)
            //
            // The real cache-bust is renaming the file when its pixels change —
            // do that first. This header is the safety net for when we forget:
            // hard-cached for a week, then served stale while it refreshes in
            // the background, so a missed rename goes stale in days, not months.
            // Browsers without stale-while-revalidate degrade to one cheap
            // conditional request per week (304, no body).
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
