import {
  Enemy,
  placeEnemies,
  updateEnemies,
  rehydrateEnemies,
  type PlainEnemy,
} from "../enemy";
import { enemyTypeAssignement } from "../enemy_assignment";
import { EnemyRegistry, createEmptyByKind, type EnemyKind } from "../enemies/registry";
import {
  NPC,
  rehydrateNPCs,
  type PlainNPC,
  type NPCInteractionEvent,
} from "../npc";
import { resolveNpcDialogueScript } from "../story/npc_script_registry";
import {
  createInitialStoryFlags,
  type StoryCondition,
  type StoryFlags,
} from "../story/event_registry";
import { processEnemyDefeat, createDefeatedEnemyInfo } from "./enemy-defeat-handler";
import { updateConditionalNpcs } from "../story/story_mode";
import { determineRoomNpcs } from "../story/npc_conditions";
import { updateDogBehavior, updateWanderBehavior } from "../npc_behaviors";
import {
  DEFAULT_ROOM_ID,
  Direction,
  FLOOR,
  FLOWERS,
  TileSubtype,
  WALL,
  type RoomId,
} from "./constants";
import type { MapData, RoomSnapshot, RoomTransition } from "./types";
import {
  cloneMapData,
  clonePlainEnemies,
  clonePlainNPCs,
  clonePotOverrides,
  serializeEnemies,
  serializeNPCs,
  getMapHeight,
  getMapWidth,
  isWithinBounds,
} from "./utils";
import { addPlayerToMap, findPlayerPosition, removePlayerFromMapData } from "./player";
import { addRunePotsForStoneExciters, generateCompleteMap } from "./map-features";
import { addSnakesPerRules } from "./enemy-features";
import { mulberry32 as mulberry32Fn, withPatchedMathRandom } from "../rng";
import type { HeroDiaryEntry } from "../story/hero_diary";

import { pickPotRevealDeterministic } from "./pots";

function incrementStepsAndTime(state: GameState, amount: number = 1): void {
  if (amount <= 0) return;
  const currentStats = state.stats;
  const nextStats = {
    ...currentStats,
    steps: currentStats.steps + amount,
  };
  state.stats = nextStats;
}

/**
 * Update NPCs with special behaviors (e.g., dogs that follow the player)
 */
function updateNPCBehaviors(state: GameState, playerPos: [number, number]): void {
  if (!state.npcs || state.npcs.length === 0) return;
  
  const [py, px] = playerPos;
  
  for (const npc of state.npcs) {
    // Check if this NPC has a special behavior
    const behavior = npc.metadata?.behavior as string | undefined;
    if (!behavior) continue;
    
    if (behavior === "dog") {
      // Update dog behavior
      const ctx = {
        npc,
        grid: state.mapData.tiles,
        subtypes: state.mapData.subtypes,
        player: { y: py, x: px },
        npcs: state.npcs,
        enemies: state.enemies,
        rng: state.combatRng,
      };
      
      updateDogBehavior(ctx);
    } else if (behavior === "wander") {
      // Update wander behavior
      const ctx = {
        npc,
        grid: state.mapData.tiles,
        subtypes: state.mapData.subtypes,
        player: { y: py, x: px },
        npcs: state.npcs,
        enemies: state.enemies,
        rng: state.combatRng,
      };
      
      updateWanderBehavior(ctx);
    }
  }
}

export function performUseFood(gameState: GameState): GameState {
  const count = gameState.foodCount || 0;
  if (count <= 0) return gameState;

  // Enemies act first relative to current player position
  const preTickState: GameState = { ...gameState };
  preTickState.recentDeaths = [];
  if (preTickState.enemies && Array.isArray(preTickState.enemies)) {
    const pos = findPlayerPosition(preTickState.mapData);
    if (pos) {
      const [py, px] = pos;
      const result = updateEnemies(
        preTickState.mapData.tiles,
        preTickState.mapData.subtypes,
        preTickState.enemies,
        { y: py, x: px },
        {
          rng: preTickState.combatRng ?? Math.random,
          defense: preTickState.hasShield ? 1 : 0,
          playerTorchLit: preTickState.heroTorchLit ?? true,
          setPlayerTorchLit: (lit: boolean) => {
            preTickState.heroTorchLit = lit;
          },
        }
      );

      if (result.damage > 0) {
        const applied = Math.max(0, result.damage - (preTickState.hasShield ? 1 : 0));
        preTickState.heroHealth = Math.max(0, preTickState.heroHealth - applied);
        preTickState.stats.damageTaken += applied;

        // If player dies from enemy damage, track which enemy killed them
        if (preTickState.heroHealth === 0) {
          const killerEnemy = preTickState.enemies.find(
            (e) => Math.abs(e.y - py) + Math.abs(e.x - px) === 1
          );
          if (killerEnemy) {
            preTickState.deathCause = {
              type: "enemy",
              enemyKind: killerEnemy.kind,
            };
          }
        }
      }
    }
  }

  // Use the food: heal 1 HP (capped at 5) and consume 1 food
  const newGameState = { ...preTickState };
  newGameState.heroHealth = Math.min(5, newGameState.heroHealth + 1);
  newGameState.foodCount = count - 1;
  incrementStepsAndTime(newGameState);

  // debug: used food
  
  return newGameState;
}

/**
 * Use potion from inventory to heal 2 HP (costs a move like throwing rocks/runes)
 */
export function performUsePotion(gameState: GameState): GameState {
  const count = gameState.potionCount || 0;
  if (count <= 0) return gameState;

  // Enemies act first relative to current player position
  const preTickState: GameState = { ...gameState };
  preTickState.recentDeaths = [];
  if (preTickState.enemies && Array.isArray(preTickState.enemies)) {
    const pos = findPlayerPosition(preTickState.mapData);
    if (pos) {
      const [py, px] = pos;
      const result = updateEnemies(
        preTickState.mapData.tiles,
        preTickState.mapData.subtypes,
        preTickState.enemies,
        { y: py, x: px },
        {
          rng: preTickState.combatRng ?? Math.random,
          defense: preTickState.hasShield ? 1 : 0,
          playerTorchLit: preTickState.heroTorchLit ?? true,
          setPlayerTorchLit: (lit: boolean) => {
            preTickState.heroTorchLit = lit;
          },
        }
      );

      if (result.damage > 0) {
        const applied = Math.max(0, result.damage - (preTickState.hasShield ? 1 : 0));
        preTickState.heroHealth = Math.max(0, preTickState.heroHealth - applied);
        preTickState.stats.damageTaken += applied;

        if (preTickState.heroHealth === 0) {
          const killerEnemy = preTickState.enemies.find(
            (e) => Math.abs(e.y - py) + Math.abs(e.x - px) === 1
          );
          if (killerEnemy) {
            preTickState.deathCause = {
              type: "enemy",
              enemyKind: killerEnemy.kind,
            };
          }
        }
      }
    }
  }

  // Use the potion: heal 2 HP (capped at 5) and consume 1 potion
  const newGameState = { ...preTickState };
  newGameState.heroHealth = Math.min(5, newGameState.heroHealth + 2);
  newGameState.potionCount = count - 1;
  incrementStepsAndTime(newGameState);

  // Cure poison condition
  if (newGameState.conditions?.poisoned?.active) {
    newGameState.conditions.poisoned.active = false;
  }

  // debug: used potion
  
  return newGameState;
}

/**
 * Throw a rock up to 4 tiles in the player's facing direction.
 * Minimal slice: if inventory has a rock and there is a clear 4-tile floor path,
 * land a ROCK on the 4th tile and decrement rockCount. No collisions/effects yet.
 */
