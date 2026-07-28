/**
 * Maps a URL path to the coarse "surface" of the app it belongs to.
 *
 * Every event we send carries this as a `surface` property (attached in
 * `instrumentation-client.ts` via PostHog's `before_send` hook), so traffic can
 * be broken down in PostHog by area of the app without writing path regexes
 * into every insight — and without a new insight breaking each time a route is
 * added or renamed.
 *
 * The surfaces that matter for keeping an eye on unintended traffic:
 *   - `story`  — unfinished prototype. A trickle of testers is fine; a spike is
 *                a signal it is being shared around before it is ready.
 *   - `stats`  — internal dashboard that reveals daily seeds/secrets.
 *   - `test`   — dev harnesses. Real players should essentially never be here.
 *   - `endless`/`daily` — the intended front doors, for baseline comparison.
 */
export type Surface =
  | "daily"
  | "new_player"
  | "end"
  | "endless"
  | "story"
  | "stats"
  | "tutorial"
  | "privacy"
  | "test"
  | "other";

/**
 * `/` and `/daily-new` render the same component (`/` re-exports it), and the
 * in-game floor transition pushes `/daily-new` directly, so both are one
 * surface. Keeping them merged means the daily's traffic is a single number
 * rather than two that have to be added together.
 */
const EXACT: Record<string, Surface> = {
  "/": "daily",
  "/daily-new": "daily",
  "/new": "new_player",
  "/end": "end",
  "/endless": "endless",
  "/story": "story",
  "/stats": "stats",
  "/tutorial": "tutorial",
  "/privacy": "privacy",
};

export function surfaceForPath(pathname: string | undefined | null): Surface {
  if (!pathname) return "other";

  // Normalize: strip query/hash if a full-ish path was passed, and drop any
  // trailing slash so "/story/" and "/story" do not split into two surfaces.
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";

  const exact = EXACT[path];
  if (exact) return exact;

  // Every dev harness is named /test-*. Collapsing them into one surface is
  // deliberate: the question is "is anyone poking at the sandboxes", not which
  // sandbox — and harnesses come and go too often to enumerate.
  if (path === "/test" || path.startsWith("/test-")) return "test";

  return "other";
}
