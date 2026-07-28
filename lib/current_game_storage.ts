/**
 * Storage utility for continuous game state persistence
 * Enables auto-save/restore functionality to prevent loss on refresh
 */

import type { GameState } from "./map";
import { FLOOR, TileSubtype } from "./map/constants";
import { DateUtils } from "./date_utils";

const CURRENT_GAME_KEY = "currentGame";
const DAILY_NEW_GAME_KEY = "currentDailyNewGame";
const STORY_GAME_KEY = "currentStoryGame";
const TUTORIAL_GAME_KEY = "currentTutorialGame";
const TEST_GAME_KEY = "currentTestGame";
const ENDLESS_GAME_KEY = "currentEndlessGame";

export type GameStorageSlot = "default" | "daily-new" | "story" | "tutorial" | "test" | "endless";

function keyForSlot(slot: GameStorageSlot): string {
  switch (slot) {
    case "daily-new":
      return DAILY_NEW_GAME_KEY;
    case "endless":
      return ENDLESS_GAME_KEY;
    case "story":
      return STORY_GAME_KEY;
    case "tutorial":
      return TUTORIAL_GAME_KEY;
    case "test":
      return TEST_GAME_KEY;
    default:
      return CURRENT_GAME_KEY;
  }
}

export interface StoredGameState extends GameState {
  lastSaved: number; // timestamp
  isDailyChallenge?: boolean;
}

// Enemies in a parsed save are plain JSON, not Enemy instances: the kind lives
// under `_kind` (the class's private backing field) until rehydrateEnemies runs.
type SavedEnemyLike = { y: number; x: number; kind?: string; _kind?: string };

/**
 * Repair a saved game corrupted by the enemy/hero tile-overlap bug: a pink goblin
 * could teleport onto the hero's tile, and its ring cleanup then restored a pre-ring
 * subtype snapshot that erased the PLAYER marker — leaving the hero invisible,
 * unfindable, and every input dead, with the corruption persisted on every save.
 *
 * Two repairs, both no-ops on a healthy save:
 *  1. No PLAYER marker on the map -> restore the hero. An overlapping pink goblin
 *     stands exactly where the hero was erased, so prefer its tile; otherwise fall
 *     back to the first open floor tile.
 *  2. Any enemy sharing the hero's tile -> move it to the nearest open floor tile
 *     (drop it entirely if the map somehow has none).
 */
export function sanitizeLoadedGameState(state: StoredGameState): StoredGameState {
  const tiles = state.mapData?.tiles;
  const subtypes = state.mapData?.subtypes;
  if (!Array.isArray(tiles) || !Array.isArray(subtypes)) return state;
  const H = subtypes.length;
  const W = subtypes[0]?.length ?? 0;

  const enemies = (
    Array.isArray(state.enemies) ? state.enemies : []
  ) as unknown as SavedEnemyLike[];
  const kindOf = (e: SavedEnemyLike) => e.kind ?? e._kind;
  const enemyAt = (y: number, x: number, skip?: SavedEnemyLike) =>
    enemies.some((e) => e !== skip && e.y === y && e.x === x);
  const isOpenFloor = (y: number, x: number): boolean => {
    if (y < 0 || y >= H || x < 0 || x >= W) return false;
    if (tiles[y]?.[x] !== FLOOR) return false;
    const subs = subtypes[y]?.[x] ?? [];
    return subs.length === 0 || subs.every((s) => s === TileSubtype.NONE);
  };

  let playerPos: [number, number] | null = null;
  for (let y = 0; y < H && !playerPos; y++) {
    for (let x = 0; x < W; x++) {
      if (subtypes[y]?.[x]?.includes(TileSubtype.PLAYER)) {
        playerPos = [y, x];
        break;
      }
    }
  }

  if (!playerPos) {
    const pink = enemies.find((e) => kindOf(e) === "pink-goblin");
    let target: [number, number] | null =
      pink && tiles[pink.y]?.[pink.x] === FLOOR ? [pink.y, pink.x] : null;
    if (!target) {
      for (let y = 0; y < H && !target; y++) {
        for (let x = 0; x < W; x++) {
          if (isOpenFloor(y, x) && !enemyAt(y, x)) {
            target = [y, x];
            break;
          }
        }
      }
    }
    if (!target) return state; // no usable tile — leave it for the caller's validation
    const [ty, tx] = target;
    (subtypes[ty][tx] ?? (subtypes[ty][tx] = [])).push(TileSubtype.PLAYER);
    playerPos = target;
    try {
      console.warn("[save-repair] restored missing PLAYER marker at", target);
    } catch {}
  }

  const [py, px] = playerPos;
  const overlapping = enemies.filter((e) => e.y === py && e.x === px);
  if (overlapping.length > 0) {
    const dropped = new Set<SavedEnemyLike>();
    for (const ov of overlapping) {
      // BFS outward across floor tiles for the nearest open, unoccupied one.
      const visited = new Set<string>([`${py},${px}`]);
      const queue: Array<[number, number]> = [[py, px]];
      let placed = false;
      while (queue.length > 0 && !placed) {
        const [cy, cx] = queue.shift()!;
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const ny = cy + dy;
          const nx = cx + dx;
          const key = `${ny},${nx}`;
          if (visited.has(key)) continue;
          visited.add(key);
          if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
          if (tiles[ny]?.[nx] !== FLOOR) continue;
          if (isOpenFloor(ny, nx) && !enemyAt(ny, nx, ov)) {
            ov.y = ny;
            ov.x = nx;
            placed = true;
            break;
          }
          queue.push([ny, nx]);
        }
      }
      if (!placed) dropped.add(ov);
    }
    if (dropped.size > 0) {
      (state as { enemies?: unknown[] }).enemies = enemies.filter(
        (e) => !dropped.has(e)
      );
    }
    try {
      console.warn(
        "[save-repair] evicted",
        overlapping.length,
        "enemy(ies) overlapping the hero at",
        playerPos
      );
    } catch {}
  }

  return state;
}

