import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  StoryCheckpointOption,
  StoryResetConfig,
} from "../lib/story/story_mode";
import { listStoryEvents } from "../lib/story/event_registry";

interface StoryResetModalProps {
  open: boolean;
  options: StoryCheckpointOption[];
  initialConfig: StoryResetConfig;
  onConfirm: (config: StoryResetConfig) => void;
  onCancel: () => void;
}

const StoryResetModal: React.FC<StoryResetModalProps> = ({
  open,
  options,
  initialConfig,
  onConfirm,
  onCancel,
}) => {
  const optionMap = useMemo(() => {
    const entries = options.map((opt) => [opt.id, opt] as const);
    return new Map(entries);
  }, [options]);

  const findMatchingOptionId = useCallback((config: StoryResetConfig): string | null => {
    for (const opt of options) {
      if (
        opt.roomId === config.targetRoomId &&
        opt.position[0] === config.targetPosition[0] &&
        opt.position[1] === config.targetPosition[1]
      ) {
        return opt.id;
      }
    }
    return null;
  }, [options]);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [config, setConfig] = useState<StoryResetConfig>(initialConfig);

  useEffect(() => {
    setConfig(initialConfig);
    setSelectedOptionId(findMatchingOptionId(initialConfig));
  }, [initialConfig, findMatchingOptionId]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onConfirm(config);
  };

  const handleOptionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    setSelectedOptionId(nextId);
    const selected = optionMap.get(nextId);
    if (selected) {
      setConfig((prev) => ({
        ...prev,
        targetRoomId: selected.roomId,
        targetPosition: selected.position,
      }));
    }
  };

  const updateNumeric = (key: keyof StoryResetConfig) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setConfig((prev) => ({
        ...prev,
        [key]: Number.isNaN(value) ? 0 : value,
      }));
    };

  const updateBoolean = (key: keyof StoryResetConfig) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.checked;
      setConfig((prev) => ({
        ...prev,
        [key]: value,
      }));
    };

  const updateTimeOfDay = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as "day" | "dusk" | "night" | "dawn";
    setConfig((prev) => ({
      ...prev,
      timeOfDay: value,
    }));
  };

  const updateStoryFlag = (flagId: string) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setConfig((prev) => ({
        ...prev,
        storyFlags: {
          ...(prev.storyFlags || {}),
          [flagId]: checked,
        },
      }));
    };

  const storyEvents = useMemo(() => listStoryEvents(), []);

  const sortedOptions = options;

  const activeOptionId =
    selectedOptionId ?? findMatchingOptionId(config) ?? sortedOptions[0]?.id ?? null;

  useEffect(() => {
    if (!selectedOptionId && activeOptionId) {
      setSelectedOptionId(activeOptionId);
    }
  }, [activeOptionId, selectedOptionId]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Configure story reset"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl rounded-lg border border-white/20 bg-black/80 p-6 text-sm text-gray-100 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configure Story Reset</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/20 px-2 py-1 text-xs uppercase tracking-wide text-gray-300 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
              Start Location
            </label>
            <select
              value={activeOptionId ?? ""}
              onChange={handleOptionChange}
              className="w-full rounded border border-white/30 bg-black/60 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            >
              {sortedOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                Hero Health (1-6)
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={config.heroHealth}
                onChange={updateNumeric("heroHealth")}
                className="w-full rounded border border-white/30 bg-black/60 px-2 py-1 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                Torch Lit
              </label>
              <input
                type="checkbox"
                checked={config.heroTorchLit}
                onChange={updateBoolean("heroTorchLit")}
                className="h-4 w-4"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
              Time of Day
            </label>
            <select
              value={config.timeOfDay ?? "day"}
              onChange={updateTimeOfDay}
              className="w-full rounded border border-white/30 bg-black/60 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            >
              <option value="day">Day</option>
              <option value="dusk">Dusk</option>
              <option value="night">Night</option>
              <option value="dawn">Dawn</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
              <input
                type="checkbox"
                checked={config.hasSword}
                onChange={updateBoolean("hasSword")}
                className="h-4 w-4"
              />
              Sword
            </label>
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
              <input
                type="checkbox"
                checked={config.hasShield}
                onChange={updateBoolean("hasShield")}
                className="h-4 w-4"
              />
              Shield
            </label>
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
              <input
                type="checkbox"
                checked={config.hasKey}
                onChange={updateBoolean("hasKey")}
                className="h-4 w-4"
              />
              Key
            </label>
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
              <input
                type="checkbox"
                checked={config.hasExitKey}
                onChange={updateBoolean("hasExitKey")}
                className="h-4 w-4"
              />
              Exit Key
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                Rocks
              </label>
              <input
                type="number"
                min={0}
                value={config.rockCount}
                onChange={updateNumeric("rockCount")}
                className="w-full rounded border border-white/30 bg-black/60 px-2 py-1 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                Runes
              </label>
              <input
                type="number"
                min={0}
                value={config.runeCount}
                onChange={updateNumeric("runeCount")}
                className="w-full rounded border border-white/30 bg-black/60 px-2 py-1 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                Food
              </label>
              <input
                type="number"
                min={0}
                value={config.foodCount}
                onChange={updateNumeric("foodCount")}
                className="w-full rounded border border-white/30 bg-black/60 px-2 py-1 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                Potions
              </label>
              <input
                type="number"
                min={0}
                value={config.potionCount}
                onChange={updateNumeric("potionCount")}
                className="w-full rounded border border-white/30 bg-black/60 px-2 py-1 focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-gray-400">
              Story Flags (for testing dialogue)
            </label>
            <div className="max-h-48 overflow-y-auto rounded border border-white/20 bg-black/40 p-3">
              <div className="grid grid-cols-1 gap-2">
                {storyEvents.map((event) => (
                  <label
                    key={event.id}
                    className="flex items-start gap-2 text-xs text-gray-300"
                    title={event.description}
                  >
                    <input
                      type="checkbox"
                      checked={config.storyFlags?.[event.id] ?? false}
                      onChange={updateStoryFlag(event.id)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0"
                    />
                    <span className="flex-1">
                      <span className="font-mono text-emerald-400">{event.id}</span>
                      <span className="ml-2 text-gray-500">— {event.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-gray-300 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/30"
          >
            Apply Reset
          </button>
        </div>
      </form>
    </div>
  );
};

export default StoryResetModal;
