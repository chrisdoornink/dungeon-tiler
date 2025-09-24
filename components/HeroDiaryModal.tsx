import React from "react";
import type { HeroDiaryEntry } from "../lib/story/hero_diary";

interface HeroDiaryModalProps {
  entries: HeroDiaryEntry[];
  onClose: () => void;
  onToggleComplete: (entryId: string, completed: boolean) => void;
}

const SCRIBBLE_FONT_FAMILY =
  "'Caveat', 'Homemade Apple', 'Patrick Hand', 'Comic Sans MS', cursive";

export const HeroDiaryModal: React.FC<HeroDiaryModalProps> = ({
  entries,
  onClose,
  onToggleComplete,
}) => {
  const sortedEntries = [...entries].sort(
    (a, b) => a.unlockedAt - b.unlockedAt
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hero-diary-title"
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-[#d8c7a1] bg-[#fdf8f1] text-[#2d1b15] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#e5d8b8] bg-[#f7eddc] px-4 py-3">
          <h2
            id="hero-diary-title"
            className="text-lg font-semibold uppercase tracking-wide text-[#3b2b20]"
          >
            Hero Diary
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#c7b48e] bg-[#f0e4cb] px-3 py-1 text-sm font-medium text-[#3b2b20] shadow hover:bg-[#e8d7b4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9f875a]"
          >
            Close
          </button>
        </div>
        <div
          className="max-h-[60vh] overflow-y-auto px-5 py-4 text-base"
          style={{ fontFamily: SCRIBBLE_FONT_FAMILY }}
        >
          {sortedEntries.length === 0 ? (
            <p className="italic text-[#6b5b4b]">
              The pages are blank—for now.
            </p>
          ) : (
            <ul className="space-y-5">
              {sortedEntries.map((entry) => {
                const isComplete = Boolean(entry.completed);
                return (
                  <li
                    key={entry.id}
                    className={`rounded-lg border border-[#e0d3b4] bg-[#fbf1e0] px-4 py-3 shadow-sm transition hover:border-[#d1c099]`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                      <div className="flex-1">
                        <p
                          className={`text-lg font-semibold ${
                            isComplete
                              ? "text-[#8f7f72] line-through decoration-[#8f7f72]/70"
                              : "text-[#3f2f24]"
                          }`}
                        >
                          {entry.title}
                        </p>
                        <p
                          className={`mt-1 leading-relaxed ${
                            isComplete
                              ? "text-[#9a8f80] line-through decoration-[#9a8f80]/70"
                              : "text-[#3b291c]"
                          }`}
                        >
                          {entry.summary}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleComplete(entry.id, !isComplete)}
                          className={`rounded border px-3 py-1 text-sm font-medium shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                            isComplete
                              ? "border-[#b1a38b] bg-[#f3e7ce] text-[#5b4a3a] hover:bg-[#eadbbf] focus-visible:ring-[#9f875a]"
                              : "border-[#b58e58] bg-[#f7e2b8] text-[#3d2b1e] hover:bg-[#f1d69f] focus-visible:ring-[#b58e58]"
                          }`}
                          aria-pressed={isComplete}
                        >
                          {isComplete ? "Reopen" : "Mark complete"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