export function performThrowRock(gameState: GameState): GameState {
  const pos = findPlayerPosition(gameState.mapData);
  if (!pos) return gameState;
  const [py, px] = pos;
  const count = gameState.rockCount ?? 0;
  if (count <= 0) return gameState;

  // Treat throw as a player turn: enemies move first relative to current player position
  const preTickState: GameState = { ...gameState };
  // Reset transient deaths for this tick
  preTickState.recentDeaths = [];
  if (preTickState.enemies && Array.isArray(preTickState.enemies)) {
    const result = updateEnemies(
      preTickState.mapData.tiles,
      preTickState.mapData.subtypes,
      preTickState.enemies,
      { y: py, x: px },
      {
        rng: preTickState.combatRng,
        defense: preTickState.hasShield ? 1 : 0,
        playerTorchLit: preTickState.heroTorchLit ?? true,
        setPlayerTorchLit: (lit: boolean) => {
          preTickState.heroTorchLit = lit;
        },
        // Ghosts adjacent this tick should not deal damage
        suppress: (e: Enemy) =>
          Math.abs(e.y - py) + Math.abs(e.x - px) === 1 && e.kind === "ghost",
      }
    );
    if (result.damage > 0) {
      const applied = Math.min(2, result.damage);
      preTickState.heroHealth = Math.max(0, preTickState.heroHealth - applied);
      preTickState.stats = {
        ...preTickState.stats,
        damageTaken: preTickState.stats.damageTaken + applied,
      };
    }
    // Note: Do NOT apply adjacent ghost vanish on rock-throw turns; only move enemies.
  }

  // Determine direction vector
  let vx = 0,
    vy = 0;
  switch (preTickState.playerDirection) {
    case Direction.UP:
      vy = -1;
      break;
    case Direction.RIGHT:
      vx = 1;
      break;
    case Direction.DOWN:
      vy = 1;
      break;
    case Direction.LEFT:
      vx = -1;
      break;
  }

  const newMapData = JSON.parse(
    JSON.stringify(preTickState.mapData)
  ) as MapData;
  // Verify a clear floor path for 4 tiles
  let ty = py;
  let tx = px;
  for (let step = 1; step <= 4; step++) {
    ty += vy;
    tx += vx;
    if (!isWithinBounds(preTickState.mapData, ty, tx)) {
      // Early stop: consume a rock, no placement (future: collide/bam)
      return { ...preTickState, rockCount: count - 1 };
    }
    // Check enemy collision first
    const enemies = preTickState.enemies ?? [];
    const hitIdx = enemies.findIndex((e) => e.y === ty && e.x === tx);
    if (hitIdx !== -1) {
      const newEnemies = enemies.slice();
      const target: Enemy = newEnemies[hitIdx];
      // If we have a rune and the target is a stone-exciter, consume a rune to instantly kill
      if (
        target.kind === "stone-exciter" &&
        (preTickState.runeCount ?? 0) > 0
      ) {
        // Enemy dies instantly
        const removed = newEnemies.splice(hitIdx, 1)[0];
        
        // Store defeated enemy info for onEnemyDefeat processing
        const newDefeatedEnemies = (preTickState.defeatedEnemies ? preTickState.defeatedEnemies.slice() : [])
          .concat([{
            y: removed.y,
            x: removed.x,
            kind: removed.kind,
            behaviorMemory: removed.behaviorMemory
          }]);
        
        const newStats = {
          ...preTickState.stats,
          enemiesDefeated: preTickState.stats.enemiesDefeated + 1,
        };
        const byKind = newStats.byKind || createEmptyByKind();
        const k = removed.kind as EnemyKind;
        byKind[k] = (byKind[k] ?? 0) + 1;
        newStats.byKind = byKind;
        const newRecent = (
          preTickState.recentDeaths ? preTickState.recentDeaths.slice() : []
        ).concat([[removed.y, removed.x] as [number, number]]);
        
        const finalState = {
          ...preTickState,
          enemies: newEnemies,
          stats: newStats,
          recentDeaths: newRecent,
          defeatedEnemies: newDefeatedEnemies,
          runeCount: (preTickState.runeCount ?? 0) - 1,
        };

        // Process enemy defeat story events
        const defeatedEnemyInfo = createDefeatedEnemyInfo(removed);
        const updatedState = processEnemyDefeat(finalState, defeatedEnemyInfo);
        Object.assign(finalState, updatedState);

        return finalState;
      }
      const prevHealth = target.health ?? 1;
      const newHealth = prevHealth - 2; // rock deals 2 damage
      if (newHealth <= 0) {
        // Enemy dies: remove and record for spirit VFX
        const removed = newEnemies.splice(hitIdx, 1)[0];
        
        // Store defeated enemy info for onEnemyDefeat processing
        const newDefeatedEnemies = (preTickState.defeatedEnemies ? preTickState.defeatedEnemies.slice() : [])
          .concat([{
            y: removed.y,
            x: removed.x,
            kind: removed.kind,
            behaviorMemory: removed.behaviorMemory
          }]);
        
        const newStats = {
          ...preTickState.stats,
          // Count full remaining health as damage dealt when we finish the kill
          damageDealt: preTickState.stats.damageDealt + Math.min(2, prevHealth),
          enemiesDefeated: preTickState.stats.enemiesDefeated + 1,
        };
        // Track per-kind kill for rock kills
        const byKind = newStats.byKind || createEmptyByKind();
        const k = removed.kind as EnemyKind;
        byKind[k] = (byKind[k] ?? 0) + 1;
        newStats.byKind = byKind;
        const newRecent = (
          preTickState.recentDeaths ? preTickState.recentDeaths.slice() : []
        ).concat([[removed.y, removed.x] as [number, number]]);
        
        const finalState = {
          ...preTickState,
          enemies: newEnemies,
          stats: newStats,
          recentDeaths: newRecent,
          defeatedEnemies: newDefeatedEnemies,
          rockCount: count - 1,
        };

        // Process enemy defeat story events
        const defeatedEnemyInfo = createDefeatedEnemyInfo(removed);
        const updatedState = processEnemyDefeat(finalState, defeatedEnemyInfo);
        Object.assign(finalState, updatedState);

        return finalState;
      } else {
        // Enemy survives: update its health in place
        target.health = newHealth;
        newEnemies[hitIdx] = target;
        return {
          ...preTickState,
          enemies: newEnemies,
          stats: {
            ...preTickState.stats,
            damageDealt: preTickState.stats.damageDealt + 2,
          },
          rockCount: count - 1,
        };
      }
    }
    if (newMapData.tiles[ty][tx] !== FLOOR) {
      // Early stop on wall/obstacle: consume a rock, no placement
      return { ...preTickState, rockCount: count - 1 };
    }
    // Floor tile: check for pot collision
    const subs = newMapData.subtypes[ty][tx] || [];
    if (subs.includes(TileSubtype.POT)) {
      // If this pot contains a rune, reveal it; otherwise remove pot
      if (subs.includes(TileSubtype.RUNE)) {
        // Preserve non-pot tags (e.g., ROAD overlays) and add RUNE
        const kept = subs.filter((s) => s !== TileSubtype.POT && s !== TileSubtype.RUNE);
        newMapData.subtypes[ty][tx] = kept.concat([TileSubtype.RUNE]);
      } else {
        // Remove only the pot marker; keep other tags (e.g., ROAD)
        newMapData.subtypes[ty][tx] = subs.filter((s) => s !== TileSubtype.POT);
      }
      return { ...preTickState, mapData: newMapData, rockCount: count - 1 };
    }
  }

  // Land the rock on the 4th tile, preserving existing overlays (e.g., ROAD)
  {
    const base = (newMapData.subtypes[ty][tx] || []).filter((t) => t !== TileSubtype.ROCK);
    newMapData.subtypes[ty][tx] = base.concat([TileSubtype.ROCK]);
  }

  return {
    ...preTickState,
    mapData: newMapData,
    rockCount: count - 1,
  };
}

/**
 * Throw a rune up to 4 tiles. Differences from rocks:
 * - If it hits a wall or goes OOB, it lands on the last traversed floor tile before impact and can be picked up again.
 * - If it hits an enemy:
 *   - stone-exciter: instantly killed, rune is consumed (removed from inventory).
 *   - others: deal 2 damage; if enemy dies, rune is consumed; otherwise, rune lands on the last traversed floor tile.
 */
