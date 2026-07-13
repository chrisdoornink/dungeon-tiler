import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  // Autocapture fires a $autocapture event on every click/tap. With the
  // on-screen d-pad and item strip, one game session is thousands of taps —
  // that drains posthog-js's client rate limiter (100-event bucket, 10/sec
  // refill) and then EVERY capture is dropped, including game_complete.
  // We track gameplay with explicit events, so autocapture only adds noise.
  autocapture: false,
  rageclick: false, // repeated same-spot taps are normal gameplay, not rage
  debug: process.env.NODE_ENV === "development",
});

// Expose the client for prod debugging: run `posthog.debug()` in the devtools
// console to log every capture/send (persists across reloads via localStorage;
// `posthog.debug(false)` turns it off again).
if (typeof window !== "undefined") {
  Object.assign(window, { posthog });
}