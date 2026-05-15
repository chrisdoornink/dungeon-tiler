"use client";

import { useEffect, useState } from "react";

export default function HowToPlayButton() {
  const [isOpen, setIsOpen] = useState(false);

  const closeModal = () => setIsOpen(false);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <div className="fixed bottom-4 left-16 z-50">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group relative flex items-center gap-2 p-2 text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Open how to play guide"
        title="How to Play"
      >
        <span
          aria-hidden
          className="w-8 h-8 inline-flex items-center justify-center rounded-full border-2 border-white/80 bg-black/40 text-white text-sm font-bold leading-none"
          style={{ fontFamily: "var(--font-press-start-2p)" }}
        >
          ?
        </span>
        <span className="pointer-events-none select-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-sm font-medium opacity-0 translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-focus:opacity-100 group-focus:translate-x-0">
          How to Play
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-to-play-title"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 text-slate-900 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h2
                id="how-to-play-title"
                className="text-sm font-bold uppercase tracking-wide text-slate-700"
              >
                How to Play
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label="Close how to play guide"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Goal
                </h3>
                <p>
                  Escape the dungeon. Find the exit key, unlock the exit, and
                  descend through 3 floors to win the daily run.
                </p>
              </section>

              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Controls
                </h3>
                <ul className="space-y-1">
                  <li>
                    <span className="font-semibold">Arrow keys</span> — move
                    one tile
                  </li>
                  <li>
                    <span className="font-semibold">On-screen arrows</span> —
                    tap to move (mobile-friendly)
                  </li>
                  <li>
                    <span className="font-semibold">Letter keys</span> — use
                    items shown in your inventory (e.g.{" "}
                    <span className="font-semibold">R</span> to throw a Rock)
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Combat
                </h3>
                <ul className="space-y-1">
                  <li>
                    <span className="font-semibold">Walk into an enemy</span> to
                    attack it. You&apos;ll trade hits until one side falls.
                  </li>
                  <li>
                    Enemies on your path will hurt you — so pick your fights and
                    plan routes around them when you can.
                  </li>
                  <li>
                    Some enemies use ranged or special attacks. Watch their
                    facing and movement.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Items
                </h3>
                <ul className="space-y-1">
                  <li>
                    <span className="font-semibold">Sword</span> — deals more
                    damage per hit. Equipping one makes fights much shorter.
                  </li>
                  <li>
                    <span className="font-semibold">Shield</span> — reduces
                    damage you take from enemy attacks.
                  </li>
                  <li>
                    <span className="font-semibold">Rock</span> — throwable
                    ranged attack. Press the shown letter key to throw in your
                    facing direction.
                  </li>
                  <li>
                    <span className="font-semibold">Food / Potions</span> —
                    restore health. Use before you&apos;re low, not after.
                  </li>
                  <li>
                    <span className="font-semibold">Exit Key</span> — required
                    to unlock the exit on each floor.
                  </li>
                </ul>
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