export function performThrowRune(gameState: GameState): GameState {
  const pos = findPlayerPosition(gameState.mapData);
  if (!pos) return gameState;
  const [py, px] = pos;
  const count = gameState.runeCount ?? 0;
  if (count <= 0) return gameState;

  // Direction vector to determine rune target
  let vx = 0, vy = 0;
  switch (gameState.playerDirection) {
    case Direction.UP: vy = -1; break;
    case Direction.RIGHT: vx = 1; break;
    case Direction.DOWN: vy = 1; break;
    case Direction.LEFT: vx = -1; break;
  }

  // Check if there's an adjacent enemy in the throwing direction
  const adjacentTargetY = py + vy;
  const adjacentTargetX = px + vx;
  const enemies = gameState.enemies ?? [];
  const hasAdjacentTarget = enemies.some(e => e.y === adjacentTargetY && e.x === adjacentTargetX);

  // Enemies act relative to current player position, but NOT if throwing at adjacent enemy
  const preTickState: GameState = { ...gameState };
  preTickState.recentDeaths = [];
  if (!hasAdjacentTarget && preTickState.enemies && Array.isArray(preTickState.enemies)) {
    const result = updateEnemies(
      preTickState.mapData.tiles,
      preTickState.mapData.subtypes,
      preTickState.enemies,
      { y: py, x: px },
      {
        rng: preTickState.combatRng,
        defense: preTickState.hasShield ? 1 : 0,
        playerTorchLit: preTickState.heroTorchLit ?? true,
        setPlayerTorchLit: (lit: boolean) => {
          preTickState.heroTorchLit = lit;
        },
        suppress: (e: Enemy) =>
          Math.abs(e.y - py) + Math.abs(e.x - px) === 1 && e.kind === "ghost",
      }
    );
    if (result.damage > 0) {
      const applied = Math.min(2, result.damage);
      preTickState.heroHealth = Math.max(0, preTickState.heroHealth - applied);
      preTickState.stats = {
        ...preTickState.stats,
        damageTaken: preTickState.stats.damageTaken + applied,
      };
    }
  }

  const newMapData = JSON.parse(
    JSON.stringify(preTickState.mapData)
  ) as MapData;

  // Track last floor tile traversed (start at player tile, but don't drop there)
  let lastFloorY = py;
  let lastFloorX = px;
  let ty = py;
  let tx = px;
  for (let step = 1; step <= 4; step++) {
    ty += vy;
    tx += vx;

    // Out of bounds -> drop on last traversed floor tile
    if (!isWithinBounds(preTickState.mapData, ty, tx)) {
      if (
        !(lastFloorY === py && lastFloorX === px) &&
        newMapData.tiles[lastFloorY][lastFloorX] === FLOOR
      ) {
        const lastSubs = newMapData.subtypes[lastFloorY][lastFloorX] || [];
        const hasImportantTile = lastSubs.some(s => 
          s === TileSubtype.EXIT || 
          s === TileSubtype.DOOR || 
          s === TileSubtype.EXITKEY ||
          s === TileSubtype.KEY ||
          s === TileSubtype.LOCK ||
          s === TileSubtype.ROOM_TRANSITION ||
          s === TileSubtype.CHECKPOINT
        );
        
        if (!hasImportantTile) {
          const base = lastSubs.filter((t) => t !== TileSubtype.RUNE);
          newMapData.subtypes[lastFloorY][lastFloorX] = base.concat([TileSubtype.RUNE]);
          return { ...preTickState, mapData: newMapData, runeCount: count - 1 };
        }
      }
      // No valid landing spot found; keep inventory unchanged
      return preTickState;
    }

    // Enemy collision
    const enemies = preTickState.enemies ?? [];
    const hitIdx = enemies.findIndex((e) => e.y === ty && e.x === tx);
    if (hitIdx !== -1) {
      const newEnemies = enemies.slice();
      // Runes instantly kill ALL enemies, rune consumed
      const removed = newEnemies.splice(hitIdx, 1)[0];
      
      // Store defeated enemy info for onEnemyDefeat processing
      const newDefeatedEnemies = (preTickState.defeatedEnemies ? preTickState.defeatedEnemies.slice() : [])
        .concat([{
          y: removed.y,
          x: removed.x,
          kind: removed.kind,
          behaviorMemory: removed.behaviorMemory
        }]);
      
      const dealt = removed.health ?? 2;
      const newStats = {
        ...preTickState.stats,
        damageDealt: preTickState.stats.damageDealt + dealt,
        enemiesDefeated: preTickState.stats.enemiesDefeated + 1,
      };
      const byKind = newStats.byKind || createEmptyByKind();
      const k = removed.kind as EnemyKind;
      byKind[k] = (byKind[k] ?? 0) + 1;
      newStats.byKind = byKind;
      const newRecent = (
        preTickState.recentDeaths ? preTickState.recentDeaths.slice() : []
      ).concat([[removed.y, removed.x] as [number, number]]);
      
      const finalState = {
        ...preTickState,
        enemies: newEnemies,
        stats: newStats,
        recentDeaths: newRecent,
        defeatedEnemies: newDefeatedEnemies,
        runeCount: count - 1,
      };

      // Process enemy defeat story events
      const defeatedEnemyInfo = createDefeatedEnemyInfo(removed);
      const updatedState = processEnemyDefeat(finalState, defeatedEnemyInfo);
      Object.assign(finalState, updatedState);

      return finalState;
    }

    // Wall/obstacle -> drop on last floor tile
    if (newMapData.tiles[ty][tx] !== FLOOR) {
      if (
        !(lastFloorY === py && lastFloorX === px) &&
        newMapData.tiles[lastFloorY][lastFloorX] === FLOOR
      ) {
        const lastSubs = newMapData.subtypes[lastFloorY][lastFloorX] || [];
        const hasImportantTile = lastSubs.some(s => 
          s === TileSubtype.EXIT || 
          s === TileSubtype.DOOR || 
          s === TileSubtype.EXITKEY ||
          s === TileSubtype.KEY ||
          s === TileSubtype.LOCK ||
          s === TileSubtype.ROOM_TRANSITION ||
          s === TileSubtype.CHECKPOINT
        );
        
        if (!hasImportantTile) {
          const base = lastSubs.filter((t) => t !== TileSubtype.RUNE);
          newMapData.subtypes[lastFloorY][lastFloorX] = base.concat([TileSubtype.RUNE]);
          return { ...preTickState, mapData: newMapData, runeCount: count - 1 };
        }
      }
      return preTickState;
    }

    // Pot on floor tile
    const subs = newMapData.subtypes[ty][tx] || [];
    if (subs.includes(TileSubtype.POT)) {
      if (subs.includes(TileSubtype.RUNE)) {
        // Preserve other tags and reveal RUNE
        const kept = subs.filter((s) => s !== TileSubtype.POT && s !== TileSubtype.RUNE);
        newMapData.subtypes[ty][tx] = kept.concat([TileSubtype.RUNE]);
      } else {
        // Remove only pot; keep others
        newMapData.subtypes[ty][tx] = subs.filter((s) => s !== TileSubtype.POT);
      }
      // Drop rune before the pot
      if (
        !(lastFloorY === py && lastFloorX === px) &&
        newMapData.tiles[lastFloorY][lastFloorX] === FLOOR
      ) {
        newMapData.subtypes[lastFloorY][lastFloorX] = [TileSubtype.RUNE];
        return { ...preTickState, mapData: newMapData, runeCount: count - 1 };
      }
      return preTickState;
    }

    // Continue traversal over floor
    lastFloorY = ty;
    lastFloorX = tx;
  }

  // Clear path for 4 tiles -> land on 4th tile (preserve overlays)
  // But don't place rune on important interactive tiles like EXIT, DOOR, etc.
  if (newMapData.tiles[ty][tx] === FLOOR) {
    const subs = newMapData.subtypes[ty][tx] || [];
    const hasImportantTile = subs.some(s => 
      s === TileSubtype.EXIT || 
      s === TileSubtype.DOOR || 
      s === TileSubtype.EXITKEY ||
      s === TileSubtype.KEY ||
      s === TileSubtype.LOCK ||
      s === TileSubtype.ROOM_TRANSITION ||
      s === TileSubtype.CHECKPOINT
    );
    
    if (!hasImportantTile) {
      const base = subs.filter((t) => t !== TileSubtype.RUNE);
      newMapData.subtypes[ty][tx] = base.concat([TileSubtype.RUNE]);
    }
    return { ...preTickState, mapData: newMapData, runeCount: count - 1 };
  }
  return preTickState;
}

/**
 * Enum representing possible movement directions
 */

/**
 * Game state interface for tracking player inventory and game progress
 */
export interface GameState {
  hasKey: boolean; // Player has the universal generic key
  hasExitKey: boolean;
  hasSword?: boolean;
  swordName?: string; // Player-chosen name for their sword
  hasShield?: boolean;
  mode?: 'normal' | 'daily' | 'story';
  allowCheckpoints?: boolean;
  currentFloor?: number; // Current floor number for multi-tier daily mode (1-indexed)
  maxFloors?: number; // Maximum number of floors for multi-tier daily mode
  mapData: MapData;
  showFullMap: boolean; // Whether to show the full map (ignores visibility constraints)
  win: boolean; // Win state when player opens exit and steps onto it
  playerDirection: Direction; // Track the player's facing direction
  enemies?: Enemy[]; // Active enemies on the map
  npcs?: NPC[]; // Friendly or neutral NPCs present in the map
  heroHealth: number; // Player health points for current run
  heroAttack: number; // Player base attack for current run
  // Optional RNG for combat variance injection in tests; falls back to Math.random
  combatRng?: () => number;
  // Inventory
  rockCount?: number; // Count of collected rocks
  runeCount?: number; // Count of collected runes
  foodCount?: number; // Count of collected food items
  potionCount?: number; // Count of collected +2 potions
  hasSnakeMedallion?: boolean; // Snake medallion for portal travel
  stats: {
    damageDealt: number;
    damageTaken: number;
    enemiesDefeated: number;
    steps: number;
    byKind?: Record<EnemyKind, number>;
  };
  // Transient: positions where enemies died this tick
  recentDeaths?: Array<[number, number]>;
  // Transient: defeated enemies with their memory for onEnemyDefeat processing
  defeatedEnemies?: Array<{
    y: number;
    x: number;
    kind: string;
    behaviorMemory?: Record<string, unknown>;
  }>;
  npcInteractionQueue?: NPCInteractionEvent[];
  bookshelfInteractionQueue?: Array<{
    bookshelfId: string;
    position: [number, number];
  }>;
  bedInteractionQueue?: Array<{
    bedId: string;
    position: [number, number];
    isOccupied: boolean;
  }>;
  // Torch state: when false, player's personal light is out (e.g., stolen by ghost)
  heroTorchLit?: boolean;
  // Death cause tracking for specific death messages
  deathCause?: {
    type: "enemy" | "faulty_floor" | "poison";
    enemyKind?: string;
  };
  // Status conditions affecting the player
  conditions?: {
    poisoned?: {
      active: boolean;
      stepsSinceLastDamage: number;
      damagePerInterval: number;
      stepInterval: number;
    };
  };
  storyFlags?: StoryFlags;
  diaryEntries?: HeroDiaryEntry[];
  rooms?: Record<RoomId, RoomSnapshot>;
  currentRoomId?: RoomId;
  roomTransitions?: RoomTransition[];
  potOverrides?: Record<string, TileSubtype.FOOD | TileSubtype.MED>;
  lastCheckpoint?: CheckpointSnapshot;
  // Portal state for snake medallion
  portalLocation?: {
    roomId: RoomId;
    position: [number, number];
  };
  // Multi-tier daily mode: signals that the player entered the exit and needs to advance to the next floor
  needsFloorTransition?: boolean;
}

export type CheckpointSnapshot =
  Omit<GameState, "combatRng" | "lastCheckpoint" | "enemies" | "npcs"> & {
    enemies?: PlainEnemy[];
    npcs?: PlainNPC[];
  };

function cloneCheckpointSnapshot(
  snapshot?: CheckpointSnapshot
): CheckpointSnapshot | undefined {
  if (!snapshot) return undefined;
  return JSON.parse(JSON.stringify(snapshot)) as CheckpointSnapshot;
}

