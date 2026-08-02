import React, { useEffect, useRef, useState } from "react";

/**
 * Iris-wipe floor transition overlay.
 *
 * Phases:
 *  1. "closing" – circle of visibility shrinks to zero, centered on `closeCenter`.
 *  2. "black"   – fully black pause while the floor swaps underneath.
 *  3. "opening" – circle of visibility expands from zero, centered on `openCenter`.
 *  4. "done"    – overlay removed.
 */

export type FloorTransitionPhase = "closing" | "black" | "opening" | "done";

interface FloorTransitionProps {
  /** Pixel coordinates (relative to viewport) for the close iris center */
  closeCenter: { x: number; y: number };
  /** Pixel coordinates (relative to viewport) for the open iris center */
  openCenter: { x: number; y: number };
  /** Called when the screen is fully black and the floor should be swapped */
  onSwapFloor: () => void;
  /** Called when the full transition is complete */
  onComplete: () => void;
  /**
   * Optional: held open while the screen is fully black, before `blackDuration` starts.
   * The portal builds put a midgame video ad here — the black phase is the one moment the
   * game is both paused and not mid-gameplay. Omitted in the Next app, which skips the
   * promise path entirely so its timing is unchanged. See lib/ad_break.ts.
   */
  onBlackHold?: () => Promise<void>;
  /** Duration of close animation in ms */
  closeDuration?: number;
  /** Duration of the black pause in ms */
  blackDuration?: number;
  /** Duration of open animation in ms */
  openDuration?: number;
}

const VIEWPORT_SIZE = 600;
// Max radius needed to cover the full viewport from the center
const MAX_RADIUS = Math.ceil(Math.sqrt(2) * VIEWPORT_SIZE / 2) + 20; // ~445px, enough to cover corners from center

export const FloorTransition: React.FC<FloorTransitionProps> = ({
  closeCenter,
  openCenter,
  onSwapFloor,
  onComplete,
  onBlackHold,
  closeDuration = 500,
  blackDuration = 250,
  openDuration = 500,
}) => {
  const [phase, setPhase] = useState<FloorTransitionPhase>("closing");
  const [progress, setProgress] = useState(1); // 1 = fully open, 0 = fully closed
  const swapFiredRef = useRef(false);

  // Stable refs for callbacks to avoid re-triggering the effect
  const onSwapFloorRef = useRef(onSwapFloor);
  onSwapFloorRef.current = onSwapFloor;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onBlackHoldRef = useRef(onBlackHold);
  onBlackHoldRef.current = onBlackHold;

  useEffect(() => {
    let raf: number;
    let startTime: number;

    if (phase === "closing") {
      startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / closeDuration, 1);
        const eased = t * t; // ease-in
        setProgress(1 - eased);
        if (t < 1) {
          raf = requestAnimationFrame(animate);
        } else {
          setProgress(0);
          setPhase("black");
        }
      };
      raf = requestAnimationFrame(animate);
    } else if (phase === "black") {
      if (!swapFiredRef.current) {
        swapFiredRef.current = true;
        onSwapFloorRef.current();
      }
      // The floor is swapped and the screen is black. If something wants to hold here (a
      // portal ad break), wait for it before timing the pause — the ad covers the screen,
      // so the wipe must not reopen underneath it. Unmount cancels either path.
      let cancelled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const proceed = () => {
        if (cancelled) return;
        timeout = setTimeout(() => setPhase("opening"), blackDuration);
      };
      const hold = onBlackHoldRef.current;
      if (hold) {
        // runAdBreak already swallows failures, but belt-and-braces: a throw here would
        // leave the player staring at a black screen forever.
        void Promise.resolve()
          .then(hold)
          .catch(() => {})
          .then(proceed);
      } else {
        proceed();
      }
      return () => {
        cancelled = true;
        if (timeout) clearTimeout(timeout);
      };
    } else if (phase === "opening") {
      startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / openDuration, 1);
        const eased = 1 - (1 - t) * (1 - t); // ease-out
        setProgress(eased);
        if (t < 1) {
          raf = requestAnimationFrame(animate);
        } else {
          setProgress(1);
          setPhase("done");
        }
      };
      raf = requestAnimationFrame(animate);
    } else if (phase === "done") {
      onCompleteRef.current();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [phase, closeDuration, blackDuration, openDuration]);

  if (phase === "done") return null;

  const center = phase === "opening" ? openCenter : closeCenter;
  const radius = progress * MAX_RADIUS;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 11000,
        pointerEvents: "none",
        overflow: "hidden",
        background: radius <= 0.5 ? "black" : undefined,
      }}
    >
      {radius > 0.5 && (
        <div
          style={{
            position: "absolute",
            left: center.x - radius,
            top: center.y - radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: "50%",
            background: "transparent",
            boxShadow: `0 0 0 ${VIEWPORT_SIZE * 2}px black`,
          }}
        />
      )}
    </div>
  );
};
