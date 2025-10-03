"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  type GameState,
  type RoomId,
  findPlayerPosition,
} from "../../lib/map";
import {
  buildStoryModeState,
  buildStoryStateFromConfig,
  collectStoryCheckpointOptions,
  type StoryCheckpointOption,
  type StoryResetConfig,
} from "../../lib/story/story_mode";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import { rehydrateEnemies, type PlainEnemy } from "../../lib/enemy";
import { rehydrateNPCs, type PlainNPC } from "../../lib/npc";
import StoryResetModal from "../../components/StoryResetModal";

function createDefaultResetConfig(
  state: GameState,
  options: StoryCheckpointOption[]
): StoryResetConfig {
  const preferred =
    options.find((opt) => opt.kind === "checkpoint") ?? options[0] ?? null;
  const fallbackRoom: RoomId =
    preferred?.roomId ??
    state.currentRoomId ??
    ((options[0]?.roomId ?? "story-hall-entrance") as RoomId);
  const fallbackPosition =
    preferred?.position ?? findPlayerPosition(state.mapData) ?? ([0, 0] as [number, number]);

  return {
    targetRoomId: fallbackRoom,
    targetPosition: fallbackPosition,
    heroHealth: state.heroHealth,
    heroTorchLit: state.heroTorchLit ?? true,
    hasSword: !!state.hasSword,
    hasShield: !!state.hasShield,
    hasKey: !!state.hasKey,
    hasExitKey: !!state.hasExitKey,
    rockCount: state.rockCount ?? 0,
    runeCount: state.runeCount ?? 0,
    foodCount: state.foodCount ?? 0,
    potionCount: state.potionCount ?? 0,
    timeOfDay: state.timeOfDay?.phase ?? "day",
  };
}

function StoryModeInner() {
  const [initialState, setInitialState] = useState<GameState | null>(null);
  const [checkpointOptions, setCheckpointOptions] = useState<StoryCheckpointOption[]>([]);
  const [resetConfig, setResetConfig] = useState<StoryResetConfig | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [tilemapKey, setTilemapKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") return undefined;

    const saved = CurrentGameStorage.loadCurrentGame("story");
    if (saved) {
      if (Array.isArray(saved.enemies)) {
        saved.enemies = rehydrateEnemies(saved.enemies as unknown as PlainEnemy[]);
      }
      if (Array.isArray(saved.npcs)) {
        saved.npcs = rehydrateNPCs(saved.npcs as unknown as PlainNPC[]);
      }
      const restored = saved as GameState;
      restored.mode = "story";
      restored.allowCheckpoints = true;
      if (!cancelled) setInitialState(restored);
    } else {
      const fresh = buildStoryModeState();
      CurrentGameStorage.saveCurrentGame(fresh, "story");
      if (!cancelled) setInitialState(fresh);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialState) return;
    const options = collectStoryCheckpointOptions(initialState);
    setCheckpointOptions(options);
    setResetConfig((prev) => {
      if (prev) {
        const hasMatch = options.some(
          (opt) =>
            opt.roomId === prev.targetRoomId &&
            opt.position[0] === prev.targetPosition[0] &&
            opt.position[1] === prev.targetPosition[1]
        );
        if (hasMatch) {
          return prev;
        }
      }
      return createDefaultResetConfig(initialState, options);
    });
  }, [initialState]);

  const handleResetApply = useCallback(
    (config: StoryResetConfig) => {
      const nextState = buildStoryStateFromConfig(config);
      try {
        CurrentGameStorage.saveCurrentGame(nextState, "story");
      } catch {}
      setInitialState(nextState);
      setResetConfig(config);
      setCheckpointOptions(collectStoryCheckpointOptions(nextState));
      setTilemapKey((key) => key + 1);
      setShowResetModal(false);
    },
    [
      setCheckpointOptions,
      setInitialState,
      setResetConfig,
      setTilemapKey,
    ]
  );

  if (!initialState) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading story...
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      {/* Fixed Reset Story button that doesn't affect layout */}
      <button
        type="button"
        onClick={() => resetConfig && setShowResetModal(true)}
        className="absolute top-4 right-4 z-20 rounded border border-white/30 bg-black/40 px-3 py-1 text-xs uppercase tracking-wide text-gray-200 transition hover:bg-white/10"
      >
        Reset Story
      </button>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-300 tracking-wide uppercase">
          Story Mode Prototype
        </h1>
        <TilemapGrid
          key={tilemapKey}
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={false}
          storageSlot="story"
        />
      </div>
      {resetConfig && (
        <StoryResetModal
          open={showResetModal}
          options={checkpointOptions}
          initialConfig={resetConfig}
          onCancel={() => setShowResetModal(false)}
          onConfirm={handleResetApply}
        />
      )}
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense fallback={null}>
      <StoryModeInner />
    </Suspense>
  );
}
