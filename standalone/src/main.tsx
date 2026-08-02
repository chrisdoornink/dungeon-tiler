import { createRoot } from "react-dom/client";
// The shared engine's tile sizing (var(--tile-size)) and lighting (.fov-tier-*)
// live in the app's global stylesheet. The real app loads it via layout.tsx; the
// standalone must import it directly or tiles collapse to 0 height.
import "../../app/globals.css";
// Self-hosted pixel fonts + CSS vars globals.css expects (imported after globals.css).
import "./fonts.css";
// Iframe/portal input-hardening styles (no text selection, no overscroll/zoom).
import "./standalone.css";
import EndlessApp from "./EndlessApp";
import { initCrazyGames, loadingStart } from "./crazygames";

// NOTE: the asset base (window.__ASSET_BASE__) is set in index.html before any module
// loads, so assetUrl() resolves correctly even for import-time data (enemy registry,
// environment config). Nothing to configure here.

// Iframe input hardening. The game listens for keys on `window`, but a cross-origin
// portal iframe only receives them once it has focus — so grab focus on load and on the
// first pointer press. Also swallow the DEFAULT action of the movement keys (arrows /
// space / page keys) so they drive the hero instead of scrolling the portal page.
// preventDefault does NOT stop the game's own window listener from firing.
const GAME_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  " ", "Spacebar", "PageUp", "PageDown", "Home", "End",
]);
window.addEventListener("load", () => window.focus());
window.addEventListener("pointerdown", () => window.focus());
window.addEventListener(
  "keydown",
  (e) => {
    if (GAME_KEYS.has(e.key)) e.preventDefault();
  },
  { passive: false }
);

// No StrictMode: it double-invokes effects in dev, which would double-init the
// game engine / localStorage. One clean mount.
//
// The CrazyGames SDK is init'd BEFORE the first render and awaited, because their docs put
// init on the loading screen and because gameplayStart/requestAd are no-ops until it
// resolves — mounting first would race the player past a lifecycle the SDK never saw.
// initCrazyGames() never rejects and returns immediately when the SDK is absent (local dev,
// adblocked, or served anywhere but CrazyGames), so this cannot delay or break those.
// loadingStart() comes AFTER init resolves, not before: every wrapper in crazygames.ts is
// gated on init having succeeded, so calling it first would silently drop the signal. The
// matching loadingStop() fires when BlockingPreloader finishes warming assets.
const root = createRoot(document.getElementById("root")!);
void initCrazyGames().then(() => {
  loadingStart();
  root.render(<EndlessApp />);
});
