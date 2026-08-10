import React from "react";
import type { WildWisp } from "../lib/map/wisp";
import { WISP_FLASH_MOVES } from "../lib/map/wisp";

const TILE = 40; // px — matches the grid's fixed tile size

/**
 * Wisp visuals — pure CSS, no art assets while the mechanic is a prototype.
 *
 * Everything renders as absolutely positioned siblings of the tile grid (like the
 * pink beams and death spirits), drifting between tiles on a transform transition.
 *
 * Three kinds of element:
 *  - wild wisps: tiny glow orbs. A freshly released one (w.fresh) plays an emerge
 *    animation — it rises out of its source tile (w.bornFrom: the smashed pot, the
 *    dying enemy) in a little spiral that widens and brightens on the way up.
 *  - the carried companion(s): slightly smaller orb perched on the hero's trail.
 *  - bursts: one-shot spins around the hero, spawned by TilemapGrid. "catch" is
 *    the moment of capture (two quick loops, then it joins you); "rescue" is the
 *    death save (three brighter loops closing in as the hearts come back). These
 *    replaced a full-screen banner: the spin just happens on the board.
 */

export interface WispBurst {
  key: number;
  y: number;
  x: number;
  kind: "catch" | "rescue";
}

export function WispLayer({
  wisps,
  companions,
  wispPos,
  playerPosition,
  bursts = [],
}: {
  wisps: WildWisp[];
  companions: number;
  wispPos?: [number, number];
  playerPosition: [number, number] | null;
  bursts?: WispBurst[];
}) {
  // Carried wisps perch at wispPos (a recently-vacated tile); before the first step
  // after a catch there may be no perch yet, so hover over the hero.
  const perch = wispPos ?? playerPosition;
  return (
    <>
      {wisps.map((w) => {
        const from = w.fresh ? w.bornFrom ?? [w.y, w.x] : null;
        return (
          <div
            key={`wild-${w.id}`}
            aria-hidden="true"
            data-testid="wild-wisp"
            className="wispCell"
            style={{
              transform: `translate3d(${w.x * TILE}px, ${w.y * TILE}px, 0)`,
            }}
          >
            <div
              className={from ? "wispEmergeMove" : undefined}
              style={
                from
                  ? ({
                      "--emerge-dx": `${(from[1] - w.x) * TILE}px`,
                      "--emerge-dy": `${(from[0] - w.y) * TILE}px`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <div className={from ? "wispEmergeSpiral" : undefined}>
                <div
                  className={`wispBob ${
                    w.movesLeft <= WISP_FLASH_MOVES ? "wispFlash" : ""
                  }`}
                >
                  <div className="wispOrb wispWild" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {perch &&
        Array.from({ length: companions }, (_, i) => (
          <div
            key={`held-${i}`}
            aria-hidden="true"
            data-testid="companion-wisp"
            className="wispCell wispHeldDrift"
            style={{
              transform: `translate3d(${perch[1] * TILE}px, ${
                perch[0] * TILE
              }px, 0)`,
            }}
          >
            <div
              className="wispBob"
              style={{ animationDelay: `${i * -0.7}s` }}
            >
              <div
                className="wispOrb wispHeld"
                style={{
                  // Fan multiple companions out so they read as a small cluster.
                  marginLeft: (i % 3) * 7 - 7,
                  marginTop: Math.floor(i / 2) * 6 - 3,
                  animationDelay: `${i * -0.5}s`,
                }}
              />
            </div>
          </div>
        ))}
      {bursts.map((b) => (
        <div
          key={`burst-${b.key}`}
          aria-hidden="true"
          data-testid={`wisp-burst-${b.kind}`}
          className="wispCell"
          style={{
            transform: `translate3d(${b.x * TILE}px, ${b.y * TILE}px, 0)`,
          }}
        >
          {b.kind === "rescue" && <div className="wispRescueRing" />}
          <div
            className={
              b.kind === "rescue" ? "wispSpin wispSpinRescue" : "wispSpin"
            }
          >
            <div className="wispOrb wispWild wispBright" />
          </div>
        </div>
      ))}
      <style jsx>{`
        .wispCell {
          position: absolute;
          left: 0;
          top: 0;
          width: ${TILE}px;
          height: ${TILE}px;
          pointer-events: none;
          z-index: 11800; /* above the hero (11000), under wall tops (12000) */
          transition: transform 300ms ease-in-out;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .wispHeldDrift {
          transition: transform 480ms ease-in-out; /* lazier, trailing feel */
        }
        .wispBob {
          animation: wispBob 2.2s ease-in-out infinite;
        }
        .wispOrb {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          animation: wispPulse 1.6s ease-in-out infinite;
        }
        .wispWild {
          background: #d9fffb;
          box-shadow: 0 0 2px 1px rgba(140, 255, 240, 0.9),
            0 0 6px 3px rgba(64, 224, 208, 0.55),
            0 0 11px 5px rgba(32, 178, 170, 0.25);
        }
        .wispHeld {
          width: 4px;
          height: 4px;
          background: #eafffa;
          box-shadow: 0 0 2px 1px rgba(190, 255, 244, 0.95),
            0 0 5px 2px rgba(110, 240, 220, 0.6),
            0 0 9px 4px rgba(64, 224, 208, 0.3);
        }
        .wispBright {
          box-shadow: 0 0 3px 2px rgba(190, 255, 244, 0.95),
            0 0 8px 4px rgba(110, 240, 220, 0.7),
            0 0 16px 8px rgba(64, 224, 208, 0.4);
        }
        .wispFlash {
          animation: wispBob 2.2s ease-in-out infinite,
            wispVanishFlash 0.45s steps(2, jump-none) infinite;
        }
        /* Emerge: travel from the source tile (pot / spark) to the spawn tile... */
        .wispEmergeMove {
          animation: wispEmergeMove 750ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        /* ...while spiraling upward, the loop widening as it rises, then settling. */
        .wispEmergeSpiral {
          animation: wispEmergeSpiral 750ms ease-out both;
        }
        /* Catch: two quick loops around the hero, tightening, then it joins you. */
        .wispSpin {
          animation: wispSpinCatch 800ms ease-in-out both;
        }
        /* Rescue: three slower, brighter loops closing in as the hearts return. */
        .wispSpinRescue {
          animation: wispSpinRescue 1250ms ease-in-out both;
        }
        .wispRescueRing {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 34px;
          height: 34px;
          margin: -17px 0 0 -17px;
          border-radius: 50%;
          border: 2px solid rgba(140, 255, 240, 0.8);
          box-shadow: 0 0 10px 3px rgba(64, 224, 208, 0.45);
          animation: wispRescueRing 900ms ease-out both;
        }
        @keyframes wispBob {
          0%,
          100% {
            transform: translateY(-2px);
          }
          50% {
            transform: translateY(3px);
          }
        }
        @keyframes wispPulse {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.5);
          }
        }
        @keyframes wispVanishFlash {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0.15;
          }
        }
        @keyframes wispEmergeMove {
          from {
            transform: translate(
              var(--emerge-dx, 0px),
              calc(var(--emerge-dy, 0px) + 10px)
            );
          }
          to {
            transform: translate(0px, 0px);
          }
        }
        @keyframes wispEmergeSpiral {
          0% {
            transform: rotate(0deg) translateX(2px) scale(0.15);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          60% {
            transform: rotate(430deg) translateX(10px) scale(0.7);
          }
          100% {
            transform: rotate(720deg) translateX(0px) scale(1);
            opacity: 1;
          }
        }
        @keyframes wispSpinCatch {
          0% {
            transform: rotate(0deg) translateX(15px) scale(0.9);
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: rotate(720deg) translateX(4px) scale(1);
            opacity: 0;
          }
        }
        @keyframes wispSpinRescue {
          0% {
            transform: rotate(0deg) translateX(17px) scale(1.1);
            opacity: 1;
          }
          88% {
            opacity: 1;
          }
          100% {
            transform: rotate(1080deg) translateX(3px) scale(1);
            opacity: 0;
          }
        }
        @keyframes wispRescueRing {
          0% {
            transform: scale(0.3);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.7);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