export function createCheckpointSnapshot(
  state: GameState
): CheckpointSnapshot {
  const { combatRng, lastCheckpoint, enemies, ...rest } = state;
  void combatRng;
  void lastCheckpoint;
  const base = JSON.parse(
    JSON.stringify(rest)
  ) as Omit<GameState, "combatRng" | "lastCheckpoint" | "enemies">;
  return {
    ...base,
    enemies: serializeEnemies(enemies),
    npcs: serializeNPCs(state.npcs),
  };
}

export function reviveFromLastCheckpoint(
  state: GameState
): GameState | null {
  if (!state.lastCheckpoint) return null;
  const snapshot = cloneCheckpointSnapshot(state.lastCheckpoint);
  if (!snapshot) return null;

  const { enemies: snapshotEnemies, npcs: snapshotNpcs, ...rest } = snapshot;
  const restoredEnemies = snapshotEnemies
    ? rehydrateEnemies(snapshotEnemies)
    : undefined;
  const restoredNpcs = snapshotNpcs ? rehydrateNPCs(snapshotNpcs) : undefined;

  const restored: GameState = {
    ...rest,
    enemies: restoredEnemies,
    npcs: restoredNpcs,
    combatRng: state.combatRng,
    lastCheckpoint: cloneCheckpointSnapshot(snapshot),
  };

  return restored;
}

function applyEnemyHazardDeaths(state: GameState): void {
  if (!state.enemies || !Array.isArray(state.enemies)) return;
  const subtypes = state.mapData.subtypes;
  if (!subtypes || !Array.isArray(subtypes)) return;

  const remaining: Enemy[] = [];
  const defeated: Enemy[] = [];

  for (const enemy of state.enemies) {
    const row = subtypes[enemy.y];
    const tileSubs = row ? row[enemy.x] || [] : [];
    const onFaulty = tileSubs.includes(TileSubtype.FAULTY_FLOOR);

    if ((enemy.kind === "stone-exciter" || enemy.kind === "goblin") && onFaulty) {
      defeated.push(enemy);

      if (!state.recentDeaths) state.recentDeaths = [];
      state.recentDeaths.push([enemy.y, enemy.x]);

      state.stats.enemiesDefeated += 1;
      if (!state.stats.byKind) state.stats.byKind = createEmptyByKind();
      const k = enemy.kind as EnemyKind;
      state.stats.byKind[k] = (state.stats.byKind[k] ?? 0) + 1;

      if (!state.defeatedEnemies) state.defeatedEnemies = [];
      state.defeatedEnemies.push(createDefeatedEnemyInfo(enemy));
    } else {
      remaining.push(enemy);
    }
  }

  if (defeated.length === 0) return;

  state.enemies = remaining;

  for (const enemy of defeated) {
    const info = createDefeatedEnemyInfo(enemy);
    const updated = processEnemyDefeat(state, info);
    Object.assign(state, updated);
  }
}

/**
 * Initialize a new game state with a newly generated map
 * @returns A new GameState object
 */
export function initializeGameState(): GameState {
  const mapData = generateCompleteMap();
  // Find player position to place enemies at a safe distance
  const playerPos = findPlayerPosition(mapData);
  const enemies = playerPos
    ? placeEnemies({
        grid: mapData.tiles,
        player: { y: playerPos[0], x: playerPos[1] },
        count: Math.floor(Math.random() * 4) + 4, // 4–7 enemies
        minDistanceFromPlayer: 8,
      })
    : [];

  enemyTypeAssignement(enemies);

  // After enemies are assigned, place one rune pot per stone-exciter
  const withRunes = addRunePotsForStoneExciters(mapData, enemies);

  // Snakes: normal generation rules
  const snakesAdded = addSnakesPerRules(withRunes, enemies);

  // debug: enemies placed

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mode: 'normal',
    allowCheckpoints: false,
    mapData: withRunes,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN, // Default facing down/front
    enemies: snakesAdded,
    npcs: [],
    heroHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    runeCount: 0,
    heroTorchLit: true,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: createEmptyByKind(),
    },
    recentDeaths: [],
    npcInteractionQueue: [],
    storyFlags: createInitialStoryFlags(),
    diaryEntries: [],
  };
}

/**
 * Initialize a new game state from an existing MapData snapshot.
 * Useful for replaying the same dungeon layout (tiles/subtypes) with a fresh run.
 */
export function initializeGameStateFromMap(mapData: MapData): GameState {
  // Ensure a player exists on the map; if not, place one
  let ensured = mapData as MapData;
  const pos = findPlayerPosition(ensured);
  if (!pos) {
    ensured = addPlayerToMap(ensured);
  }

  const playerPos = findPlayerPosition(ensured);
  const enemies = playerPos
    ? placeEnemies({
        grid: ensured.tiles,
        player: { y: playerPos[0], x: playerPos[1] },
        count: Math.floor(Math.random() * 4) + 4, // 4–7 enemies
        minDistanceFromPlayer: 8,
      })
    : [];

  enemyTypeAssignement(enemies);
  // Snakes: normal generation rules
  const snakesAdded = addSnakesPerRules(ensured, enemies);

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: ensured,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: snakesAdded,
    npcs: [],
    heroHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    heroTorchLit: true,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: createEmptyByKind(),
    },
    recentDeaths: [],
    npcInteractionQueue: [],
    storyFlags: createInitialStoryFlags(),
    diaryEntries: [],
  };
}

/**
 * Advance to the next floor in multi-tier daily mode.
 * Generates a new map with a floor-specific seed, preserves hero stats and inventory.
 * @param currentState - The current game state
 * @param dailySeed - The base daily seed (from date)
 * @returns A new GameState for the next floor
 */
export function advanceToNextFloor(currentState: GameState, dailySeed: number): GameState {
  const currentFloor = currentState.currentFloor ?? 1;
  const nextFloor = currentFloor + 1;
  const maxFloors = currentState.maxFloors ?? 10;

  // Create floor-specific seed by combining daily seed with floor number
  const floorSeed = dailySeed + nextFloor;
  
  const rng = mulberry32Fn(floorSeed);
  
  // Generate new map with floor-specific seed
  const newMapData = withPatchedMathRandom(rng, () => {
    const mapData = generateCompleteMap();
    // Daily-only: 1-in-6 chance to use the outdoor environment
    if (Math.random() < 1 / 6) {
      mapData.environment = "outdoor";
    }
    return mapData;
  });

  // Find player position to place enemies
  const playerPos = findPlayerPosition(newMapData);
  const enemies = playerPos
    ? withPatchedMathRandom(rng, () => {
        const placed = placeEnemies({
          grid: newMapData.tiles,
          player: { y: playerPos[0], x: playerPos[1] },
          count: Math.floor(Math.random() * 4) + 4, // 4–7 enemies
          minDistanceFromPlayer: 8,
        });
        enemyTypeAssignement(placed);
        return placed;
      })
    : [];

  // Add rune pots and snakes
  const withRunes = addRunePotsForStoneExciters(newMapData, enemies);
  const snakesAdded = addSnakesPerRules(withRunes, enemies);

  // Create new game state preserving hero stats and inventory
  return {
    ...currentState,
    currentFloor: nextFloor,
    maxFloors,
    mapData: withRunes,
    enemies: snakesAdded,
    hasExitKey: false, // Reset exit key for new floor
    win: false, // Reset win state
    recentDeaths: [],
    defeatedEnemies: [],
    npcInteractionQueue: [],
    bookshelfInteractionQueue: [],
    bedInteractionQueue: [],
    // Preserve: heroHealth, heroAttack, hasSword, hasShield, rockCount, runeCount, foodCount, potionCount, stats, etc.
  };
}

function getActiveRoomId(state: GameState): RoomId {
  return state.currentRoomId ?? DEFAULT_ROOM_ID;
}

function findRoomTransitionForPosition(
  state: GameState,
  position: [number, number]
): RoomTransition | null {
  if (!state.roomTransitions || state.roomTransitions.length === 0) {
    return null;
  }
  const [y, x] = position;
  const activeRoom = getActiveRoomId(state);
  for (const transition of state.roomTransitions) {
    if (
      transition.from === activeRoom &&
      transition.position[0] === y &&
      transition.position[1] === x
    ) {
      return transition;
    }
  }
  return null;
}

