import type { GameState } from "./game-state";
import { updateConditionalNpcs } from "../story/story_mode";
import type { Enemy } from "../enemy";

/**
 * Centralized handler for enemy defeat processing.
 * This ensures all enemy deaths trigger the same story event logic,
 * regardless of how the enemy was killed (melee, rocks, runes, etc.)
 */
export function processEnemyDefeat(
  gameState: GameState,
  defeatedEnemy: {
    y: number;
    x: number;
    kind: string;
    behaviorMemory?: Record<string, unknown>;
  }
): GameState {
  // Only process story events in story mode
  if (gameState.mode !== 'story') {
    return gameState;
  }

  const roomMetadata = gameState.rooms?.[gameState.currentRoomId || ""]?.metadata;
  const onEnemyDefeat = roomMetadata?.onEnemyDefeat as Record<string, { effects?: Array<{ eventId: string; value: boolean }> }> | undefined;
  
  if (!onEnemyDefeat || typeof onEnemyDefeat !== "object") {
    return gameState;
  }

  const updatedState = { ...gameState };
  let storyFlagsChanged = false;

  // Process each memory key in the defeated enemy
  for (const [memoryKey, config] of Object.entries(onEnemyDefeat)) {
    if (defeatedEnemy.behaviorMemory && defeatedEnemy.behaviorMemory[memoryKey]) {
      const effects = config?.effects;
      if (effects && Array.isArray(effects)) {
        // Apply effects to story flags
        for (const effect of effects) {
          if (effect.eventId && typeof effect.value === 'boolean') {
            if (!updatedState.storyFlags) {
              updatedState.storyFlags = {};
            }
            updatedState.storyFlags[effect.eventId] = effect.value;
            storyFlagsChanged = true;
          }
        }
      }
    }
  }

  // Update conditional NPCs if story flags changed
  if (storyFlagsChanged && updatedState.storyFlags && updatedState.rooms) {
    updateConditionalNpcs(updatedState);
  }

  return updatedState;
}

/**
 * Helper to create defeated enemy info from an Enemy object
 */
export function createDefeatedEnemyInfo(enemy: Enemy): {
  y: number;
  x: number;
  kind: string;
  behaviorMemory?: Record<string, unknown>;
} {
  return {
    y: enemy.y,
    x: enemy.x,
    kind: enemy.kind,
    behaviorMemory: enemy.behaviorMemory
  };
}
