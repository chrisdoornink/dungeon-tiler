import { useCallback } from "react";
import { performUseFood, performUsePotion } from "../../../lib/map";
import { trackUse } from "../../../lib/analytics";
import { CurrentGameStorage, type GameStorageSlot } from "../../../lib/current_game_storage";
import type { GameState } from "../../../lib/map";

interface InventoryActionParams {
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  resolvedStorageSlot: GameStorageSlot;
}

export function useInventoryActions({
  setGameState,
  resolvedStorageSlot,
}: InventoryActionParams) {
  const handleUseFood = useCallback(() => {
    try {
      trackUse("food");
    } catch {}
    setGameState((prev) => {
      const newState = performUseFood(prev);
      CurrentGameStorage.saveCurrentGame(newState, resolvedStorageSlot);
      return newState;
    });
  }, [resolvedStorageSlot, setGameState]);

  const handleUsePotion = useCallback(() => {
    try {
      trackUse("potion");
    } catch {}
    setGameState((prev) => {
      const newState = performUsePotion(prev);
      CurrentGameStorage.saveCurrentGame(newState, resolvedStorageSlot);
      return newState;
    });
  }, [resolvedStorageSlot, setGameState]);

  const handleDiaryToggle = useCallback(
    (entryId: string, completed: boolean) => {
      const timestamp = Date.now();
      setGameState((prev) => {
        const entries = prev.diaryEntries ?? [];
        const index = entries.findIndex((entry) => entry.id === entryId);
        if (index === -1) {
          return prev;
        }
        const current = entries[index];
        if (Boolean(current.completed) === completed) {
          return prev;
        }
        const nextEntries = entries.map((entry, idx) =>
          idx === index
            ? {
                ...entry,
                completed,
                completedAt: completed ? timestamp : undefined,
              }
            : entry
        );
        const nextState: GameState = { ...prev, diaryEntries: nextEntries };
        try {
          CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
        } catch {}
        return nextState;
      });
    },
    [resolvedStorageSlot, setGameState]
  );

  return {
    handleUseFood,
    handleUsePotion,
    handleDiaryToggle,
  };
}
