"use client";

import React, { Suspense, useEffect, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes, type GameState } from "../../lib/map";
import { buildStoryModeState } from "../../lib/story/story_mode";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import { rehydrateEnemies, type PlainEnemy } from "../../lib/enemy";

function StoryModeInner() {
  const [initialState, setInitialState] = useState<GameState | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") return undefined;

    const saved = CurrentGameStorage.loadCurrentGame("story");
    if (saved) {
      if (Array.isArray(saved.enemies)) {
        saved.enemies = rehydrateEnemies(saved.enemies as unknown as PlainEnemy[]);
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
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-300 tracking-wide uppercase">
          Story Mode Prototype
        </h1>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={false}
          storageSlot="story"
        />
      </div>
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