function applyRoomTransition(
  state: GameState,
  transition: RoomTransition
): GameState {
  if (!state.rooms || Object.keys(state.rooms).length === 0) {
    return state;
  }

  const fromId = transition.from;
  const toId = transition.to;
  const sourceRooms = state.rooms;
  const targetRoom = sourceRooms[toId];

  if (!targetRoom) {
    return state;
  }

  const updatedRooms: Record<RoomId, RoomSnapshot> = { ...sourceRooms };

  if (sourceRooms[fromId]) {
    updatedRooms[fromId] = {
      ...sourceRooms[fromId],
      mapData: removePlayerFromMapData(state.mapData),
      enemies: serializeEnemies(state.enemies),
      npcs: serializeNPCs(state.npcs),
      potOverrides: clonePotOverrides(state.potOverrides),
    };
  }

  const sanitizedTarget = removePlayerFromMapData(targetRoom.mapData);
  const targetEnemiesPlain = clonePlainEnemies(targetRoom.enemies) ?? [];
  
  // CRITICAL: Determine NPCs dynamically based on current conditions
  let targetNPCsPlain: PlainNPC[] = [];
  if (state.mode === 'story' && state.storyFlags) {
    const npcs = determineRoomNpcs(
      toId,
      targetRoom.npcs,
      targetRoom.metadata?.conditionalNpcs as Record<string, { showWhen?: StoryCondition[]; removeWhen?: StoryCondition[] }> | undefined,
      sourceRooms,
      state.storyFlags,
      undefined
    );
    targetNPCsPlain = npcs;
    console.log(`[Room Transition] Dynamically loaded NPCs for ${toId}:`, npcs.map((n) => n.id).join(', ') || 'none');
  } else {
    targetNPCsPlain = clonePlainNPCs(targetRoom.npcs) ?? [];
  }
  
  updatedRooms[toId] = {
    ...targetRoom,
    mapData: sanitizedTarget,
    enemies: targetEnemiesPlain,
    npcs: targetNPCsPlain,
    potOverrides: clonePotOverrides(targetRoom.potOverrides),
  };

  let entry: [number, number] | undefined =
    transition.targetEntryPoint ?? targetRoom.entryPoint;

  const isDoorEntry = (pos: [number, number]) => {
    const [ey, ex] = pos;
    const subs = sanitizedTarget.subtypes[ey]?.[ex] ?? [];
    return (
      subs.includes(TileSubtype.DOOR) ||
      subs.includes(TileSubtype.ROOM_TRANSITION)
    );
  };

  const isValidEntry = (pos?: [number, number]): pos is [number, number] => {
    if (!pos) return false;
    if (!isWithinBounds(sanitizedTarget, pos[0], pos[1])) return false;
    const tile = sanitizedTarget.tiles[pos[0]]?.[pos[1]];
    if (tile === FLOOR) return true;
    return isDoorEntry(pos);
  };

  if (!isValidEntry(entry)) {
    let fallback: [number, number] | null = null;
    for (let y = 0; y < sanitizedTarget.tiles.length; y++) {
      for (let x = 0; x < sanitizedTarget.tiles[y].length; x++) {
        const pos: [number, number] = [y, x];
        if (isValidEntry(pos)) {
          fallback = [y, x];
          break;
        }
      }
      if (fallback) break;
    }
    entry = fallback ?? [0, 0];
  }

  const nextMapData = cloneMapData(sanitizedTarget);
  const [entryY, entryX] = entry!;
  const dest = nextMapData.subtypes[entryY][entryX] || [];
  const filtered = dest.filter((t) => t !== TileSubtype.PLAYER);
  if (!filtered.includes(TileSubtype.PLAYER)) {
    filtered.push(TileSubtype.PLAYER);
  }
  nextMapData.subtypes[entryY][entryX] = filtered;

  const nextEnemies = rehydrateEnemies(targetEnemiesPlain);
  const nextNpcs = rehydrateNPCs(targetNPCsPlain);
  const nextPotOverrides = clonePotOverrides(targetRoom.potOverrides);

  const finalState = {
    ...state,
    mapData: nextMapData,
    currentRoomId: toId,
    rooms: updatedRooms,
    enemies: nextEnemies,
    npcs: nextNpcs,
    potOverrides: nextPotOverrides,
  };

  // Process onRoomEnter effects (story mode only)
  if (finalState.mode === 'story') {
    const roomMetadata = targetRoom.metadata;
    const onRoomEnter = roomMetadata?.onRoomEnter as { effects?: Array<{ eventId: string; value: boolean }> } | undefined;
    if (onRoomEnter?.effects && Array.isArray(onRoomEnter.effects)) {
      for (const effect of onRoomEnter.effects) {
        if (effect.eventId && typeof effect.value === 'boolean') {
          if (!finalState.storyFlags) {
            finalState.storyFlags = {};
          }
          finalState.storyFlags[effect.eventId] = effect.value;
        }
      }
      // Update conditional NPCs after story flags change
      if (finalState.storyFlags && finalState.rooms) {
        updateConditionalNpcs(finalState);
        // Refresh active NPCs for the current room from updated snapshots
        const updatedSnapshot = finalState.rooms[toId];
        if (updatedSnapshot?.npcs) {
          finalState.npcs = rehydrateNPCs(updatedSnapshot.npcs);
        }
      }
    }
  }

  return finalState;
}

