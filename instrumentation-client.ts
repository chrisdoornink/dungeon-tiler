import posthog from "posthog-js";
import { surfaceForPath } from "./lib/analytics_surface";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  // Count client-side navigations, not just hard loads. The default (`true`)
  // only fires $pageview when the document loads, so every App Router
  // `router.push` — /new -> /, the floor transition into /daily-new, the run
  // ending at /end — went uncounted. Those are real pageviews and the whole
  // point of this tracking is knowing which screens people actually reach.
  capture_pageview: "history_change",
  // Tag every event with the app area it came from and which of Chris's sites
  // sent it. Both are needed to read the numbers at all:
  //   - `surface` turns "who is hitting /story or the test harnesses" into a
  //     one-property breakdown instead of a pile of path filters.
  //   - `site` is load-bearing because this PostHog project is SHARED with
  //     thelegendof.band and crsswrdl.com. Their paths (/listen, /lyrics,
  //     /about, ...) land in the same event stream, so any unfiltered
  //     path-based insight silently mixes three different websites together.
  before_send: (event) => {
    if (!event) return event;
    const pathname =
      (event.properties?.$pathname as string | undefined) ??
      (typeof window !== "undefined" ? window.location.pathname : undefined);
    event.properties = {
      ...event.properties,
      site: "torchboy",
      surface: surfaceForPath(pathname),
    };
    return event;
  },
  // Autocapture fires a $autocapture event on every click/tap. With the
  // on-screen d-pad and item strip, one game session is thousands of taps —
  // that drains posthog-js's client rate limiter (100-event bucket, 10/sec
  // refill) and then EVERY capture is dropped, including game_complete.
  // We track gameplay with explicit events, so autocapture only adds noise.
  autocapture: false,
  rageclick: false, // repeated same-spot taps are normal gameplay, not rage
  // Session replay is disabled: a constantly-animating game (torch flames,
  // camera, sprites) makes rrweb emit a massive $snapshot stream that drained
  // posthog-js's client rate limiter and dropped real events (game_complete),
  // while producing heavy, low-value replays that burn recording quota. We rely
  // on explicit gameplay events instead. (Overrides the project-level setting.)
  disable_session_recording: true,
  debug: process.env.NODE_ENV === "development",
});

// Expose the client for prod debugging: run `posthog.debug()` in the devtools
// console to log every capture/send (persists across reloads via localStorage;
// `posthog.debug(false)` turns it off again).
if (typeof window !== "undefined") {
  Object.assign(window, { posthog });
}