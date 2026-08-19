import React, { useEffect, useRef, useState } from "react";
import { assetUrl } from "../lib/asset_url";

const PIXEL_FONT = 'var(--font-press-start-2p), "Courier New", monospace';

/** The on-death beat auto-dismisses after this long even if the player never acts. */
const REWIND_DEATH_MAX_MS = 1500;
/**
 * ...but the player's next action dismisses it early. This brief hold runs first so a key
 * still held (or buffered) from the lethal moment can't blink the beat away before it is seen.
 */
const REWIND_DEATH_MIN_MS = 400;

/**
 * The Amber Moth's rewind HUD.
 *
 * Two modes, one component so the amber-tinted look is shared:
 *
 *  - "preview" (manual use): the board behind this is already rendering the past state,
 *    so the panel sits at the bottom and stays deliberately small — the player is reading
 *    the map, not this. Rewind further / stay / cancel.
 *  - "death" (automatic): a full-screen one-shot beat. No choices; the hero is dead and
 *    the charm spent itself.
 */

interface RewindPreviewProps {
  mode: "preview";
  /** How many steps back the board is currently showing. */
  depth: number;
  /** The furthest back history can reach. */
  maxDepth: number;
  onFurther: () => void;
  onCommit: () => void;
  onCancel: () => void;
}

interface RewindDeathProps {
  mode: "death";
  /** How many steps the charm actually wound back. */
  depth: number;
  onDone: () => void;
}

export type RewindOverlayProps = RewindPreviewProps | RewindDeathProps;

const MOTH_ICON = (size: number) => ({
  width: size,
  height: size,
  backgroundImage: `url(${assetUrl("/images/items/amber-moth.png")})`,
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  filter: "drop-shadow(0 0 10px rgba(255, 190, 90, 0.65))",
});

function stepLabel(n: number): string {
  return n === 1 ? "1 step back" : `${n} steps back`;
}

export function RewindOverlay(props: RewindOverlayProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(timer);
  }, []);

  if (props.mode === "death") {
    return <RewindDeathBeat {...props} shown={shown} />;
  }

  const { depth, maxDepth, onFurther, onCommit, onCancel } = props;
  const canGoFurther = depth < maxDepth;

  return (
    <div
      data-testid="rewind-preview"
      className={`fixed inset-x-0 bottom-0 z-[9990] flex justify-center px-3 pb-4 transition-opacity duration-200 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      style={{ pointerEvents: "none" }}
      role="dialog"
      aria-label="Rewind time"
    >
      <div
        className="flex w-full max-w-md flex-col gap-2 rounded-lg border px-3 py-2.5"
        style={{
          pointerEvents: "all",
          background: "rgba(28, 18, 8, 0.94)",
          borderColor: "rgba(255, 190, 90, 0.45)",
          boxShadow: "0 0 22px rgba(233, 148, 38, 0.28)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" style={MOTH_ICON(30)} />
          <div className="flex flex-col leading-tight">
            <span
              data-testid="rewind-depth"
              className="text-[11px] text-amber-100"
              style={{ fontFamily: PIXEL_FONT }}
            >
              {stepLabel(depth)}
            </span>
            <span className="text-[10px] text-amber-200/60">
              {canGoFurther
                ? `up to ${maxDepth} — pick where to stop`
                : "as far back as the amber holds"}
            </span>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onFurther}
            disabled={!canGoFurther}
            data-testid="rewind-further"
            className="flex-1 rounded px-2 py-1.5 text-[10px] font-bold text-amber-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              fontFamily: PIXEL_FONT,
              background: canGoFurther
                ? "rgba(180, 104, 26, 0.9)"
                : "rgba(90, 60, 26, 0.6)",
            }}
            title="Wind back one more step (Z)"
          >
            {"<< Further"}
          </button>
          <button
            type="button"
            onClick={onCommit}
            data-testid="rewind-commit"
            className="flex-1 rounded bg-amber-500 px-2 py-1.5 text-[10px] font-bold text-stone-900 transition-colors hover:bg-amber-400"
            style={{ fontFamily: PIXEL_FONT }}
            title="Stay here and spend the charm (Enter)"
          >
            Stay here
          </button>
          <button
            type="button"
            onClick={onCancel}
            data-testid="rewind-cancel"
            className="rounded px-2 py-1.5 text-[10px] font-bold text-amber-100/80 transition-colors hover:text-amber-50"
            style={{
              fontFamily: PIXEL_FONT,
              background: "rgba(70, 48, 24, 0.85)",
            }}
            title="Return to the present, charm unspent (Esc)"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The automatic save. Holds for a beat so the player registers that the charm — not luck —
 * is what stopped the run, then hands control back.
 */
function RewindDeathBeat({
  depth,
  onDone,
  shown,
}: RewindDeathProps & { shown: boolean }) {
  // The beat is a cosmetic one-shot: the world was already restored before it mounted, so
  // the hero is playable underneath it. It gets out of the way the moment the player acts
  // again, and caps itself at REWIND_DEATH_MAX_MS if they just sit there.
  //
  // onDone is read through a ref so the timer effect can run exactly ONCE. The parent hands
  // a fresh arrow every render; keying the effect on it (as this once did) let every parent
  // re-render — one per step taken underneath the overlay — tear down and restart the timer,
  // so it never fired while the player kept moving and the beat lingered indefinitely.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };
    const cap = setTimeout(finish, REWIND_DEATH_MAX_MS);
    // Dismiss on the next action, once the brief hold has armed it.
    let armed = false;
    const arm = setTimeout(() => {
      armed = true;
    }, REWIND_DEATH_MIN_MS);
    const onAction = () => {
      if (armed) finish();
    };
    window.addEventListener("keydown", onAction);
    window.addEventListener("pointerdown", onAction);
    window.addEventListener("touchstart", onAction);
    return () => {
      clearTimeout(cap);
      clearTimeout(arm);
      window.removeEventListener("keydown", onAction);
      window.removeEventListener("pointerdown", onAction);
      window.removeEventListener("touchstart", onAction);
    };
  }, []);

  return (
    <div
      data-testid="rewind-death-beat"
      className={`fixed inset-0 z-[9995] flex items-center justify-center transition-opacity duration-300 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% 45%, rgba(120, 66, 14, 0.72) 0%, rgba(10, 6, 2, 0.93) 70%)",
        // Click-through: the hero is live under here, so a tap/keypress both moves and
        // dismisses the beat rather than being swallowed by it.
        pointerEvents: "none",
      }}
      role="status"
    >
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <span aria-hidden="true" className="rewind-moth" style={MOTH_ICON(96)} />
        <h2
          className="text-2xl font-bold tracking-wider text-amber-200"
          style={{ fontFamily: PIXEL_FONT, textShadow: "3px 3px 0 rgba(0,0,0,0.8)" }}
        >
          THE AMBER CRACKS
        </h2>
        <p
          className="max-w-sm text-sm leading-relaxed text-amber-100/80"
          style={{ fontFamily: PIXEL_FONT }}
        >
          The moth carries you back {stepLabel(depth).replace(" back", "")}.
        </p>
      </div>

      <style jsx>{`
        @keyframes rewindMothRecoil {
          0% {
            transform: scale(0.7) rotate(6deg);
            opacity: 0;
          }
          35% {
            transform: scale(1.12) rotate(-4deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        .rewind-moth {
          animation: rewindMothRecoil 0.9s ease-out both;
        }
      `}</style>
    </div>
  );
}
