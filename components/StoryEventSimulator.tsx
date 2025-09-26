"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyStoryEffectsWithDiary,
  createInitialStoryFlags,
  listStoryEvents,
  type StoryEffect,
  type StoryEventDefinition,
  type StoryFlags,
} from "../lib/story/event_registry";
import type { HeroDiaryEntry } from "../lib/story/hero_diary";

interface StoryEventSimulatorProps {
  currentFlags: StoryFlags | undefined;
  diaryEntries: HeroDiaryEntry[] | undefined;
  onApply: (
    update: {
      flags: StoryFlags;
      diaryEntries: HeroDiaryEntry[];
    }
  ) => void;
}

function mergeFlags(flags: StoryFlags | undefined): StoryFlags {
  const base = createInitialStoryFlags();
  if (!flags) {
    return base;
  }
  return {
    ...base,
    ...flags,
  };
}

const StoryEventSimulator: React.FC<StoryEventSimulatorProps> = ({
  currentFlags,
  diaryEntries,
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pendingFlags, setPendingFlags] = useState<StoryFlags>(() =>
    mergeFlags(currentFlags)
  );

  useEffect(() => {
    setPendingFlags(mergeFlags(currentFlags));
  }, [currentFlags]);

  const events = useMemo<StoryEventDefinition[]>(() => {
    return listStoryEvents().slice().sort((a, b) => a.id.localeCompare(b.id));
  }, []);

  const filteredEvents = useMemo(() => {
    if (!filter) return events;
    const normalized = filter.trim().toLowerCase();
    if (!normalized) return events;
    return events.filter((event) => {
      return (
        event.id.toLowerCase().includes(normalized) ||
        event.description.toLowerCase().includes(normalized)
      );
    });
  }, [events, filter]);

  const handleToggle = useCallback((eventId: string) => {
    setPendingFlags((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  }, []);

  const handleSet = useCallback((eventId: string, value: boolean) => {
    setPendingFlags((prev) => ({
      ...prev,
      [eventId]: value,
    }));
  }, []);

  const handleApply = useCallback(() => {
    const source = currentFlags ?? {};
    const pendingEffects = events.reduce<StoryEffect[]>(
      (acc, event) => {
        const nextValue = Boolean(pendingFlags[event.id]);
        const prevValue = Boolean(source[event.id]);
        if (nextValue !== prevValue) {
          acc.push({ eventId: event.id, value: nextValue });
        }
        return acc;
      },
      []
    );

    let nextFlags = mergeFlags(pendingFlags);
    let nextDiary = diaryEntries ?? [];

    if (pendingEffects.length > 0) {
      const result = applyStoryEffectsWithDiary(
        currentFlags,
        diaryEntries,
        pendingEffects
      );
      nextFlags = mergeFlags(result.flags ?? pendingFlags);
      nextDiary = result.diaryEntries ?? diaryEntries ?? [];
    }

    onApply({
      flags: { ...nextFlags },
      diaryEntries: [...nextDiary],
    });
  }, [
    currentFlags,
    diaryEntries,
    events,
    onApply,
    pendingFlags,
  ]);

  const handleReset = useCallback(() => {
    setPendingFlags(mergeFlags(currentFlags));
  }, [currentFlags]);

  const buttonLabel = open ? "Close Story Events" : "Story Events";

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <>
      <div className="fixed left-4 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-200 shadow-lg transition hover:bg-white/10"
        >
          {buttonLabel}
        </button>
      </div>
      {open ? (
        <div className="fixed left-20 top-1/2 z-50 w-80 -translate-y-1/2 rounded-lg border border-white/10 bg-slate-950/90 p-3 text-xs text-gray-100 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.7rem] uppercase tracking-wide text-gray-400">
              Story Event Simulator
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-white/10 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-gray-300 transition hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <p className="mb-2 text-[0.65rem] text-gray-400">
            Toggle story events to quickly test dialogue sequences.
          </p>
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter events"
            className="mb-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-500 focus:border-indigo-400 focus:outline-none"
          />
          <div className="max-h-72 overflow-y-auto pr-1">
            {filteredEvents.length === 0 ? (
              <div className="py-4 text-center text-[0.65rem] text-gray-500">
                No events match the filter.
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredEvents.map((event) => {
                  const active = Boolean(pendingFlags[event.id]);
                  return (
                    <li
                      key={event.id}
                      className="rounded border border-white/5 bg-white/5 px-2 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => handleToggle(event.id)}
                            className="mt-0.5 h-3.5 w-3.5 rounded border border-white/30 bg-black/40"
                          />
                          <div>
                            <div className="text-[0.7rem] font-semibold text-gray-100">
                              {event.id}
                            </div>
                            <div className="text-[0.65rem] text-gray-400">
                              {event.description}
                            </div>
                          </div>
                        </label>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => handleSet(event.id, true)}
                            className="rounded border border-emerald-500/30 px-1 py-0.5 text-[0.6rem] uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/10"
                          >
                            Set
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSet(event.id, false)}
                            className="rounded border border-rose-500/30 px-1 py-0.5 text-[0.6rem] uppercase tracking-wide text-rose-300 transition hover:bg-rose-500/10"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 rounded border border-white/10 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-gray-300 transition hover:bg-white/10"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 rounded border border-indigo-500/40 bg-indigo-500/30 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-indigo-100 transition hover:bg-indigo-500/50"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default StoryEventSimulator;
