/**
 * CrazyGames HTML5 SDK v3 wrapper for the portal build.
 *
 * Every export here is safe to call when the SDK is absent — served from torchboy.com, run
 * from `vite dev`, blocked by an adblocker, or a future Poki build that swaps the script.
 * The game must stay fully playable in all of those, which is also a hard CrazyGames
 * requirement ("games must remain functional with adblockers active").
 *
 * API surface used (verified against docs.crazygames.com, July 2026):
 *   window.CrazyGames.SDK.init()
 *   window.CrazyGames.SDK.game.gameplayStart() / gameplayStop()
 *   window.CrazyGames.SDK.game.loadingStart()  / loadingStop()
 *   window.CrazyGames.SDK.game.happytime()
 *   window.CrazyGames.SDK.ad.requestAd(type, { adStarted, adError, adFinished })
 */

import { createAdGate } from "../../lib/ad_gate";

type AdType = "midgame" | "rewarded";

interface AdCallbacks {
  adStarted?: () => void;
  adError?: (err: { code?: string; message?: string }) => void;
  adFinished?: () => void;
}

interface CrazyGamesSDK {
  init?: () => Promise<void>;
  game?: {
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
    happytime?: () => void;
  };
  ad?: {
    requestAd?: (type: AdType, callbacks: AdCallbacks) => void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSDK };
  }
}

function sdk(): CrazyGamesSDK | null {
  if (typeof window === "undefined") return null;
  return window.CrazyGames?.SDK ?? null;
}

let ready = false;

/**
 * Initialize the SDK. Await this before the game starts (their recommendation is to do it
 * on the loading screen). Resolves either way — a failed init just leaves `ready` false and
 * every wrapper below becomes a no-op.
 */
export async function initCrazyGames(): Promise<void> {
  const s = sdk();
  if (!s?.init) return;
  try {
    await s.init();
    ready = true;
  } catch (err) {
    console.warn("[crazygames] init failed; running without the SDK", err);
  }
}

export function isCrazyGames(): boolean {
  return ready;
}

/** Lifecycle hooks. Silent no-ops without the SDK. */
export function gameplayStart(): void {
  if (ready) sdk()?.game?.gameplayStart?.();
}
export function gameplayStop(): void {
  if (ready) sdk()?.game?.gameplayStop?.();
}
export function loadingStart(): void {
  if (ready) sdk()?.game?.loadingStart?.();
}
export function loadingStop(): void {
  if (ready) sdk()?.game?.loadingStop?.();
}
/** "Beating a boss, reaching a highscore" — their words. Use sparingly. */
export function happytime(): void {
  if (ready) sdk()?.game?.happytime?.();
}

/**
 * Hard ceiling on how long we will sit on a black screen waiting for the ad callbacks.
 * The SDK should always call adFinished or adError, but if it ever doesn't, the player must
 * not be stranded mid-wipe — that is a broken game, which is far worse than a missed ad.
 */
const AD_CALLBACK_TIMEOUT_MS = 45_000;

export type AdOutcome = "finished" | "error" | "unavailable" | "timeout";

/**
 * Request a video ad and resolve when it is over. Never rejects.
 *
 * There is no audio system in the game yet, so the "mute during the ad" requirement is
 * currently satisfied trivially. IF SOUND SHIPS, mute it in adStarted and restore it in
 * adFinished/adError — this is the place to do it, and it is a compliance requirement, not
 * a nicety. The game itself is already paused: this only ever runs from the floor
 * transition's black phase, which blocks input for its whole duration.
 */
export function requestAd(type: AdType): Promise<AdOutcome> {
  const s = sdk();
  if (!ready || !s?.ad?.requestAd) return Promise.resolve("unavailable");

  return new Promise<AdOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: AdOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => finish("timeout"), AD_CALLBACK_TIMEOUT_MS);

    try {
      s.ad!.requestAd!(type, {
        adFinished: () => finish("finished"),
        adError: (err) => {
          // adCooldown / adblock / unfilled / adsDisabledBasicLaunch / other. All are
          // ordinary, none are worth surfacing to the player.
          if (err?.code && err.code !== "adCooldown") {
            console.info("[crazygames] ad unavailable:", err.code);
          }
          finish("error");
        },
      });
    } catch (err) {
      console.warn("[crazygames] requestAd threw", err);
      finish("error");
    }
  });
}

// --- The floor-transition ad break --------------------------------------------
//
// WHEN an ad shows is policy and lives in lib/ad_gate.ts (shared, tested, tunable). This
// file only binds that decision to the SDK. Seeded at module load, i.e. session start.

const gate = createAdGate();

/**
 * Call once per floor transition, from the wipe's black phase. Counts the floor, and if the
 * gate opens, plays a midgame ad and waits for it to finish.
 */
export async function maybeFloorAdBreak(): Promise<AdOutcome | "skipped"> {
  if (!gate.onFloorTransition()) return "skipped";

  gameplayStop(); // entering a break, per their lifecycle contract
  const outcome = await requestAd("midgame");
  gameplayStart(); // resuming: "enter next level" is explicitly one of their examples
  return outcome;
}