export function movePlayer(
  gameState: GameState,
  direction: Direction
): GameState {
  const position = findPlayerPosition(gameState.mapData);
  if (!position) return gameState; // No player found

  const [currentY, currentX] = position;
  let newY = currentY;
  let newX = currentX;

  const height = getMapHeight(gameState.mapData);
  const width = getMapWidth(gameState.mapData);

  if (height === 0 || width === 0) {
    return { ...gameState, playerDirection: direction };
  }

  // Calculate new position based on direction
  switch (direction) {
    case Direction.UP:
      newY = Math.max(0, currentY - 1);
      break;
    case Direction.RIGHT:
      newX = Math.min(width - 1, currentX + 1);
      break;
    case Direction.DOWN:
      newY = Math.min(height - 1, currentY + 1);
      break;
    case Direction.LEFT:
      newX = Math.max(0, currentX - 1);
      break;
  }

  // If position didn't change, return state with updated direction only
  if (newY === currentY && newX === currentX) {
    return { ...gameState, playerDirection: direction };
  }

  // Deep clone the map data to avoid modifying the original
  const newMapData = JSON.parse(JSON.stringify(gameState.mapData)) as MapData;
  // Always update the player direction regardless of whether movement succeeds
  let newGameState = {
    ...gameState,
    mapData: newMapData,
    playerDirection: direction,
  };
  // Reset transient deaths for this tick
  newGameState.recentDeaths = [];
  // Track if player actually changed tiles this turn
  let moved = false;
  let checkpointTouched = false;

  // Tick enemies BEFORE resolving player movement so adjacent enemies can attack
  const playerPosNow = [currentY, currentX] as [number, number];
  if (newGameState.enemies && Array.isArray(newGameState.enemies)) {
    // console.log(`[ENEMY TURN] Starting enemy turn. Player at (${currentY},${currentX}), moving ${direction}. Enemies:`, newGameState.enemies.map(e => `${e.kind} at (${e.y},${e.x})`).join(', '));
    const result = updateEnemies(
      newMapData.tiles,
      newMapData.subtypes,
      newGameState.enemies,
      { y: playerPosNow[0], x: playerPosNow[1] },
      {
        // Use provided RNG, else fallback to Math.random so variance is active in runtime
        rng: newGameState.combatRng ?? Math.random,
        defense: newGameState.hasShield ? 1 : 0,
        playerTorchLit: newGameState.heroTorchLit ?? true,
        setPlayerTorchLit: (lit: boolean) => {
          newGameState.heroTorchLit = lit;
        },
        // Suppress only when the player moves directly away from an adjacent enemy along the same axis
        suppress: (e: Enemy) => {
          const dy = newY - currentY;
          const dx = newX - currentX;
          const adj = Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1;
          const movingAway =
            (dy !== 0 && Math.sign(dy) === Math.sign(currentY - e.y)) ||
            (dx !== 0 && Math.sign(dx) === Math.sign(currentX - e.x));
          // Do not suppress snakes; they should bite if adjacent
          if (e.kind === 'snake') return false;
          return adj && movingAway;
        },
      }
    );
    if (result.damage > 0) {
      const applied = Math.min(2, result.damage);
      const playerPos = findPlayerPosition(newGameState.mapData);
      console.log(`[PLAYER DAMAGE] Taking ${applied} damage (${result.damage} before cap) during movePlayer. Health: ${newGameState.heroHealth} -> ${Math.max(0, newGameState.heroHealth - applied)}. Player at: ${playerPos ? `(${playerPos[0]},${playerPos[1]})` : 'unknown'}`);
      console.log(`[PLAYER DAMAGE] Attacking enemies:`, result.attackingEnemies.map(e => `${e.kind} dealt ${e.damage}`).join(', '));
      newGameState.heroHealth = Math.max(0, newGameState.heroHealth - applied);
      newGameState.stats.damageTaken += applied;

      // Apply poison condition if snake attacked
      const snakeAttacked = result.attackingEnemies.some(enemy => enemy.kind === 'snake');
      if (snakeAttacked) {
        if (!newGameState.conditions) {
          newGameState.conditions = {};
        }
        if (!newGameState.conditions.poisoned) {
          newGameState.conditions.poisoned = {
            active: true,
            stepsSinceLastDamage: 0,
            damagePerInterval: 1,
            stepInterval: 8
          };
        } else {
          newGameState.conditions.poisoned.active = true;
        }
      }

      // If player dies from enemy damage, track which enemy killed them
      if (newGameState.heroHealth === 0) {
        // Find the enemy that dealt damage (closest to player)
        const killerEnemy = newGameState.enemies.find(
          (e) => Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1
        );
        if (killerEnemy) {
          console.log(`[PLAYER DEATH] Killed by ${killerEnemy.kind} at (${killerEnemy.y},${killerEnemy.x}). Player was at (${currentY},${currentX})`);
          newGameState.deathCause = {
            type: "enemy",
            enemyKind: killerEnemy.kind,
          };
        } else {
          console.log(`[PLAYER DEATH] Health reached 0 but no adjacent enemy found. Player at (${currentY},${currentX})`);
        }
      }
    }

    // After enemies move, apply hazard deaths (stone-exciters falling into faulty floor)
    applyEnemyHazardDeaths(newGameState);

    // console.log(`[ENEMY TURN] After enemy turn. Enemies now at:`, newGameState.enemies.map(e => `${e.kind} at (${e.y},${e.x}) dist:${Math.abs(e.y - currentY) + Math.abs(e.x - currentX)}`).join(', '));

    // Update NPC behaviors (e.g., dogs following player)
    updateNPCBehaviors(newGameState, [currentY, currentX]);

    // Ghost effect: any ghost ending adjacent snuffs torch and vanishes with death effect
    const adjacentGhosts = newGameState.enemies.filter(
      (e) =>
        e.kind === "ghost" &&
        Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1
    );
    if (adjacentGhosts.length > 0) {
      newGameState.heroTorchLit = false;
      // Record death VFX positions
      for (const g of adjacentGhosts) {
        newGameState.recentDeaths?.push([g.y, g.x]);
      }
      // Count them as defeated
      newGameState.stats.enemiesDefeated += adjacentGhosts.length;
      // Track type-specific defeats (all ghosts here)
      if (!newGameState.stats.byKind)
        newGameState.stats.byKind = createEmptyByKind();
      newGameState.stats.byKind.ghost += adjacentGhosts.length;
      // Remove adjacent ghosts from active enemies
      newGameState.enemies = newGameState.enemies.filter(
        (e) =>
          !(
            e.kind === "ghost" &&
            Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1
          )
      );
    }
  }

  const destSubtypes = newMapData.subtypes[newY]?.[newX];
  if (destSubtypes && destSubtypes.includes(TileSubtype.DOOR)) {
    newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
      currentX
    ].filter((type) => type !== TileSubtype.PLAYER);
    if (!destSubtypes.includes(TileSubtype.PLAYER)) {
      destSubtypes.push(TileSubtype.PLAYER);
    }
    moved = true;

    const adj: Array<[number, number]> = [
      [newY - 1, newX],
      [newY + 1, newX],
      [newY, newX - 1],
      [newY, newX + 1],
    ];
    for (const [ay, ax] of adj) {
      if (
        isWithinBounds(newMapData, ay, ax) &&
        newMapData.subtypes[ay]?.[ax]?.includes(TileSubtype.WALL_TORCH)
      ) {
        newGameState.heroTorchLit = true;
        break;
      }
    }

    if (moved) {
      incrementStepsAndTime(newGameState);
      const transition = findRoomTransitionForPosition(newGameState, [newY, newX]);
      if (transition) {
        newGameState = applyRoomTransition(newGameState, transition);
      }
    }

    return newGameState;
  }

  // Check if the new position is a wall
  if (newMapData.tiles[newY][newX] === WALL) {
    // Check if it's a door or lock
    const subtype = destSubtypes ?? [];

    // If it's a lock and player has key, unlock it
    if (subtype.includes(TileSubtype.LOCK) && newGameState.hasKey) {
      // Convert the lock to floor when unlocked; universal key is not consumed
      newMapData.tiles[newY][newX] = FLOOR;
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
        (type) => type !== TileSubtype.LOCK
      );
      // Move the player onto the unlocked floor tile
      newMapData.subtypes[currentY][currentX].filter(
        (type) => type !== TileSubtype.PLAYER
      );
      newMapData.subtypes[newY][newX].push(TileSubtype.PLAYER);
      // Keep hasKey true (universal key is not consumed)
      moved = true;
    }
    // If it's an exit, require EXITKEY to open
    else if (subtype.includes(TileSubtype.EXIT)) {
      if (newGameState.hasExitKey) {
        // Check if this is multi-tier mode and not the final floor
        const isMultiTier = newGameState.maxFloors && newGameState.maxFloors > 1;
        const currentFloor = newGameState.currentFloor ?? 1;
        const maxFloors = newGameState.maxFloors ?? 1;
        const isFinalFloor = currentFloor >= maxFloors;

        if (isMultiTier && !isFinalFloor) {
          // Multi-tier mode: advance to next floor instead of winning
          // Don't modify the map - the entire state will be replaced by advanceToNextFloor
          newGameState.hasExitKey = false;
          newGameState.win = false;
          newGameState.needsFloorTransition = true;
          return newGameState; // Return immediately; floor transition handler will replace the state
        } else {
          // Single-tier mode or final floor: normal win behavior
          // Convert the exit to floor when player opens it
          newMapData.tiles[newY][newX] = FLOOR;
          newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][
            newX
          ].filter((type) => type !== TileSubtype.EXIT);

          // Move player to the new position and consume the exit key
          newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
            currentX
          ].filter((type) => type !== TileSubtype.PLAYER);
          newMapData.subtypes[newY][newX].push(TileSubtype.PLAYER);
          newGameState.hasExitKey = false;
          newGameState.win = true;
          moved = true;
        }

        // Here you would typically trigger a win condition
        // debug: player opened exit
      }
      // If no exit key, blocked by exit wall
    }

    // For regular walls, do nothing - player cannot move there
    if (moved) {
      incrementStepsAndTime(newGameState);
      const transition = findRoomTransitionForPosition(newGameState, [newY, newX]);
      if (transition) {
        newGameState = applyRoomTransition(newGameState, transition);
      }
    }
    return newGameState;
  }

  // If the new position is a floor or flowers tile
  if (newMapData.tiles[newY][newX] === FLOOR || newMapData.tiles[newY][newX] === FLOWERS) {
    const subtype = newMapData.subtypes[newY][newX];
    const containsCheckpoint = subtype.includes(TileSubtype.CHECKPOINT);

    // Treat checkpoints as solid objects – the player cannot stand on the
    // checkpoint tile itself.
    if (containsCheckpoint) {
      return newGameState;
    }

    // Check if tile has a town sign - blocks movement (solid object)
    if (subtype.includes(TileSubtype.TOWN_SIGN)) {
      return newGameState;
    }

    // Check if tile has a torch on floor - blocks movement (solid object)
    if (subtype.includes(TileSubtype.WALL_TORCH)) {
      return newGameState;
    }

    // Check if tile has a bookshelf - blocks movement but triggers interaction
    if (subtype.includes(TileSubtype.BOOKSHELF)) {
      // Queue bookshelf interaction
      if (newGameState.currentRoomId) {
        const bookshelfId = `${newGameState.currentRoomId}-shelf-${newY}-${newX}`;
        const existingQueue = newGameState.bookshelfInteractionQueue ?? [];
        // Create a new array to avoid mutation issues
        newGameState.bookshelfInteractionQueue = [
          ...existingQueue,
          {
            bookshelfId,
            position: [newY, newX],
          }
        ];
      }
      return newGameState;
    }

    // Check if tile has a bed - blocks movement but triggers interaction
    const hasBed = subtype.some(s => 
      s === TileSubtype.BED_EMPTY_1 || s === TileSubtype.BED_EMPTY_2 ||
      s === TileSubtype.BED_EMPTY_3 || s === TileSubtype.BED_EMPTY_4 ||
      s === TileSubtype.BED_FULL_1 || s === TileSubtype.BED_FULL_2 ||
      s === TileSubtype.BED_FULL_3 || s === TileSubtype.BED_FULL_4
    );
    if (hasBed) {
      // Check if bed is occupied (has BED_FULL subtype)
      const isOccupied = subtype.some(s => 
        s === TileSubtype.BED_FULL_1 || s === TileSubtype.BED_FULL_2 ||
        s === TileSubtype.BED_FULL_3 || s === TileSubtype.BED_FULL_4
      );
      // Queue bed interaction
      if (newGameState.currentRoomId) {
        const bedId = `${newGameState.currentRoomId}-bed-${newY}-${newX}`;
        const existingQueue = newGameState.bedInteractionQueue ?? [];
        newGameState.bedInteractionQueue = [
          ...existingQueue,
          {
            bedId,
            position: [newY, newX],
            isOccupied,
          }
        ];
      }
      return newGameState;
    }

    const blockingNpc = newGameState.npcs?.find(
      (npc) => npc.y === newY && npc.x === newX && !npc.isDead()
    );
    if (blockingNpc) {
      // Special handling for dog NPCs - petting interaction
      const isDog = blockingNpc.tags?.includes("dog") || blockingNpc.tags?.includes("pet");
      if (isDog) {
        // Mark this as a petting interaction
        blockingNpc.setMemory("lastPetAt", Date.now());
        blockingNpc.setMemory("petCount", ((blockingNpc.getMemory("petCount") as number) || 0) + 1);
        
        // Create a special petting interaction event
        const queue = newGameState.npcInteractionQueue
          ? [...newGameState.npcInteractionQueue]
          : [];
        
        const petHook = {
          id: `pet-${blockingNpc.id}`,
          type: "custom" as const,
          description: `Pet ${blockingNpc.name}`,
          payload: { action: "pet", npcId: blockingNpc.id, position: [newY, newX] },
        };
        
        queue.push(blockingNpc.createInteractionEvent("action", petHook));
        const MAX_QUEUE = 20;
        const trimmed =
          queue.length > MAX_QUEUE
            ? queue.slice(queue.length - MAX_QUEUE)
            : queue;
        newGameState.npcInteractionQueue = trimmed;
        
        // Don't block movement - player stays in place but interaction triggers
        return newGameState;
      }
      
      // Regular NPC interaction (dialogue)
      // Only change facing for left/right to avoid "laying down" bug when NPC faces UP
      if (direction === Direction.LEFT || direction === Direction.RIGHT) {
        const oppositeFacing = direction === Direction.LEFT ? Direction.RIGHT : Direction.LEFT;
        blockingNpc.face(oppositeFacing);
      }
      // Don't change facing for vertical bumps (keeps NPC from laying down)
      blockingNpc.setMemory("lastBumpAt", Date.now());
      blockingNpc.setMemory("lastHeroDirection", direction);
      blockingNpc.setMemory("lastManualInteract", Date.now());
      if (newGameState.npcs) {
        newGameState.npcs = [...newGameState.npcs];
      }
      const queue = newGameState.npcInteractionQueue
        ? [...newGameState.npcInteractionQueue]
        : [];
      const flags = newGameState.storyFlags ?? createInitialStoryFlags();
      // Only resolve dialogue scripts in story mode
      const scriptId = newGameState.mode === 'story' 
        ? resolveNpcDialogueScript(blockingNpc.id, flags, newGameState)
        : undefined;
      const dynamicHook = scriptId
        ? {
            id: `story-dialogue:${scriptId}`,
            type: "dialogue" as const,
            description: `Talk to ${blockingNpc.name}`,
            payload: { dialogueId: scriptId },
          }
        : undefined;
      if (dynamicHook) {
        const existingDialogueHooks =
          blockingNpc.interactionHooks?.filter(
            (hook) => hook.type === "dialogue" && hook.id !== dynamicHook.id
          ) ?? [];
        blockingNpc.interactionHooks = [dynamicHook, ...existingDialogueHooks];
      }
      queue.push(blockingNpc.createInteractionEvent("action", dynamicHook));
      const MAX_QUEUE = 20;
      const trimmed =
        queue.length > MAX_QUEUE
          ? queue.slice(queue.length - MAX_QUEUE)
          : queue;
      newGameState.npcInteractionQueue = trimmed;
      newGameState.storyFlags = flags;
      return newGameState;
    }

    // If it's a POT, reveal content without moving
    if (subtype.includes(TileSubtype.POT)) {
      // Special case: snake pot spawns a snake and triggers immediate attack/poison
      if (subtype.includes(TileSubtype.SNAKE)) {
        console.log(`[SNAKE POT] Snake pot opened at (${newY},${newX}). Player at (${currentY},${currentX})`);
        // Remove the pot and snake tag from the tile
        newMapData.subtypes[newY][newX] = subtype.filter(
          (t) => t !== TileSubtype.POT && t !== TileSubtype.SNAKE
        );
        // Spawn a snake enemy at this tile
        if (!newGameState.enemies) newGameState.enemies = [];
        const snake = new Enemy({ y: newY, x: newX });
        snake.kind = 'snake';
        newGameState.enemies.push(snake);
        console.log(`[SNAKE POT] Spawned snake at (${newY},${newX}). Calling updateEnemies AGAIN (potential double-attack bug!)`);

        // Immediate enemy resolution relative to current player position
        const posNow = [currentY, currentX] as [number, number];
        const result = updateEnemies(
          newMapData.tiles,
          newMapData.subtypes,
          newGameState.enemies,
          { y: posNow[0], x: posNow[1] },
          {
            rng: newGameState.combatRng ?? Math.random,
            defense: newGameState.hasShield ? 1 : 0,
            playerTorchLit: newGameState.heroTorchLit ?? true,
            setPlayerTorchLit: (lit: boolean) => {
              newGameState.heroTorchLit = lit;
            },
          }
        );
        // Guarantee at least 1 immediate damage from an ambush
        const dmgNow = Math.max(1, result.damage);
        if (dmgNow > 0) {
          const applied = Math.min(2, dmgNow);
          console.log(`[SNAKE POT] Snake pot ambush at (${newY},${newX})! Dealing ${applied} damage (${dmgNow} before cap). Health: ${newGameState.heroHealth} -> ${Math.max(0, newGameState.heroHealth - applied)}. Player at (${currentY},${currentX})`);
          newGameState.heroHealth = Math.max(0, newGameState.heroHealth - applied);
          newGameState.stats.damageTaken += applied;
        }
        // If the ambush was lethal, mark death cause as enemy snake
        if (newGameState.heroHealth === 0) {
          console.log(`[PLAYER DEATH] Killed by snake pot ambush at (${newY},${newX})`);
          newGameState.deathCause = { type: "enemy", enemyKind: "snake" };
          return newGameState;
        }
        // Always apply poison on a snake ambush from a pot
        if (!newGameState.conditions) newGameState.conditions = {};
        if (!newGameState.conditions.poisoned) {
          newGameState.conditions.poisoned = {
            active: true,
            stepsSinceLastDamage: 0,
            damagePerInterval: 1,
            stepInterval: 8,
          };
        } else {
          newGameState.conditions.poisoned.active = true;
        }
        return newGameState;
      }

      // If this pot is tagged with RUNE, reveal the rune; otherwise reveal FOOD/MED 50/50
      if (subtype.includes(TileSubtype.RUNE)) {
        // Reveal rune while preserving other overlays except POT
        const base = newMapData.subtypes[newY][newX].filter(
          (t) => t !== TileSubtype.POT && t !== TileSubtype.RUNE
        );
        newMapData.subtypes[newY][newX] = base.concat([TileSubtype.RUNE]);
      } else {
        const key = `${newY},${newX}`;
        const overrides = newGameState.potOverrides;
        const overrideReveal = overrides?.[key];
        if (overrideReveal) {
          const base = newMapData.subtypes[newY][newX].filter((t) => t !== TileSubtype.POT);
          newMapData.subtypes[newY][newX] = base.concat([overrideReveal]);
          if (overrides) {
            const nextOverrides = { ...overrides };
            delete nextOverrides[key];
            newGameState.potOverrides = Object.keys(nextOverrides).length
              ? nextOverrides
              : undefined;
          }
        } else {
          // Deterministic reveal so all players see the same contents for this pot
          const reveal = pickPotRevealDeterministic(newMapData, newY, newX);
          const base = newMapData.subtypes[newY][newX].filter((t) => t !== TileSubtype.POT);
          newMapData.subtypes[newY][newX] = base.concat([reveal]);
        }
      }
      return newGameState;
    }

    // If it's FOOD or MED, always add to inventory (no auto-heal on pickup)
    if (
      subtype.includes(TileSubtype.FOOD) ||
      subtype.includes(TileSubtype.MED)
    ) {
      if (subtype.includes(TileSubtype.FOOD)) {
        // Food: always goes to inventory
        newGameState.foodCount = (newGameState.foodCount || 0) + 1;
      } else {
        // MED/Potion: always goes to inventory
        newGameState.potionCount = (newGameState.potionCount || 0) + 1;
      }
      moved = true;
    }

    // If it's a RUNE, pick it up and clear the tile
    if (subtype.includes(TileSubtype.RUNE)) {
      newGameState.runeCount = (newGameState.runeCount || 0) + 1;
      // Remove only the RUNE tag; preserve other overlays like ROAD
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter((t) => t !== TileSubtype.RUNE);
      // debug: rune picked up
    }

    // If it's a FAULTY_FLOOR, trigger the trap
    if (subtype.includes(TileSubtype.FAULTY_FLOOR)) {
      // Convert the faulty floor to darkness and kill player instantly
      newMapData.subtypes[newY][newX] = [
        TileSubtype.DARKNESS,
        TileSubtype.PLAYER,
      ];
      newGameState.heroHealth = 0;
      newGameState.deathCause = { type: "faulty_floor" };
      // debug: faulty floor death
    }

    // If it's an EXIT (floor overlay)
    if (subtype.includes(TileSubtype.EXIT)) {
      if (!newGameState.hasExitKey) {
        // Block movement onto EXIT tile without the exit key
        return newGameState;
      } else {
        // Check if this is multi-tier mode and not the final floor
        const isMultiTier = newGameState.maxFloors && newGameState.maxFloors > 1;
        const currentFloor = newGameState.currentFloor ?? 1;
        const maxFloors = newGameState.maxFloors ?? 1;
        const isFinalFloor = currentFloor >= maxFloors;

        if (isMultiTier && !isFinalFloor) {
          // Multi-tier mode: advance to next floor instead of winning
          newGameState.hasExitKey = false;
          newGameState.win = false;
          newGameState.needsFloorTransition = true;
          return newGameState; // Return immediately; floor transition handler will replace the state
        } else {
          // Single-tier mode or final floor: normal win behavior
          // With key: stepping onto EXIT triggers win. Do NOT remove EXIT from map.
          newGameState.hasExitKey = false;
          newGameState.win = true;
        }
        // debug: player won or advancing floor
        // Continue to generic movement below so the player moves onto the tile this tick
      }
    }

    // If it's an item revealed from a chest (SWORD/SHIELD), pick it up on entry
    // but ONLY if the tile no longer has a CHEST (i.e., after it's been opened)
    if (
      (subtype.includes(TileSubtype.SWORD) ||
        subtype.includes(TileSubtype.SHIELD)) &&
      !subtype.includes(TileSubtype.CHEST)
    ) {
      if (subtype.includes(TileSubtype.SWORD)) {
        newGameState.hasSword = true;
      }
      if (subtype.includes(TileSubtype.SHIELD)) {
        newGameState.hasShield = true;
      }
      // Clearing of item happens below when we set dest tile subtypes
    }

    // If it's a ROCK, pick it up (increment inventory) and clear the tile
    if (subtype.includes(TileSubtype.ROCK)) {
      newGameState.rockCount = (newGameState.rockCount || 0) + 1;
      // Remove only the ROCK tag; preserve other overlays like ROAD
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter((t) => t !== TileSubtype.ROCK);
      // debug: rock picked up
    }

    // Combat: if an enemy occupies the destination, resolve attack
    if (newGameState.enemies && Array.isArray(newGameState.enemies)) {
      const idx = newGameState.enemies.findIndex(
        (e) => e.y === newY && e.x === newX
      );
      if (idx !== -1) {
        // Apply hero damage to enemy with variance and sword bonus
        const enemy = newGameState.enemies[idx];
        // Use provided RNG, else fallback to Math.random so variance applies in gameplay
        const rng = newGameState.combatRng ?? Math.random;
        // Weighted variance: 25% chance -1, 50% chance 0, 25% chance +1
        const variance = rng
          ? ((r) => (r < 0.25 ? -1 : r < 0.75 ? 0 : 1))(rng())
          : 0;
        const swordBonus = newGameState.hasSword ? 2 : 0;
        const heroDamage = EnemyRegistry[enemy.kind].calcMeleeDamage({
          heroAttack: newGameState.heroAttack,
          swordBonus,
          variance,
        });
        try { /* debug log removed */ } catch {}
        enemy.health -= heroDamage;
        newGameState.stats.damageDealt += heroDamage;

        if (enemy.health <= 0) {
          // Store defeated enemy info for onEnemyDefeat processing
          if (!newGameState.defeatedEnemies) newGameState.defeatedEnemies = [];
          const defeatedEnemy = {
            y: newY,
            x: newX,
            kind: enemy.kind,
            behaviorMemory: enemy.behaviorMemory
          };
          newGameState.defeatedEnemies.push(defeatedEnemy);
          
          // Process enemy defeat story events
          const updatedGameState = processEnemyDefeat(newGameState, defeatedEnemy);
          Object.assign(newGameState, updatedGameState);
          
          // Remove enemy; player stays in current position (do not step into enemy tile)
          newGameState.enemies.splice(idx, 1);
          newGameState.stats.enemiesDefeated += 1;
          // Track per-kind kill for melee
          if (!newGameState.stats.byKind)
            newGameState.stats.byKind = createEmptyByKind();
          {
            const k = enemy.kind as EnemyKind;
            newGameState.stats.byKind[k] =
              (newGameState.stats.byKind[k] ?? 0) + 1;
          }
          // Record death at the enemy's tile (newY, newX)
          if (!newGameState.recentDeaths) newGameState.recentDeaths = [];
          newGameState.recentDeaths.push([newY, newX]);

          // End of turn after combat; do not tick enemies again this input
          return newGameState;
        } else {
          // Enemy survived: end turn without another enemy tick
          return newGameState;
        }
      }
    }

    // If it's a key, pick it up
    if (subtype.includes(TileSubtype.KEY)) {
      // Universal generic key: once picked up, always available for generic locks
      newGameState.hasKey = true;
      newMapData.subtypes[newY][newX] = [];
    }

    // If it's an exit key, pick it up
    if (subtype.includes(TileSubtype.EXITKEY)) {
      newGameState.hasExitKey = true;
      newMapData.subtypes[newY][newX] = [];
    }

    // If it's a lightswitch, toggle full map visibility
    if (subtype.includes(TileSubtype.LIGHTSWITCH)) {
      // Toggle the showFullMap flag
      newGameState.showFullMap = !newGameState.showFullMap;

      // Keep the lightswitch on the tile (don't remove it)
      // Player and lightswitch will coexist on the same tile
    }

    // If it's a chest, handle opening logic (supports optional lock)
    if (subtype.includes(TileSubtype.CHEST)) {
      const isLocked = subtype.includes(TileSubtype.LOCK);
      // If locked and no key: allow stepping onto the chest tile, but do NOT open.
      if (isLocked && !newGameState.hasKey) {
        // Fall through to normal movement logic below. The coexist rules will
        // allow PLAYER to share the tile with CHEST+LOCK, leaving it closed.
      } else {
        // Remove LOCK if present (universal key is not consumed)
        if (isLocked && newGameState.hasKey) {
          newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][
            newX
          ].filter((t) => t !== TileSubtype.LOCK);
        }

        // Open the chest in place, but DO NOT grant item yet and DO NOT move the player
        // Keep the item (SWORD/SHIELD) visible on top of the opened chest
        // Remove only the CHEST marker, leave item subtype as-is
        newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][
          newX
        ].filter((t) => t !== TileSubtype.CHEST);
        if (!newMapData.subtypes[newY][newX].includes(TileSubtype.OPEN_CHEST)) {
          newMapData.subtypes[newY][newX].push(TileSubtype.OPEN_CHEST);
        }
        // Return without moving
        return newGameState;
      }
    }

    // Move player to the new position
    newMapData.subtypes[currentY][currentX] = newMapData.subtypes[currentY][
      currentX
    ].filter((type) => type !== TileSubtype.PLAYER);
    // If current position array is empty after filtering, make it an empty array
    if (newMapData.subtypes[currentY][currentX].length === 0) {
      newMapData.subtypes[currentY][currentX] = [];
    }

    // Handle special cases where player coexists with a persistent tile subtype
    const destSubtypes = newMapData.subtypes[newY][newX];
    if (
      destSubtypes.includes(TileSubtype.LIGHTSWITCH) ||
      destSubtypes.includes(TileSubtype.OPEN_CHEST) ||
      destSubtypes.includes(TileSubtype.CHEST) ||
      destSubtypes.includes(TileSubtype.ROOM_TRANSITION) ||
      destSubtypes.includes(TileSubtype.CHECKPOINT) ||
      destSubtypes.includes(TileSubtype.WALL_TORCH) ||
      destSubtypes.includes(TileSubtype.PORTAL) ||
      // Roads are floor overlays; keep them when the player steps on them
      destSubtypes.includes(TileSubtype.ROAD) ||
      destSubtypes.includes(TileSubtype.ROAD_STRAIGHT) ||
      destSubtypes.includes(TileSubtype.ROAD_CORNER) ||
      destSubtypes.includes(TileSubtype.ROAD_T) ||
      destSubtypes.includes(TileSubtype.ROAD_END) ||
      destSubtypes.includes(TileSubtype.ROAD_ROTATE_90) ||
      destSubtypes.includes(TileSubtype.ROAD_ROTATE_180) ||
      destSubtypes.includes(TileSubtype.ROAD_ROTATE_270)
    ) {
      if (!destSubtypes.includes(TileSubtype.PLAYER)) {
        destSubtypes.push(TileSubtype.PLAYER);
      }
    } else {
      // For other tiles, just set to player
      newMapData.subtypes[newY][newX] = [TileSubtype.PLAYER];
    }
    // If we picked up FOOD/MED, always remove. For SWORD/SHIELD, only
    // remove when the destination does NOT contain a closed CHEST. This
    // ensures stepping onto a locked (closed) chest without a key will not
    // pick up the item yet.
    const dest = newMapData.subtypes[newY][newX];
    const hasClosedChest = dest.includes(TileSubtype.CHEST);
    newMapData.subtypes[newY][newX] = dest.filter((t) => {
      if (t === TileSubtype.FOOD || t === TileSubtype.MED) return false;
      if (
        (t === TileSubtype.SWORD || t === TileSubtype.SHIELD) &&
        !hasClosedChest
      )
        return false;
      return true;
    });
    moved = true;

    if (newGameState.allowCheckpoints) {
      const adjacentTiles: Array<[number, number]> = [
        [newY - 1, newX],
        [newY + 1, newX],
        [newY, newX - 1],
        [newY, newX + 1],
      ];
      for (const [ay, ax] of adjacentTiles) {
        if (
          isWithinBounds(newMapData, ay, ax) &&
          newMapData.subtypes[ay]?.[ax]?.includes(TileSubtype.CHECKPOINT)
        ) {
          checkpointTouched = true;
          break;
        }
      }
    }

    // Relight hero torch if adjacent to any wall torch after normal movement
    const adj2: Array<[number, number]> = [
      [newY - 1, newX],
      [newY + 1, newX],
      [newY, newX - 1],
      [newY, newX + 1],
    ];
    for (const [ay, ax] of adj2) {
      if (
        isWithinBounds(newMapData, ay, ax) &&
        newMapData.subtypes[ay]?.[ax]?.includes(TileSubtype.WALL_TORCH)
      ) {
        newGameState.heroTorchLit = true;
        break;
      }
    }
  }

  // Enemies have already been updated at the start of this turn
  // Increment steps if a move occurred
  if (moved) {
    incrementStepsAndTime(newGameState);
    const transition = findRoomTransitionForPosition(newGameState, [newY, newX]);
    if (transition) {
      newGameState = applyRoomTransition(newGameState, transition);
    }
  }

  if (checkpointTouched) {
    // Ensure the hero's torch is lit when saving at a checkpoint
    newGameState.heroTorchLit = true;
    newGameState.lastCheckpoint = createCheckpointSnapshot(newGameState);
  }
  // Handle poison damage over time
  if (newGameState.conditions?.poisoned?.active && moved) {
    const poison = newGameState.conditions.poisoned;
    poison.stepsSinceLastDamage += 1;
    if (poison.stepsSinceLastDamage >= poison.stepInterval) {
      // Apply poison damage
      const poisonDamage = poison.damagePerInterval;
      console.log(`[POISON DAMAGE] Taking ${poisonDamage} poison damage. Health: ${newGameState.heroHealth} -> ${Math.max(0, newGameState.heroHealth - poisonDamage)}. Steps since last: ${poison.stepsSinceLastDamage}`);
      newGameState.heroHealth = Math.max(0, newGameState.heroHealth - poisonDamage);
      newGameState.stats.damageTaken += poisonDamage;
      poison.stepsSinceLastDamage = 0;
      
      // Set death cause if poison kills the player
      if (newGameState.heroHealth === 0) {
        console.log(`[PLAYER DEATH] Killed by poison damage`);
        newGameState.deathCause = {
          type: "poison",
          enemyKind: "snake",
        };
      }
    }
  }

  return newGameState;
}