export class CurrentGameStorage {
  /**
   * Save current game state to localStorage
   */
  static saveCurrentGame(
    gameState: GameState,
    slot: GameStorageSlot = "default"
  ): void {
    if (typeof window === "undefined") return;

    try {
      const storedState: StoredGameState = {
        ...gameState,
        // Transient per-turn VFX markers must not persist, or reloading right after a
        // bomb blast / death replays the one-shot explosion, shake, and death puffs.
        recentBombBlasts: [],
        recentDeaths: [],
        lastSaved: Date.now(),
        isDailyChallenge: slot === "daily-new",
      };
      const key = keyForSlot(slot);
      window.localStorage.setItem(key, JSON.stringify(storedState));
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }

  /**
   * Load current game state from localStorage
   */
  static loadCurrentGame(
    slot: GameStorageSlot = "default"
  ): StoredGameState | null {
    if (typeof window === "undefined") return null;

    try {
      const key = keyForSlot(slot);
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as StoredGameState;

      // Validate that it's a valid game state
      if (
        !parsed.mapData ||
        !parsed.stats ||
        typeof parsed.heroHealth !== "number"
      ) {
        return null;
      }

      // For daily slots, reject saves that are stale (from a previous calendar day,
      // already won, or hero is dead). These would immediately re-trigger completion.
      if (slot === "daily-new") {
        if (parsed.win || parsed.heroHealth <= 0) {
          this.clearCurrentGame(slot);
          return null;
        }
        // Reject saves from a previous calendar day
        if (typeof parsed.lastSaved === "number") {
          const savedDate = new Date(parsed.lastSaved);
          const savedDateStr = `${savedDate.getFullYear()}-${String(savedDate.getMonth() + 1).padStart(2, '0')}-${String(savedDate.getDate()).padStart(2, '0')}`;
          if (!DateUtils.isToday(savedDateStr)) {
            this.clearCurrentGame(slot);
            return null;
          }
        }
      }

      // Repair saves corrupted by the enemy/hero overlap bug (no-op when healthy).
      return sanitizeLoadedGameState(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Clear current game state for the provided slot.
   */
  static clearCurrentGame(slot: GameStorageSlot = "default"): void {
    if (typeof window === "undefined") return;

    try {
      const key = keyForSlot(slot);
      window.localStorage.removeItem(key);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Check if a current game exists
   */
  static hasCurrentGame(slot: GameStorageSlot = "default"): boolean {
    return this.loadCurrentGame(slot) !== null;
  }

  /**
   * Get the age of the saved game in milliseconds
   */
  static getGameAge(slot: GameStorageSlot = "default"): number | null {
    const saved = this.loadCurrentGame(slot);
    if (!saved) return null;

    return Date.now() - saved.lastSaved;
  }
}
