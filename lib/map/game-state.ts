import {
  Enemy,
  placeEnemies,
  updateEnemies,
  rehydrateEnemies,
  type PlainEnemy,
  type EnemyAttackInfo,
} from "../enemy";
import { enemyTypeAssignement, assignWhiteGoblinSwarmIds } from "../enemy_assignment";
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
  TREE,
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
import { addRunePotsForStoneExciters, generateCompleteMap, generateCompleteMapForFloor, allocateChestsAndKeys } from "./map-features";
import { addSnakesPerRules, addStaticGuardNearKey } from "./enemy-features";
import { buildOutsideWorld, buildNightmareRoom, innerEdgeForDirection } from "./outside-world";
import { buildPinkRealm } from "./pink-realm";
import { seedMist, advanceMist, mistContains } from "./pink-mist";
import { mulberry32 as mulberry32Fn, withPatchedMathRandom } from "../rng";
import type { HeroDiaryEntry } from "../story/hero_diary";

import { pickPotRevealDeterministic } from "./pots";
import { applyTutorialDirector } from "../tutorial/tutorial_director";

// Helper function to track enemy kills by type and floor
function trackEnemyKill(stats: GameState["stats"], enemyKind: EnemyKind, floor: number): void {
  // Track by kind
  if (!stats.byKind) stats.byKind = createEmptyByKind();
  stats.byKind[enemyKind] = (stats.byKind[enemyKind] ?? 0) + 1;

  // Track by floor
  if (!stats.byFloor) stats.byFloor = {};
  if (!stats.byFloor[floor]) stats.byFloor[floor] = createEmptyByKind();
  stats.byFloor[floor][enemyKind] = (stats.byFloor[floor][enemyKind] ?? 0) + 1;
}

// A snake hidden in a pot (POT + SNAKE) only springs its ambush bite + poison when
// the player WALKS into it. A bomb blast, being an explosion, kills the coiled
// snake outright; SNAKE_POT_KILL_DAMAGE is the per-snake damage credited for that
// (see detonateLiveBombs). Thrown rocks/runes do NOT destroy the snake — they just
// break the pot and let it slither out (see breakPotReleasingContents).
const SNAKE_POT_KILL_DAMAGE = 2; // snakes have 2 HP

// Break a pot from range (a thrown rock or rune) WITHOUT the player stepping onto
// it. Unlike a bomb blast — which obliterates the tile — breaking a pot just
// releases what is inside, so the contents survive:
//   - snake pot -> the snake slithers out as a live enemy. It gets NO free ambush
//                  bite (you broke it from a distance) and acts on later turns.
//   - rune pot  -> the rune is revealed on the tile.
//   - food pot  -> its food/potion is revealed on the tile (the same deterministic
//                  contents a walk-in open would show; a pending override is used
//                  up just as opening would).
// Mutates mapData.subtypes[y][x] in place. Returns any spawned snake (else null)
// and the next potOverrides map (an override is consumed when used).
function breakPotReleasingContents(
  mapData: MapData,
  y: number,
  x: number,
  potOverrides: GameState["potOverrides"]
): { spawnedSnake: Enemy | null; potOverrides: GameState["potOverrides"] } {
  const subs = mapData.subtypes[y][x] || [];
  if (subs.includes(TileSubtype.SNAKE)) {
    mapData.subtypes[y][x] = subs.filter(
      (s) => s !== TileSubtype.POT && s !== TileSubtype.SNAKE
    );
    const snake = new Enemy({ y, x });
    snake.kind = "snake";
    return { spawnedSnake: snake, potOverrides };
  }
  if (subs.includes(TileSubtype.RUNE)) {
    const kept = subs.filter(
      (s) => s !== TileSubtype.POT && s !== TileSubtype.RUNE
    );
    mapData.subtypes[y][x] = kept.concat([TileSubtype.RUNE]);
    return { spawnedSnake: null, potOverrides };
  }
  // Food / potion pot: reveal the same contents a walk-in open would (reveal is
  // computed while the POT tag is still on the tile, matching the walk-in path).
  const key = `${y},${x}`;
  const overrideReveal = potOverrides?.[key];
  if (overrideReveal) {
    mapData.subtypes[y][x] = subs
      .filter((s) => s !== TileSubtype.POT)
      .concat([overrideReveal]);
    const next = { ...potOverrides };
    delete next[key];
    return {
      spawnedSnake: null,
      potOverrides: Object.keys(next).length ? next : undefined,
    };
  }
  const reveal = pickPotRevealDeterministic(mapData, y, x);
  mapData.subtypes[y][x] = subs
    .filter((s) => s !== TileSubtype.POT)
    .concat([reveal]);
  return { spawnedSnake: null, potOverrides };
}

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

/**
 * Drain temporary pink bonus hearts (the overheal buffer granted by the pink flaming
 * heart) before real health. Returns the new bonus-heart count and the residual damage
 * that should still be subtracted from heroHealth (0 if the buffer fully absorbed it).
 * Pure — callers apply the returned values themselves.
 */
function absorbBonusHearts(
  bonusHearts: number | undefined,
  amount: number
): { bonusHearts: number; toHealth: number } {
  const bonus = Math.max(0, bonusHearts ?? 0);
  if (amount <= 0) return { bonusHearts: bonus, toHealth: 0 };
  const absorbed = Math.min(bonus, amount);
  return { bonusHearts: bonus - absorbed, toHealth: amount - absorbed };
}

/**
 * Apply `amount` of incoming damage to the hero, draining pink bonus hearts before real
 * health. Mutates state.bonusHearts and state.heroHealth in place (heroHealth floored at
 * 0). Damage-stat bookkeeping (stats.damageTaken) stays at each call site unchanged.
 */
function applyHeroDamage(state: GameState, amount: number): void {
  const r = absorbBonusHearts(state.bonusHearts, amount);
  state.bonusHearts = r.bonusHearts;
  state.heroHealth = Math.max(0, state.heroHealth - r.toHealth);
}

// Total enemy damage the hero can take in a single turn. The standard dungeon caps this
// at 4 so a pile-on can't instantly delete the hero. The pink realm is a deliberately
// harder gauntlet guarding the heart, so its buffed swarms + hit-and-run ninjas are
// allowed to stack more per turn. Tunable knob for realm difficulty.
const PINK_REALM_DAMAGE_CAP = 6;
function perTurnDamageCap(state: { inPinkRealm?: boolean }): number {
  return state.inPinkRealm ? PINK_REALM_DAMAGE_CAP : 4;
}

/**
 * Record which enemy killed the hero on an action turn (throw/use-item). Ranged
 * attackers like pink goblins fire from a distance and then move, so an adjacency
 * search after the enemy turn misses them — read the killer straight from the
 * attack result instead, matching the movement-turn logic. No-op unless the hero
 * just died and no death cause has been set yet.
 */
function recordEnemyDeathCause(
  state: GameState,
  attackingEnemies: EnemyAttackInfo[]
): void {
  if (state.heroHealth !== 0 || state.deathCause) return;
  const killer = attackingEnemies[0];
  if (killer) {
    state.deathCause = { type: "enemy", enemyKind: killer.kind };
  }
}

export function performUseFood(gameState: GameState): GameState {
  gameState = detonateLiveBombs(gameState);
  if (gameState.heroHealth <= 0) return gameState;
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
          // Blind enemies standing in the pink mist (consistent with movement turns).
          skipEnemy: mistBlindSkip(preTickState),
        }
      );
      // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
      preTickState.recentEnemyAttacks = result.attackingEnemies;

      if (result.damage > 0) {
        const applied = Math.max(0, result.damage - (preTickState.hasShield ? 1 : 0));
        applyHeroDamage(preTickState, applied);
        preTickState.stats.damageTaken += applied;

        // If player dies from enemy damage, track which enemy killed them
        recordEnemyDeathCause(preTickState, result.attackingEnemies);
      }
    }
  }

  // A turn elapsed: enemies that stepped onto faulty floor this tick fall into
  // the abyss now, exactly as on a movement turn (see performThrowRock).
  applyEnemyHazardDeaths(preTickState);

  // Use the food: heal 1 HP (capped at heroMaxHealth) and consume 1 food
  const newGameState = { ...preTickState };
  newGameState.heroHealth = Math.min(newGameState.heroMaxHealth ?? 5, newGameState.heroHealth + 1);
  newGameState.foodCount = count - 1;
  newGameState.stats = {
    ...newGameState.stats,
    foodUsed: (newGameState.stats.foodUsed ?? 0) + 1,
    maxHealth: Math.max(newGameState.stats.maxHealth ?? 0, newGameState.heroHealth),
  };
  incrementStepsAndTime(newGameState);

  // debug: used food
  
  return newGameState;
}

/**
 * Use potion from inventory to heal 2 HP (costs a move like throwing rocks/runes)
 */
export function performUsePotion(gameState: GameState): GameState {
  gameState = detonateLiveBombs(gameState);
  if (gameState.heroHealth <= 0) return gameState;
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
          // Blind enemies standing in the pink mist (consistent with movement turns).
          skipEnemy: mistBlindSkip(preTickState),
        }
      );
      // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
      preTickState.recentEnemyAttacks = result.attackingEnemies;

      if (result.damage > 0) {
        const applied = Math.max(0, result.damage - (preTickState.hasShield ? 1 : 0));
        applyHeroDamage(preTickState, applied);
        preTickState.stats.damageTaken += applied;

        recordEnemyDeathCause(preTickState, result.attackingEnemies);
      }
    }
  }

  // A turn elapsed: enemies that stepped onto faulty floor this tick fall into
  // the abyss now, exactly as on a movement turn (see performThrowRock).
  applyEnemyHazardDeaths(preTickState);

  // Use the potion: heal 2 HP (capped at heroMaxHealth) and consume 1 potion
  const newGameState = { ...preTickState };
  newGameState.heroHealth = Math.min(newGameState.heroMaxHealth ?? 5, newGameState.heroHealth + 2);
  newGameState.potionCount = count - 1;
  newGameState.stats = {
    ...newGameState.stats,
    potionsUsed: (newGameState.stats.potionsUsed ?? 0) + 1,
    maxHealth: Math.max(newGameState.stats.maxHealth ?? 0, newGameState.heroHealth),
  };
  incrementStepsAndTime(newGameState);

  // Cure poison condition
  if (newGameState.conditions?.poisoned?.active) {
    newGameState.conditions.poisoned.active = false;
  }

  // debug: used potion

  return newGameState;
}

// Temporary pink hearts granted when the pink flaming heart prize is consumed.
export const PINK_HEART_BONUS_HEARTS = 3;

/**
 * Use the pink flaming heart prize (keyboard 'h'): refill to full health AND grant 3
 * temporary pink bonus hearts that sit on top of max health and are spent before real
 * health when damaged. Consumes one heart and costs a turn (enemies act first, like a
 * potion). Does nothing if none are held.
 */
export function performUsePinkHeart(gameState: GameState): GameState {
  gameState = detonateLiveBombs(gameState);
  if (gameState.heroHealth <= 0) return gameState;
  const count = gameState.pinkHeartCount ?? 0;
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
          skipEnemy: mistBlindSkip(preTickState),
        }
      );
      // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
      preTickState.recentEnemyAttacks = result.attackingEnemies;

      if (result.damage > 0) {
        const applied = Math.max(0, result.damage - (preTickState.hasShield ? 1 : 0));
        applyHeroDamage(preTickState, applied);
        preTickState.stats.damageTaken += applied;

        recordEnemyDeathCause(preTickState, result.attackingEnemies);
      }
    }
  }

  // A turn elapsed: enemies that stepped onto faulty floor this tick fall into
  // the abyss now, exactly as on a movement turn (see performThrowRock).
  applyEnemyHazardDeaths(preTickState);

  // Consume the heart: full heal + 3 temporary pink bonus hearts.
  const newGameState = { ...preTickState };
  newGameState.heroHealth = newGameState.heroMaxHealth ?? 5;
  newGameState.bonusHearts = (newGameState.bonusHearts ?? 0) + PINK_HEART_BONUS_HEARTS;
  newGameState.pinkHeartCount = count - 1;
  newGameState.stats = {
    ...newGameState.stats,
    pinkHeartsUsed: (newGameState.stats.pinkHeartsUsed ?? 0) + 1,
    maxHealth: Math.max(newGameState.stats.maxHealth ?? 0, newGameState.heroHealth),
  };
  incrementStepsAndTime(newGameState);

  return newGameState;
}

/**
 * Use a belted berry (keyboard 'g'): heal a variable 2-3 hearts (clamped to max health).
 * Consumes one berry and costs a turn (enemies act first, like a potion). Does nothing if
 * none are held.
 */
export function performUseBerry(gameState: GameState): GameState {
  gameState = detonateLiveBombs(gameState);
  if (gameState.heroHealth <= 0) return gameState;
  const count = gameState.berryCount ?? 0;
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
          skipEnemy: mistBlindSkip(preTickState),
        }
      );
      // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
      preTickState.recentEnemyAttacks = result.attackingEnemies;

      if (result.damage > 0) {
        const applied = Math.max(0, result.damage - (preTickState.hasShield ? 1 : 0));
        applyHeroDamage(preTickState, applied);
        preTickState.stats.damageTaken += applied;

        recordEnemyDeathCause(preTickState, result.attackingEnemies);
      }
    }
  }

  // A turn elapsed: enemies that stepped onto faulty floor this tick fall into
  // the abyss now, exactly as on a movement turn (see performThrowRock).
  applyEnemyHazardDeaths(preTickState);

  // Consume the berry: heal a variable 2-3 hearts (capped at heroMaxHealth).
  const healRng = preTickState.combatRng ?? Math.random;
  const heal = healRng() < 0.5 ? 2 : 3;
  const newGameState = { ...preTickState };
  newGameState.heroHealth = Math.min(
    newGameState.heroMaxHealth ?? 5,
    newGameState.heroHealth + heal
  );
  newGameState.berryCount = count - 1;
  newGameState.stats = {
    ...newGameState.stats,
    berriesUsed: (newGameState.stats.berriesUsed ?? 0) + 1,
    maxHealth: Math.max(newGameState.stats.maxHealth ?? 0, newGameState.heroHealth),
  };
  incrementStepsAndTime(newGameState);

  return newGameState;
}

/**
 * Throw a rock up to 4 tiles in the player's facing direction.
 * Minimal slice: if inventory has a rock and there is a clear 4-tile floor path,
 * land a ROCK on the 4th tile and decrement rockCount. No collisions/effects yet.
 */
export function performThrowRock(gameState: GameState): GameState {
  gameState = detonateLiveBombs(gameState);
  if (gameState.heroHealth <= 0) return gameState;
  const pos = findPlayerPosition(gameState.mapData);
  if (!pos) return gameState;
  const [py, px] = pos;
  const count = gameState.rockCount ?? 0;
  if (count <= 0) return gameState;

  // Treat throw as a player turn: enemies move first relative to current player position
  const preTickState: GameState = { ...gameState };
  // Reset transient deaths for this tick
  preTickState.recentDeaths = [];

  // Pre-scan the rock's trajectory using current (pre-move) positions so that any
  // enemy the rock will hit and kill this turn is fully skipped during the enemy
  // tick — they don't move, don't attack, and don't trigger proximity hooks like
  // the ghost torch-snuff. Fixes "ghost snuffs torch even when killed by rock".
  let preScanVx = 0, preScanVy = 0;
  switch (preTickState.playerDirection) {
    case Direction.UP: preScanVy = -1; break;
    case Direction.RIGHT: preScanVx = 1; break;
    case Direction.DOWN: preScanVy = 1; break;
    case Direction.LEFT: preScanVx = -1; break;
  }
  let rockKillTargetIdx: number | null = null;
  {
    const enemiesNow = preTickState.enemies ?? [];
    let scanY = py;
    let scanX = px;
    for (let step = 1; step <= 4; step++) {
      scanY += preScanVy;
      scanX += preScanVx;
      if (!isWithinBounds(preTickState.mapData, scanY, scanX)) break;
      const hitIdx = enemiesNow.findIndex((e) => e.y === scanY && e.x === scanX);
      if (hitIdx !== -1) {
        const target = enemiesNow[hitIdx];
        const targetHp = target.health ?? 1;
        // Skip the enemy's turn only if THIS throw will outright kill it — either
        // the rock's 2 damage finishes it, or it's a stone-goblin and a held rune
        // instantly kills it (see the rune branch below). A frozen target doesn't
        // move, so it dies on the tile it's shown on and the impact/ghost line up
        // (no "jump"). Surviving targets still get to act this tick.
        const runeWillKill =
          target.kind === "stone-goblin" && (preTickState.runeCount ?? 0) > 0;
        if (targetHp <= 2 || runeWillKill) {
          rockKillTargetIdx = hitIdx;
        }
        break; // rock stops at first enemy regardless
      }
      if (preTickState.mapData.tiles[scanY][scanX] !== FLOOR) break;
      const subs = preTickState.mapData.subtypes[scanY][scanX] || [];
      if (subs.includes(TileSubtype.POT)) break;
    }
  }

  if (preTickState.enemies && Array.isArray(preTickState.enemies)) {
    const enemiesRef = preTickState.enemies;
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
        // Fully skip any enemy the rock will kill this turn (no move, no attack,
        // no proximity hook). Prevents ghost-snuff-before-rock-hits race. Also blind
        // enemies standing in the pink mist (consistent with movement turns).
        skipEnemy: (e: Enemy) =>
          (rockKillTargetIdx !== null && enemiesRef[rockKillTargetIdx] === e) ||
          mistBlindSkip(preTickState)(e),
      }
    );
    // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
    preTickState.recentEnemyAttacks = result.attackingEnemies;
    if (result.damage > 0) {
      const applied = Math.min(perTurnDamageCap(preTickState), result.damage);
      applyHeroDamage(preTickState, applied);
      preTickState.stats = {
        ...preTickState.stats,
        damageTaken: preTickState.stats.damageTaken + applied,
      };
      // Record the killer (e.g. a pink goblin's ranged laser) so the end screen
      // can show how the hero died instead of a bare "You died".
      recordEnemyDeathCause(preTickState, result.attackingEnemies);
    }
    // Note: Do NOT apply adjacent ghost vanish on rock-throw turns; only move enemies.
  }

  // A turn elapsed: enemies that stepped onto faulty floor this tick fall into
  // the abyss now, exactly as on a movement turn. Without this, throwing lets
  // them walk over pits unharmed and simply step back off on the next turn.
  applyEnemyHazardDeaths(preTickState);

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
      return { 
        ...preTickState, 
        rockCount: count - 1,
        stats: {
          ...preTickState.stats,
          rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
        },
      };
    }
    // Check enemy collision first
    const enemies = preTickState.enemies ?? [];
    const hitIdx = enemies.findIndex((e) => e.y === ty && e.x === tx);
    if (hitIdx !== -1) {
      const newEnemies = enemies.slice();
      const target: Enemy = newEnemies[hitIdx];
      // If we have a rune and the target is a stone-goblin, consume a rune to instantly kill
      if (
        target.kind === "stone-goblin" &&
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
          enemiesKilledByRune: (preTickState.stats.enemiesKilledByRune ?? 0) + 1,
          rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
          runesUsed: (preTickState.stats.runesUsed ?? 0) + 1,
        };
        trackEnemyKill(newStats, removed.kind as EnemyKind, preTickState.currentFloor ?? 1);
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
        cleanupPinkRing(target, newMapData.subtypes);
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
          enemiesKilledByRock: (preTickState.stats.enemiesKilledByRock ?? 0) + 1,
          rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
        };
        // Track per-kind kill for rock kills
        trackEnemyKill(newStats, removed.kind as EnemyKind, preTickState.currentFloor ?? 1);
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
            rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
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
      // A thrown rock shatters the pot but does NOT destroy what is inside: a snake
      // slithers out as a live enemy (to be fought — no free ambush bite, since you
      // broke it from range), and a rune/food is left on the floor to pick up. (A
      // bomb blast, by contrast, obliterates the contents — see detonateLiveBombs.)
      const released = breakPotReleasingContents(
        newMapData,
        ty,
        tx,
        preTickState.potOverrides
      );
      return {
        ...preTickState,
        mapData: newMapData,
        enemies: released.spawnedSnake
          ? [...(preTickState.enemies ?? []), released.spawnedSnake]
          : preTickState.enemies,
        potOverrides: released.potOverrides,
        rockCount: count - 1,
        stats: {
          ...preTickState.stats,
          rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
        },
      };
    }
  }

  // Land the rock on the 4th tile, preserving existing overlays (e.g., ROAD).
  // A rock that comes to rest on an open abyss falls straight into the pit —
  // nothing can sit on a broken abyss — so it is consumed without being placed.
  {
    const landing = newMapData.subtypes[ty][tx] || [];
    if (!landing.includes(TileSubtype.OPEN_ABYSS)) {
      const base = landing.filter((t) => t !== TileSubtype.ROCK);
      newMapData.subtypes[ty][tx] = base.concat([TileSubtype.ROCK]);
    }
  }

  return {
    ...preTickState,
    mapData: newMapData,
    rockCount: count - 1,
    stats: {
      ...preTickState.stats,
      rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
    },
  };
}

/**
 * Throw a rune up to 4 tiles. Differences from rocks:
 * - If it hits a wall or goes OOB, it lands on the last traversed floor tile before impact and can be picked up again.
 * - If it hits an enemy:
 *   - stone-goblin: instantly killed, rune is consumed (removed from inventory).
 *   - others: deal 2 damage; if enemy dies, rune is consumed; otherwise, rune lands on the last traversed floor tile.
 */
export function performThrowRune(gameState: GameState): GameState {
  gameState = detonateLiveBombs(gameState);
  if (gameState.heroHealth <= 0) return gameState;
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
        // Blind enemies standing in the pink mist (consistent with movement turns).
        skipEnemy: mistBlindSkip(preTickState),
      }
    );
    // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
    preTickState.recentEnemyAttacks = result.attackingEnemies;
    if (result.damage > 0) {
      const applied = Math.min(perTurnDamageCap(preTickState), result.damage);
      applyHeroDamage(preTickState, applied);
      preTickState.stats = {
        ...preTickState.stats,
        damageTaken: preTickState.stats.damageTaken + applied,
      };
      // Record the killer (e.g. a pink goblin's ranged laser) so the end screen
      // can show how the hero died instead of a bare "You died".
      recordEnemyDeathCause(preTickState, result.attackingEnemies);
    }
  }

  // A turn elapsed: enemies that stepped onto faulty floor this tick fall into
  // the abyss now, exactly as on a movement turn (see performThrowRock).
  applyEnemyHazardDeaths(preTickState);

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
          // A rune dropping back onto an open abyss falls into the pit and is
          // gone — nothing sits on a broken abyss — but it is still spent.
          if (!lastSubs.includes(TileSubtype.OPEN_ABYSS)) {
            const base = lastSubs.filter((t) => t !== TileSubtype.RUNE);
            newMapData.subtypes[lastFloorY][lastFloorX] = base.concat([TileSubtype.RUNE]);
          }
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
      // A rune is not a bomb — a pink goblin killed this way leaves no teleport ring.
      cleanupPinkRing(removed, newMapData.subtypes);

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
      trackEnemyKill(newStats, removed.kind as EnemyKind, preTickState.currentFloor ?? 1);
      const newRecent = (
        preTickState.recentDeaths ? preTickState.recentDeaths.slice() : []
      ).concat([[removed.y, removed.x] as [number, number]]);
      
      const finalState = {
        ...preTickState,
        mapData: newMapData, // carries the pink-ring cleanup done above
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
          // A rune dropping back onto an open abyss falls into the pit and is
          // gone — nothing sits on a broken abyss — but it is still spent.
          if (!lastSubs.includes(TileSubtype.OPEN_ABYSS)) {
            const base = lastSubs.filter((t) => t !== TileSubtype.RUNE);
            newMapData.subtypes[lastFloorY][lastFloorX] = base.concat([TileSubtype.RUNE]);
          }
          return { ...preTickState, mapData: newMapData, runeCount: count - 1 };
        }
      }
      return preTickState;
    }

    // Pot on floor tile
    const subs = newMapData.subtypes[ty][tx] || [];
    if (subs.includes(TileSubtype.POT)) {
      // A thrown rune shatters the pot like a rock: the contents are released, not
      // destroyed (a snake slithers out as a live enemy, food/runes are left on the
      // floor). The thrown rune then drops in front of the pot so it can be
      // retrieved; if there is no floor tile to land on (pot directly ahead of the
      // player) the rune is kept in inventory rather than lost.
      const released = breakPotReleasingContents(
        newMapData,
        ty,
        tx,
        preTickState.potOverrides
      );
      let runeLanded = false;
      if (
        !(lastFloorY === py && lastFloorX === px) &&
        newMapData.tiles[lastFloorY][lastFloorX] === FLOOR
      ) {
        // If the drop-back tile is an open abyss the rune falls in and is gone,
        // but it is still spent (nothing sits on a broken abyss).
        if (!(newMapData.subtypes[lastFloorY][lastFloorX] || []).includes(TileSubtype.OPEN_ABYSS)) {
          newMapData.subtypes[lastFloorY][lastFloorX] = [TileSubtype.RUNE];
        }
        runeLanded = true;
      }
      return {
        ...preTickState,
        mapData: newMapData,
        enemies: released.spawnedSnake
          ? [...(preTickState.enemies ?? []), released.spawnedSnake]
          : preTickState.enemies,
        potOverrides: released.potOverrides,
        runeCount: runeLanded ? count - 1 : count,
      };
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
    
    if (!hasImportantTile && !subs.includes(TileSubtype.OPEN_ABYSS)) {
      const base = subs.filter((t) => t !== TileSubtype.RUNE);
      newMapData.subtypes[ty][tx] = base.concat([TileSubtype.RUNE]);
    }
    // A rune landing on an open abyss falls into the pit and is gone (still spent).
    return { ...preTickState, mapData: newMapData, runeCount: count - 1 };
  }
  return preTickState;
}

// --- Bombs -----------------------------------------------------------------

/** How far a thrown bomb travels before resting. */
const BOMB_THROW_RANGE = 4;
/** Damage dealt to the hero if caught in a bomb blast (fixed, not range-scaled). */
const BOMB_PLAYER_DAMAGE = 6;
/** Reduced hero damage when carrying a shield. */
const BOMB_PLAYER_DAMAGE_SHIELD = 4;
/** Damage dealt to each enemy in the blast. Kills everything, incl. a stone goblin (8 HP). */
const BOMB_ENEMY_DAMAGE = 8;
/** Each chest bomb pickup grants this many bombs. */
export const BOMB_PACK_SIZE = 3;

/**
 * Subtypes a bomb blast must NOT destroy. The exit door (EXIT) and exit key
 * (EXITKEY) are intentionally indestructible so a bomb can never strand a run.
 */
const BOMB_PROTECTED_SUBTYPES = new Set<TileSubtype>([
  TileSubtype.EXIT,
  TileSubtype.EXITKEY,
]);

/**
 * Subtypes that survive a blast on a tile that is otherwise scorched. Everything
 * not listed here (pots, rocks, runes, food, chests, keys, locks, etc.) is destroyed.
 */
const BOMB_PRESERVED_SUBTYPES = new Set<TileSubtype>([
  TileSubtype.EXIT,
  TileSubtype.EXITKEY,
  TileSubtype.PLAYER,
  TileSubtype.ROAD,
  TileSubtype.ROAD_STRAIGHT,
  TileSubtype.ROAD_CORNER,
  TileSubtype.ROAD_T,
  TileSubtype.ROAD_END,
  TileSubtype.ROAD_ROTATE_90,
  TileSubtype.ROAD_ROTATE_180,
  TileSubtype.ROAD_ROTATE_270,
  TileSubtype.ROOM_TRANSITION,
  TileSubtype.WALL_TORCH,
  TileSubtype.FLOOR_TORCH,
  TileSubtype.BREACH,
  TileSubtype.SINGED,
  // A pink goblin killed by the blast drops a teleport ring; keep it through the blast.
  TileSubtype.PINK_RING,
]);

/**
 * Resolve any armed bombs sitting on the current map. A bomb is placed (BOMB_LIVE)
 * on the turn it is thrown and detonates at the start of the player's next turn, so
 * this is called first thing in every turn entry point. Each live bomb produces a 3x3
 * blast that turns walls to floor, removes destructible items, kills enemies, scorches
 * tiles, and marks BREACH on any perimeter wall it opens. Always clears the transient
 * recentBombBlasts list so the UI only animates this turn's explosions.
 */
export function detonateLiveBombs(state: GameState): GameState {
  const subtypes = state.mapData.subtypes;
  const liveCenters: Array<[number, number]> = [];
  for (let y = 0; y < subtypes.length; y++) {
    const row = subtypes[y];
    for (let x = 0; x < row.length; x++) {
      if ((row[x] || []).includes(TileSubtype.BOMB_LIVE)) liveCenters.push([y, x]);
    }
  }
  if (liveCenters.length === 0) {
    // Clear any stale blast markers from a previous turn so VFX don't replay.
    if (state.recentBombBlasts && state.recentBombBlasts.length > 0) {
      return { ...state, recentBombBlasts: [] };
    }
    return state;
  }

  const newMapData = JSON.parse(JSON.stringify(state.mapData)) as MapData;
  const height = newMapData.tiles.length;
  const width = newMapData.tiles[0]?.length ?? 0;

  const enemies = state.enemies ? state.enemies.slice() : [];
  const defeatedEnemies = state.defeatedEnemies ? state.defeatedEnemies.slice() : [];
  const blastCenters: Array<[number, number]> = [];
  const stats = { ...state.stats, byKind: state.stats.byKind, byFloor: state.stats.byFloor };
  let wallsDestroyed = 0;
  let treesDestroyed = 0;
  let enemiesDefeated = 0;
  // Snake pots destroyed by the blast are counted separately: they add to the kill
  // tally but push nothing onto defeatedEnemies, so they must stay OUT of the
  // `slice(-enemiesDefeated)` story-event window below (which is keyed to real
  // enemy kills) to avoid re-processing a stale, previously-defeated enemy.
  let snakePotKills = 0;
  let playerHit = false;

  for (const [cy, cx] of liveCenters) {
    blastCenters.push([cy, cx]);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const y = cy + dy;
        const x = cx + dx;
        if (y < 0 || y >= height || x < 0 || x >= width) continue;
        const subs = newMapData.subtypes[y][x] || [];
        const isProtected = subs.some((s) => BOMB_PROTECTED_SUBTYPES.has(s));

        // Walls AND trees become floor (unless protected, e.g. the exit door). Trees are
        // destructible so the outside-world / nightmare boundaries can be blasted — they're
        // just made several layers thick so two bombs can't tunnel all the way through.
        const wasTree = newMapData.tiles[y][x] === TREE;
        const wasWall =
          newMapData.tiles[y][x] === WALL || wasTree;
        const openedWall = wasWall && !isProtected;
        if (openedWall) {
          newMapData.tiles[y][x] = FLOOR;
          wallsDestroyed += 1;
          if (wasTree) treesDestroyed += 1;
        }

        // Damage enemies caught in the blast. Most die; tough enemies (stone goblin,
        // 8 HP) can survive a single bomb.
        for (let i = enemies.length - 1; i >= 0; i--) {
          if (enemies[i].y === y && enemies[i].x === x) {
            const target = enemies[i];
            const prevHp = target.health ?? 1;
            const newHp = prevHp - BOMB_ENEMY_DAMAGE;
            stats.damageDealt = stats.damageDealt + Math.min(BOMB_ENEMY_DAMAGE, prevHp);
            if (newHp <= 0) {
              const removed = enemies.splice(i, 1)[0];
              // A bomb kill leaves the goblin's teleport ring behind (the pink realm key).
              dropPinkRingOnDeath(removed, newMapData.subtypes, y, x);
              defeatedEnemies.push({
                y: removed.y,
                x: removed.x,
                kind: removed.kind,
                behaviorMemory: removed.behaviorMemory,
              });
              trackEnemyKill(stats, removed.kind as EnemyKind, state.currentFloor ?? 1);
              enemiesDefeated += 1;
            } else {
              // Survives — record the damage.
              target.health = newHp;
            }
          }
        }

        // Hero caught in the blast takes damage once.
        if (subs.includes(TileSubtype.PLAYER)) playerHit = true;

        // A snake pot caught in the blast: the coiled snake dies with the shattered
        // pot. The blast VFX already plays here, so credit the kill in stats (toward
        // the snake-hater badge / run totals) without a separate spirit. POT and
        // SNAKE aren't in BOMB_PRESERVED_SUBTYPES, so both tags are stripped below.
        if (subs.includes(TileSubtype.POT) && subs.includes(TileSubtype.SNAKE)) {
          trackEnemyKill(stats, "snake", state.currentFloor ?? 1);
          stats.damageDealt = stats.damageDealt + SNAKE_POT_KILL_DAMAGE;
          snakePotKills += 1;
        }

        // Strip everything destructible; keep preserved/cosmetic markers; scorch the tile.
        const kept = subs.filter((s) => BOMB_PRESERVED_SUBTYPES.has(s));
        // A WALL_TORCH is preserved through a blast only while its wall still stands.
        // Once the wall is blown to floor, the mounted torch must go with it — otherwise
        // it lingers as a floor torch that still blocks movement like a wall.
        if (openedWall) {
          const torchIdx = kept.indexOf(TileSubtype.WALL_TORCH);
          if (torchIdx !== -1) kept.splice(torchIdx, 1);
        }
        // A blast breaks a cracked (faulty) floor open into an abyss, and leaves an
        // already-open abyss open. You can't scorch or fill a hole, so an abyss tile
        // takes OPEN_ABYSS instead of SINGED. (Walls never carry these subtypes, so
        // this can't collide with openedWall.)
        const becomesAbyss =
          subs.includes(TileSubtype.FAULTY_FLOOR) ||
          subs.includes(TileSubtype.OPEN_ABYSS);
        if (becomesAbyss) {
          if (!kept.includes(TileSubtype.OPEN_ABYSS)) kept.push(TileSubtype.OPEN_ABYSS);
        } else if (!kept.includes(TileSubtype.SINGED)) {
          kept.push(TileSubtype.SINGED);
        }
        if (openedWall) {
          const onPerimeter =
            y === 0 || y === height - 1 || x === 0 || x === width - 1;
          if (onPerimeter && !kept.includes(TileSubtype.BREACH)) {
            kept.push(TileSubtype.BREACH);
          }
        }
        newMapData.subtypes[y][x] = kept;
      }
    }
  }

  stats.enemiesDefeated = stats.enemiesDefeated + enemiesDefeated + snakePotKills;
  stats.wallsDestroyed = (stats.wallsDestroyed ?? 0) + wallsDestroyed;
  stats.treesDestroyed = (stats.treesDestroyed ?? 0) + treesDestroyed;

  let heroHealth = state.heroHealth;
  let bonusHearts = state.bonusHearts;
  let deathCause = state.deathCause;
  if (playerHit) {
    const applied = state.hasShield
      ? BOMB_PLAYER_DAMAGE_SHIELD
      : BOMB_PLAYER_DAMAGE;
    // Pink bonus hearts soak the blast before real health.
    const absorbed = absorbBonusHearts(bonusHearts, applied);
    bonusHearts = absorbed.bonusHearts;
    heroHealth = Math.max(0, heroHealth - absorbed.toHealth);
    stats.damageTaken = stats.damageTaken + applied;
    if (state.mode === "tutorial" && heroHealth < 1) heroHealth = 1;
    if (heroHealth === 0) deathCause = { type: "bomb" };
  }

  let nextState: GameState = {
    ...state,
    mapData: newMapData,
    enemies,
    defeatedEnemies,
    stats,
    heroHealth,
    bonusHearts,
    deathCause,
    recentBombBlasts: blastCenters,
  };

  // Process story events for ONLY the enemies this blast defeated (no-op outside story
  // mode). Guard against slice(-0), which would return the whole accumulated array.
  const freshlyDefeated =
    enemiesDefeated > 0 ? defeatedEnemies.slice(-enemiesDefeated) : [];
  for (const info of freshlyDefeated) {
    const updated = processEnemyDefeat(nextState, info);
    nextState = { ...nextState, ...updated };
  }

  return nextState;
}

/**
 * Throw a bomb up to BOMB_THROW_RANGE tiles in the player's facing direction.
 * Unlike a rock it does not break on impact: it comes to rest on the last floor tile
 * before any wall/obstacle/edge (or at max range on open floor) and arms a 1-turn fuse.
 * It detonates on the player's next turn (see detonateLiveBombs).
 */
export function performThrowBomb(gameState: GameState): GameState {
  // Resolve any bomb armed on a previous turn before this throw.
  const state = detonateLiveBombs(gameState);
  if (state.heroHealth <= 0) return state;

  const pos = findPlayerPosition(state.mapData);
  if (!pos) return state;
  const [py, px] = pos;
  const count = state.bombCount ?? 0;
  if (count <= 0) return state;

  // Throwing is a player turn: enemies move first (mirrors rocks/runes).
  const preTickState: GameState = { ...state };
  if (preTickState.enemies && Array.isArray(preTickState.enemies)) {
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
        // Blind enemies standing in the pink mist (consistent with movement turns).
        skipEnemy: mistBlindSkip(preTickState),
      }
    );
    // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
    preTickState.recentEnemyAttacks = result.attackingEnemies;
    if (result.damage > 0) {
      const applied = Math.min(perTurnDamageCap(preTickState), result.damage);
      applyHeroDamage(preTickState, applied);
      preTickState.stats = {
        ...preTickState.stats,
        damageTaken: preTickState.stats.damageTaken + applied,
      };
      // Record the killer (e.g. a pink goblin's ranged laser) so the end screen
      // can show how the hero died instead of a bare "You died".
      recordEnemyDeathCause(preTickState, result.attackingEnemies);
    }
  }

  // A turn elapsed: enemies that stepped onto faulty floor this tick fall into
  // the abyss now, exactly as on a movement turn (see performThrowRock).
  applyEnemyHazardDeaths(preTickState);

  // Direction vector
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

  const newMapData = JSON.parse(JSON.stringify(preTickState.mapData)) as MapData;

  // Walk outward; rest on the last walkable floor tile before a wall/obstacle/edge OR
  // before an enemy — a bomb thrown at an enemy stops on the tile in front of it (it does
  // not pass through), so the enemy is caught in the blast. If a wall/enemy is immediately
  // ahead, the bomb rests at the player's own feet.
  const bombEnemies = preTickState.enemies ?? [];
  let restY = py;
  let restX = px;
  for (let step = 1; step <= BOMB_THROW_RANGE; step++) {
    const ny = py + vy * step;
    const nx = px + vx * step;
    if (!isWithinBounds(preTickState.mapData, ny, nx)) break;
    const tile = newMapData.tiles[ny][nx];
    if (tile !== FLOOR && tile !== FLOWERS) break; // wall/obstacle: stop before it
    if (bombEnemies.some((e) => e.y === ny && e.x === nx)) break; // enemy: stop in front
    restY = ny;
    restX = nx;
  }

  const restSubs = newMapData.subtypes[restY][restX] || [];
  // A bomb that comes to rest on an open abyss drops into the pit and is lost —
  // no fuse is armed and no blast follows (nothing sits on a broken abyss). The
  // bomb is still consumed and counts as thrown.
  if (!restSubs.includes(TileSubtype.OPEN_ABYSS)) {
    const restBase = restSubs.filter((t) => t !== TileSubtype.BOMB_LIVE);
    newMapData.subtypes[restY][restX] = restBase.concat([TileSubtype.BOMB_LIVE]);
  }

  return {
    ...preTickState,
    mapData: newMapData,
    bombCount: count - 1,
    stats: {
      ...preTickState.stats,
      bombsThrown: (preTickState.stats.bombsThrown ?? 0) + 1,
    },
  };
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
  chestKeyCount?: number; // Multi-tier: consumable keys for opening locked chests (separate from universal key)
  floorChestAllocation?: Record<number, { chests: number; keys: number; chestContents: number[] }>; // Multi-tier: pre-computed chest/key distribution across floors
  mode?: 'normal' | 'daily' | 'story' | 'tutorial' | 'endless';
  allowCheckpoints?: boolean;
  /** Tutorial-only: tracks which scripted beats have already fired. */
  tutorialBeats?: Record<string, boolean>;
  currentFloor?: number; // Current floor number for multi-tier daily mode (1-indexed)
  maxFloors?: number; // Maximum number of floors for multi-tier daily mode
  endlessSeed?: number; // Endless mode: per-run seed; floor N generates from (seed + N)
  endlessPlan?: { swordFloor: number; shieldFloor: number; medallionFloor: number }; // Endless mode: which floors carry the guaranteed item chests
  endlessRunId?: string; // Endless mode: server-issued run id for checkpoint attestation
  mapData: MapData;
  showFullMap: boolean; // Whether to show the full map (ignores visibility constraints)
  win: boolean; // Win state when player opens exit and steps onto it
  playerDirection: Direction; // Track the player's facing direction
  enemies?: Enemy[]; // Active enemies on the map
  npcs?: NPC[]; // Friendly or neutral NPCs present in the map
  heroHealth: number; // Player health points for current run
  heroMaxHealth?: number; // Maximum health points (increases when extra heart is collected); defaults to 5
  // Temporary "overheal" pink hearts granted by the pink flaming heart prize. They sit on
  // top of heroHealth/heroMaxHealth, render pink in the HUD, are drained BEFORE real health
  // when the hero takes damage, and are NOT refilled by food/potions. Absent/0 normally.
  bonusHearts?: number;
  heroAttack: number; // Player base attack for current run
  // Optional RNG for combat variance injection in tests; falls back to Math.random
  combatRng?: () => number;
  // Inventory
  rockCount?: number; // Count of collected rocks
  runeCount?: number; // Count of collected runes
  bombCount?: number; // Count of carried bombs (chest pickups grant a 3-pack)
  foodCount?: number; // Count of collected food items
  potionCount?: number; // Count of collected +2 potions
  pinkHeartCount?: number; // Pink flaming heart prizes held (pink realm); use with 'h' or keep as a trophy
  berryCount?: number; // Belted berries held (pink realm); use with 'g' to heal 2-3
  hasSnakeMedallion?: boolean; // Snake medallion for portal travel
  stats: {
    damageDealt: number;
    damageTaken: number;
    enemiesDefeated: number;
    steps: number;
    byKind?: Record<EnemyKind, number>;
    byFloor?: Record<number, Record<EnemyKind, number>>; // Track kills by floor
    // Extended stats for badge system
    rocksThrown?: number;
    rocksCollected?: number;
    bombsThrown?: number;
    wallsDestroyed?: number;
    treesDestroyed?: number;
    runesUsed?: number;
    foodUsed?: number;
    potionsUsed?: number;
    pinkHeartsUsed?: number;
    berriesUsed?: number;
    enemiesKilledBySword?: number;
    enemiesKilledByRock?: number;
    enemiesKilledByRune?: number;
    chestsOpened?: number;
    itemsCollected?: number; // Total items picked up
    maxHealth?: number; // Highest health reached
    poisonSteps?: number; // Steps taken while poisoned
    ghostsVanished?: number; // Ghosts that vanished by getting close
  };
  // Transient: positions where enemies died this tick
  recentDeaths?: Array<[number, number]>;
  // Transient: blast centers where a bomb detonated this tick (UI explosion VFX)
  recentBombBlasts?: Array<[number, number]>;
  // Transient: enemies that dealt damage this tick, with post-move positions
  // and a ranged flag — consumed by the render layer for attack VFX (e.g. the
  // pink goblin's beam). Overwritten on every enemy tick; never persisted.
  recentEnemyAttacks?: EnemyAttackInfo[];
  // Transient: defeated enemies with their memory for onEnemyDefeat processing
  defeatedEnemies?: Array<{
    y: number;
    x: number;
    kind: string;
    // Stable render-layer id (lets the UI animate a specific enemy's death,
    // e.g. sliding into the abyss from its previous tile).
    id?: string;
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
    type: "enemy" | "faulty_floor" | "poison" | "bomb" | "darkness";
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
  // Outside world: set while the player has stepped through a wall breach into the
  // open grassland beyond the dungeon. dungeonReturn holds the snapshot to restore
  // when the player walks back through the breach.
  inOutsideWorld?: boolean;
  outsideDirection?: Direction;
  // Pink realm: set while the player has stepped through a pink goblin's leftover
  // teleport ring. Reuses dungeonReturn for the saved room to come back to.
  inPinkRealm?: boolean;
  // Run-level achievement flag: latches true the first time the player warps into
  // the pink realm and persists for the rest of the run (across returns + floors)
  // so the endgame results can record that the secret area was found.
  reachedPinkRealm?: boolean;
  // Run-level flag: latches true the first time the player breaches an exterior
  // wall and steps into the outdoor grassland. Persists across returns/floors so
  // analytics can record that the hidden outside world was found.
  reachedOutsideWorld?: boolean;
  // Pink realm only: the drifting mist's currently-covered tiles ([y,x] pairs). Grows/
  // shrinks organically each turn. Standing in it reverses the hero's controls; enemies
  // in it are blinded. Undefined / absent outside the realm.
  mist?: Array<[number, number]>;
  dungeonReturn?: {
    mapData: MapData;
    enemies?: PlainEnemy[];
    position: [number, number];
  };
  // Nightmare room: set while the player has bombed through the pink realm's outer wall
  // and stepped into the pitch-black nightmare beyond. realmReturn holds the realm snapshot
  // to restore on the way back (kept separate from dungeonReturn, which still holds the
  // dungeon for the realm's own exit ring — the two stashes nest).
  inNightmare?: boolean;
  realmReturn?: {
    mapData: MapData;
    enemies?: PlainEnemy[];
    position: [number, number];
    mist?: Array<[number, number]>;
  };
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

/**
 * Remove a pink goblin's teleport ring from the map when it is killed by anything OTHER
 * than a bomb (rock, melee, hazard). The clean kill lets the goblin's teleport magic
 * collapse with it — no ring left behind. Restores the ring tile and sweeps any strays.
 */
function cleanupPinkRing(enemy: Enemy, subtypes: number[][][]): void {
  if (enemy.kind !== 'pink-goblin') return;
  const mem = enemy.behaviorMemory as { ringY?: number; ringX?: number; ringOrigSubs?: number[] };
  // Only clear THIS goblin's own ring (at its stored position). No blanket sweep — that
  // would also wipe other goblins' rings and any bomb-dropped portal we mean to keep.
  if (typeof mem.ringY === 'number' && typeof mem.ringX === 'number') {
    const orig = mem.ringOrigSubs ?? [];
    subtypes[mem.ringY][mem.ringX] = orig.length > 0 ? [...orig] : [TileSubtype.NONE];
  }
}

/**
 * A BOMB kill of a pink goblin always leaves a teleport ring behind (stepping on it warps
 * to the pink realm). If the goblin already had a ring out, that one stays; otherwise a
 * fresh ring drops on the tile where it died. (PINK_RING is bomb-preserved so the blast
 * that kills the goblin doesn't immediately strip the dropped ring.)
 */
function dropPinkRingOnDeath(
  enemy: Enemy,
  subtypes: number[][][],
  deathY: number,
  deathX: number
): void {
  if (enemy.kind !== 'pink-goblin') return;
  const mem = enemy.behaviorMemory as { ringY?: number; ringX?: number };
  if (typeof mem.ringY === 'number' && typeof mem.ringX === 'number') {
    return; // a ring is already out — keep it where the goblin placed it
  }
  const s = subtypes[deathY]?.[deathX];
  if (s && !s.includes(TileSubtype.PINK_RING)) {
    s.push(TileSubtype.PINK_RING);
  }
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

    if ((enemy.kind === "stone-goblin" || enemy.kind === "fire-goblin" || enemy.kind === "water-goblin" || enemy.kind === "water-goblin-spear" || enemy.kind === "earth-goblin" || enemy.kind === "earth-goblin-knives") && onFaulty) {
      // Convert faulty floor to open abyss when enemy steps on it
      subtypes[enemy.y][enemy.x] = subtypes[enemy.y][enemy.x].filter(
        (type) => type !== TileSubtype.FAULTY_FLOOR
      );
      subtypes[enemy.y][enemy.x].push(TileSubtype.OPEN_ABYSS);
      
      cleanupPinkRing(enemy, subtypes);
      defeated.push(enemy);

      if (!state.recentDeaths) state.recentDeaths = [];
      state.recentDeaths.push([enemy.y, enemy.x]);

      state.stats.enemiesDefeated += 1;
      trackEnemyKill(state.stats, enemy.kind as EnemyKind, state.currentFloor ?? 1);

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
  assignWhiteGoblinSwarmIds(enemies);

  // After enemies are assigned, place one rune pot per stone-goblin
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
    heroMaxHealth: 5,
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
 * Returns enemy count for a given floor in the 3-level daily mode.
 * Floor 1: 3-5 enemies  |  Floor 2: 7-9 enemies  |  Floor 3: 8-10 enemies
 */
function enemyCountForFloor(floor: number): number {
  if (floor === 1) return 3 + Math.floor(Math.random() * 3); // 3-5
  if (floor === 2) return 7 + Math.floor(Math.random() * 3); // 7-9
  if (floor === 3) return 8 + Math.floor(Math.random() * 3); // 8-10
  return 4 + Math.floor(Math.random() * 4); // Fallback 4-7
}

/**
 * Initialize a new game state for floor 1 of multi-tier daily mode.
 * Computes the chest/key allocation for all floors and generates floor 1's map accordingly.
 */
export function initializeGameStateForMultiTier(floor: number = 1): GameState {
  // Compute the chest/key allocation for all floors (sword/shield on 1–4, medallion on 5–7)
  const allocationMap = allocateChestsAndKeys();

  // Convert Map to plain object for JSON serialization
  const floorChestAllocation: Record<number, { chests: number; keys: number; chestContents: number[] }> = {};
  allocationMap.forEach((val, key) => {
    floorChestAllocation[key] = val;
  });

  const floorAlloc = floorChestAllocation[floor] ?? { chests: 0, keys: 0, chestContents: [] };
  const mapData = generateCompleteMapForFloor(floorAlloc, floor);

  const playerPos = findPlayerPosition(mapData);
  const enemies = playerPos
    ? placeEnemies({
        grid: mapData.tiles,
        player: { y: playerPos[0], x: playerPos[1] },
        count: enemyCountForFloor(floor),
        minDistanceFromPlayer: 8,
      })
    : [];

  const { ghostCount, whiteGoblinCount } = enemyTypeAssignement(enemies, { floor });
  if (ghostCount > 0 && playerPos) {
    const ghosts = placeEnemies({
      grid: mapData.tiles,
      player: { y: playerPos[0], x: playerPos[1] },
      count: ghostCount,
      minDistanceFromPlayer: 6,
    });
    ghosts.forEach(g => { g.kind = 'ghost'; enemies.push(g); });
  }
  if (whiteGoblinCount > 0 && playerPos) {
    // Place swarms at single locations (4 goblins per swarm)
    const swarmCount = Math.floor(whiteGoblinCount / 4);
    const swarmLocations = placeEnemies({
      grid: mapData.tiles,
      player: { y: playerPos[0], x: playerPos[1] },
      count: swarmCount,
      minDistanceFromPlayer: 6,
    });
    
    // Create 4 white goblins at each swarm location
    swarmLocations.forEach(location => {
      for (let i = 0; i < 4; i++) {
        const goblin = new Enemy({ y: location.y, x: location.x });
        goblin.kind = 'white-goblin';
        enemies.push(goblin);
      }
    });
    
    assignWhiteGoblinSwarmIds(enemies);
  }

  const withRunes = addRunePotsForStoneExciters(mapData, enemies);
  const snakesAdded = addSnakesPerRules(withRunes, enemies, { floor });

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    chestKeyCount: 0,
    floorChestAllocation,
    mode: 'daily',
    allowCheckpoints: false,
    currentFloor: floor,
    maxFloors: 3,
    mapData: withRunes,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: snakesAdded,
    npcs: [],
    heroHealth: 5,
    heroMaxHealth: 5,
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
  assignWhiteGoblinSwarmIds(enemies);
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
    heroMaxHealth: 5,
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

  // Get the pre-computed chest/key allocation for this floor
  const allocation = currentState.floorChestAllocation?.[nextFloor];
  
  // Generate new map with floor-specific seed
  const newMapData = withPatchedMathRandom(rng, () => {
    let mapData: MapData;
    if (allocation && (allocation.chests > 0 || allocation.keys > 0)) {
      mapData = generateCompleteMapForFloor(allocation, nextFloor);
    } else {
      // Floors 5+: no chests or keys, just a standard map without chests/keys
      mapData = generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, nextFloor);
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
          count: enemyCountForFloor(nextFloor),
          minDistanceFromPlayer: 8,
        });
        const { ghostCount: gc, whiteGoblinCount: wgc } = enemyTypeAssignement(placed, { floor: nextFloor });
        if (gc > 0) {
          const ghosts = placeEnemies({
            grid: newMapData.tiles,
            player: { y: playerPos[0], x: playerPos[1] },
            count: gc,
            minDistanceFromPlayer: 6,
          });
          ghosts.forEach(g => { g.kind = 'ghost'; placed.push(g); });
        }
        if (wgc > 0) {
          // Place swarms at single locations (4 goblins per swarm)
          const swarmCount = Math.floor(wgc / 4);
          const swarmLocations = placeEnemies({
            grid: newMapData.tiles,
            player: { y: playerPos[0], x: playerPos[1] },
            count: swarmCount,
            minDistanceFromPlayer: 6,
          });
          
          // Create 4 white goblins at each swarm location
          swarmLocations.forEach(location => {
            for (let i = 0; i < 4; i++) {
              const goblin = new Enemy({ y: location.y, x: location.x });
              goblin.kind = 'white-goblin';
              placed.push(goblin);
            }
          });
          
          assignWhiteGoblinSwarmIds(placed);
        }
        // Floor 3 (escape floor): station one static guard next to the exit key so
        // collecting it always requires a fight. Inside this seeded block so the
        // guard position is deterministic per daily seed, like the rest of floor 3.
        if (nextFloor === 3) {
          return addStaticGuardNearKey(newMapData, placed);
        }
        return placed;
      })
    : [];

  // Add rune pots and snakes
  const withRunes = addRunePotsForStoneExciters(newMapData, enemies);
  const snakesAdded = addSnakesPerRules(withRunes, enemies, { floor: nextFloor });

  // Create new game state preserving hero stats and inventory
  return {
    ...currentState,
    currentFloor: nextFloor,
    maxFloors,
    mapData: withRunes,
    enemies: snakesAdded,
    hasExitKey: false, // Reset exit key for new floor
    portalLocation: undefined, // Reset placed portal — no backtracking between floors
    win: false, // Reset win state
    recentDeaths: [],
    recentBombBlasts: [], // don't carry a blast's VFX/shake into the next floor
    defeatedEnemies: [],
    npcInteractionQueue: [],
    bookshelfInteractionQueue: [],
    bedInteractionQueue: [],
    // Preserve: heroHealth, heroMaxHealth, bonusHearts, heroAttack, hasSword, hasShield, hasSnakeMedallion, rockCount, runeCount, foodCount, potionCount, pinkHeartCount, berryCount, stats, etc.
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

/**
 * True when the player stands on a BREACH tile on the matching map edge and is moving
 * off that edge — the trigger for crossing between the dungeon and the outside world.
 */
function isSteppingThroughBreach(
  state: GameState,
  position: [number, number],
  direction: Direction,
  height: number,
  width: number
): boolean {
  const [cy, cx] = position;
  const subs = state.mapData.subtypes?.[cy]?.[cx] ?? [];
  if (!subs.includes(TileSubtype.BREACH)) return false;
  switch (direction) {
    case Direction.UP:
      return cy === 0;
    case Direction.DOWN:
      return cy === height - 1;
    case Direction.LEFT:
      return cx === 0;
    case Direction.RIGHT:
      return cx === width - 1;
    default:
      return false;
  }
}

function placePlayerAt(mapData: MapData, position: [number, number]): MapData {
  const next = JSON.parse(JSON.stringify(mapData)) as MapData;
  const [y, x] = position;
  const cell = (next.subtypes[y][x] || []).filter((t) => t !== TileSubtype.PLAYER);
  cell.push(TileSubtype.PLAYER);
  next.subtypes[y][x] = cell;
  return next;
}

/**
 * Handle a step through a wall breach. From the dungeon this loads a fresh outside-world
 * area for the breached direction and stashes the dungeon to restore later; from the
 * outside world it restores the saved dungeon. Returns null if no crossing applies.
 */
function enterOutsideWorld(
  state: GameState,
  position: [number, number],
  direction: Direction
): GameState | null {
  // In the nightmare: walking back through the inner breach returns to the pink realm
  // (torch relit). Restores from the separate realmReturn stash.
  if (state.inNightmare) {
    const ret = state.realmReturn;
    if (!ret) return null;
    return {
      ...state,
      mapData: placePlayerAt(ret.mapData, ret.position),
      enemies: ret.enemies ? rehydrateEnemies(ret.enemies) : [],
      playerDirection: direction,
      inNightmare: false,
      inPinkRealm: true,
      mist: ret.mist,
      heroTorchLit: true,
      realmReturn: undefined,
      recentDeaths: [],
      recentBombBlasts: [],
    };
  }

  // From the pink realm: breaching the outer wall drops into the nightmare room, not the
  // grassland. The torch is snuffed (pitch black) and the realm is stashed for return.
  if (state.inPinkRealm) {
    const realmHeight = getMapHeight(state.mapData);
    const realmWidth = getMapWidth(state.mapData);
    const { mapData: nightmareMap, entry: nightmareEntry } = buildNightmareRoom(
      direction,
      realmWidth,
      realmHeight
    );
    return {
      ...state,
      mapData: placePlayerAt(nightmareMap, nightmareEntry),
      enemies: [],
      playerDirection: direction,
      inNightmare: true,
      inPinkRealm: false,
      mist: undefined,
      outsideDirection: direction,
      // Keep the torch lit so the flame still shows — the nightmare's darkness is forced
      // by the renderer (inNightmare), which limits the light to the 4 adjacent tiles.
      heroTorchLit: true,
      realmReturn: {
        mapData: removePlayerFromMapData(state.mapData),
        enemies: serializeEnemies(state.enemies),
        position,
        mist: state.mist,
      },
      recentDeaths: [],
      recentBombBlasts: [],
    };
  }

  // Already outside: walking back through the inner breach returns to the dungeon.
  if (state.inOutsideWorld) {
    const ret = state.dungeonReturn;
    if (!ret) return null;
    const restored = placePlayerAt(ret.mapData, ret.position);
    return {
      ...state,
      mapData: restored,
      enemies: ret.enemies ? rehydrateEnemies(ret.enemies) : [],
      playerDirection: direction,
      inOutsideWorld: false,
      outsideDirection: undefined,
      dungeonReturn: undefined,
      recentDeaths: [],
      recentBombBlasts: [],
    };
  }

  // From the dungeon: stash the current floor and load the outside grassland.
  const height = getMapHeight(state.mapData);
  const width = getMapWidth(state.mapData);
  const { mapData: outsideMap, enemies: outsideEnemies, entry } = buildOutsideWorld(
    direction,
    width,
    height
  );
  const dungeonReturn = {
    mapData: removePlayerFromMapData(state.mapData),
    enemies: serializeEnemies(state.enemies),
    position,
  };
  return {
    ...state,
    mapData: placePlayerAt(outsideMap, entry),
    enemies: rehydrateEnemies(outsideEnemies),
    playerDirection: direction,
    inOutsideWorld: true,
    outsideDirection: direction,
    reachedOutsideWorld: true,
    dungeonReturn,
    recentDeaths: [],
    recentBombBlasts: [],
  };
}

/**
 * How deep into the nightmare room the hero stands: the perpendicular distance from the
 * inner (realm-facing) breach edge. The entry tile sits at depth 1; each step deeper in
 * raises the toll. Used to drain the hero — the darkness gets more lethal the further in.
 */
function nightmareDepth(state: GameState): number {
  const pos = findPlayerPosition(state.mapData);
  if (!pos) return 0;
  const [py, px] = pos;
  const H = getMapHeight(state.mapData);
  const W = getMapWidth(state.mapData);
  switch (innerEdgeForDirection(state.outsideDirection ?? Direction.DOWN)) {
    case "top":
      return py;
    case "bottom":
      return H - 1 - py;
    case "left":
      return px;
    case "right":
      return W - 1 - px;
    default:
      return py;
  }
}

/**
 * Health drained per step at a given nightmare depth. Depth 1 (the breach edge) is safe so
 * the hero can peek in and step back out; it then escalates fast, so wandering more than a
 * few tiles in is near-certain death.
 */
function nightmareHazardDamage(depth: number): number {
  return Math.max(0, depth - 1);
}

/** True when a living pink goblin still owns the ring on (y,x) (its active teleport target). */
function pinkRingClaimedByLiving(
  state: GameState,
  y: number,
  x: number
): boolean {
  return (state.enemies ?? []).some((e) => {
    if (e.kind !== "pink-goblin") return false;
    const m = e.behaviorMemory as { ringY?: number; ringX?: number };
    return m?.ringY === y && m?.ringX === x;
  });
}

/**
 * Pink-mist blinding predicate for updateEnemies' skipEnemy: an enemy standing in the
 * mist (only while in the realm) is skipped entirely — it can't move or attack this turn.
 * Shared so every enemy-tick (movement AND throws) blinds consistently.
 */
function mistBlindSkip(
  state: GameState,
  exceptPinkGoblins = false
): (e: Enemy) => boolean {
  return (e: Enemy) =>
    !!state.inPinkRealm &&
    mistContains(state.mist, e.y, e.x) &&
    // Pink goblins are NOT fully blinded on movement ticks — they self-handle the mist
    // (shuffle one tile toward the nearest clear tile, no attack) in their own behavior.
    !(exceptPinkGoblins && e.kind === "pink-goblin");
}

/** Flip a pressed direction — used when the hero stands in the pink mist. */
function reverseDirection(direction: Direction): Direction {
  switch (direction) {
    case Direction.UP:
      return Direction.DOWN;
    case Direction.DOWN:
      return Direction.UP;
    case Direction.LEFT:
      return Direction.RIGHT;
    case Direction.RIGHT:
      return Direction.LEFT;
    default:
      return direction;
  }
}

// Pink-realm population tuning. The realm is a hard gauntlet guarding the heart chest.
const REALM_WHITE_SWARMS = 4; // four sets of white goblins (4 goblins each)
const REALM_WHITE_GOBLIN_HP = 3; // buffed from 1 so a single hero swing can't clear them
const REALM_PINK_NINJAS = 4; // four hit-and-run ninja pink goblins

/**
 * Populate the pink realm: four white-goblin swarms (buffed — tougher and harder-hitting
 * than their dungeon kin) plus four "ninja" pink goblins that slide in, strike, and blink
 * away without ever dropping a teleport ring (the ninja flag flips their registry behavior,
 * so their ring logic can't tangle with the realm's own return ring).
 */
export function buildPinkRealmEnemies(realmMap: MapData, entry: [number, number]): Enemy[] {
  const enemies: Enemy[] = [];

  // White-goblin swarms, buffed for the realm.
  const swarmLocations = placeEnemies({
    grid: realmMap.tiles,
    player: { y: entry[0], x: entry[1] },
    count: REALM_WHITE_SWARMS,
    minDistanceFromPlayer: 6,
  });
  for (const loc of swarmLocations) {
    for (let i = 0; i < 4; i++) {
      const goblin = new Enemy({ y: loc.y, x: loc.x });
      goblin.kind = "white-goblin";
      goblin.health = REALM_WHITE_GOBLIN_HP; // override the kind setter's baseline of 1
      (goblin.behaviorMemory as Record<string, unknown>).realmBuffed = true; // stronger bite
      enemies.push(goblin);
    }
  }
  // Group the whites into 4-member swarms (must run while the array holds only whites).
  assignWhiteGoblinSwarmIds(enemies);

  // Ninja pink goblins, tagged so the registry runs the realm hit-and-run behavior.
  const ninjaLocations = placeEnemies({
    grid: realmMap.tiles,
    player: { y: entry[0], x: entry[1] },
    count: REALM_PINK_NINJAS,
    minDistanceFromPlayer: 5,
  });
  for (const loc of ninjaLocations) {
    const ninja = new Enemy({ y: loc.y, x: loc.x });
    ninja.kind = "pink-goblin";
    (ninja.behaviorMemory as Record<string, unknown>).ninja = true;
    enemies.push(ninja);
  }

  return enemies;
}

/** Step onto a leftover (unclaimed) pink ring -> warp into the pink realm. */
function enterPinkRealm(
  state: GameState,
  ringPos: [number, number],
  direction: Direction
): GameState {
  const [ry, rx] = ringPos;
  const dungeonMap = removePlayerFromMapData(state.mapData);
  // The ring is consumed on entry, so it's gone when the player comes back.
  if (dungeonMap.subtypes[ry]?.[rx]) {
    dungeonMap.subtypes[ry][rx] = dungeonMap.subtypes[ry][rx].filter(
      (t) => t !== TileSubtype.PINK_RING
    );
  }
  const { mapData: realmMap, entry } = buildPinkRealm(state.mapData, ringPos);
  return {
    ...state,
    mapData: placePlayerAt(realmMap, entry),
    enemies: buildPinkRealmEnemies(realmMap, entry),
    playerDirection: direction,
    inPinkRealm: true,
    reachedPinkRealm: true,
    // Keep the entry/return-ring tile clear so the hero's first move isn't reversed
    // before any mist has visibly drifted onto them.
    mist: seedMist(realmMap, Math.random, [entry]),
    dungeonReturn: {
      mapData: dungeonMap,
      enemies: serializeEnemies(state.enemies),
      position: ringPos,
    },
    recentDeaths: [],
    recentBombBlasts: [],
  };
}

/** Step onto the pink realm's return ring -> restore the saved room. */
function returnFromPinkRealm(
  state: GameState,
  direction: Direction
): GameState | null {
  const ret = state.dungeonReturn;
  if (!ret) return null;
  return {
    ...state,
    mapData: placePlayerAt(ret.mapData, ret.position),
    enemies: ret.enemies ? rehydrateEnemies(ret.enemies) : [],
    playerDirection: direction,
    inPinkRealm: false,
    mist: undefined, // the mist belongs to the realm; clear it on the way out
    dungeonReturn: undefined,
    recentDeaths: [],
    recentBombBlasts: [],
  };
}

export function movePlayer(
  gameState: GameState,
  direction: Direction
): GameState {
  // Resolve the move first, then detonate any armed bomb against the player's FINAL
  // position so stepping out of the 3x3 blast keeps the hero safe. (movePlayer never
  // places a bomb, so every BOMB_LIVE present was armed on a previous turn.) Skip
  // detonation on a floor transition — that floor is being replaced.
  const result = movePlayerCore(gameState, direction);
  if (result.needsFloorTransition) return result;
  // Nightmare darkness drains the hero the deeper they wander. Apply only when the hero
  // actually MOVED while staying in the nightmare (not the entry step, the step back out,
  // or bumping a wall).
  if (gameState.inNightmare && result.inNightmare) {
    const before = findPlayerPosition(gameState.mapData);
    const after = findPlayerPosition(result.mapData);
    const moved =
      !!before && !!after && (before[0] !== after[0] || before[1] !== after[1]);
    if (moved) {
      const dmg = nightmareHazardDamage(nightmareDepth(result));
      if (dmg > 0) {
        applyHeroDamage(result, dmg);
        result.stats = {
          ...result.stats,
          damageTaken: (result.stats.damageTaken ?? 0) + dmg,
        };
        if (result.heroHealth <= 0 && !result.deathCause) {
          result.deathCause = { type: "darkness" };
        }
      }
    }
  }
  const detonated = detonateLiveBombs(result);
  // Drift the pink mist one turn as the hero MOVES through the realm — only while already
  // in the realm (not the entry/exit turn) so the freshly-seeded cloud holds for a beat.
  // Standing actions (throwing, using items) blind mist-covered enemies but deliberately
  // don't shift the cloud; the hero stirs it by walking through it.
  if (gameState.inPinkRealm && detonated.inPinkRealm) {
    return { ...detonated, mist: advanceMist(detonated.mist ?? [], detonated.mapData) };
  }
  return detonated;
}

/**
 * Move the player and resolve the turn. Any bomb armed on a previous turn is detonated
 * AFTER the move (see the movePlayer wrapper), so its blast is measured against the
 * player's final position — moving out of the 3x3 keeps you safe.
 */
function movePlayerCore(
  gameState: GameState,
  direction: Direction
): GameState {
  const position = findPlayerPosition(gameState.mapData);
  if (!position) return gameState; // No player found

  const [currentY, currentX] = position;
  let newY = currentY;
  let newX = currentX;

  // Pink-realm mist scrambles the senses: while the hero stands in it, every pressed
  // direction is reversed (up<->down, left<->right). Computed from the pre-move tile,
  // then used for the rest of the turn (movement, the ring/breach checks, facing).
  if (gameState.inPinkRealm && mistContains(gameState.mist, currentY, currentX)) {
    direction = reverseDirection(direction);
  }

  const height = getMapHeight(gameState.mapData);
  const width = getMapWidth(gameState.mapData);

  // Stepping off the map edge from a breach tile leads to the outside world.
  if (isSteppingThroughBreach(gameState, [currentY, currentX], direction, height, width)) {
    const outside = enterOutsideWorld(gameState, [currentY, currentX], direction);
    if (outside) return outside;
  }

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

  // Stepping onto a pink teleport ring warps to / from the pink realm. A ring still owned
  // by a living pink goblin (its active teleport target) is inert; only a leftover ring
  // (the goblin died while it was out) warps.
  {
    const destTile = gameState.mapData.tiles[newY]?.[newX];
    const destSubs = gameState.mapData.subtypes[newY]?.[newX] ?? [];
    if (
      (destTile === FLOOR || destTile === FLOWERS) &&
      destSubs.includes(TileSubtype.PINK_RING)
    ) {
      if (gameState.inPinkRealm) {
        const back = returnFromPinkRealm(gameState, direction);
        if (back) return back;
      } else if (!pinkRingClaimedByLiving(gameState, newY, newX)) {
        return enterPinkRealm(gameState, [newY, newX], direction);
      }
    }
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
        // Pink mist blinds enemies standing in it (no move/attack) — EXCEPT pink goblins,
        // which instead shuffle one tile toward the nearest clear tile (handled in their
        // behavior via the `mist` context below). The realm haze tiles are passed so that
        // behavior can see where the mist is.
        skipEnemy: mistBlindSkip(gameState, true),
        mist: gameState.mist,
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
    // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
    newGameState.recentEnemyAttacks = result.attackingEnemies;
    if (result.damage > 0) {
      const applied = Math.min(perTurnDamageCap(newGameState), result.damage);
      applyHeroDamage(newGameState, applied);
      newGameState.stats.damageTaken += applied;

      // Tutorial guardrail: never let the hero die during the tutorial. They
      // can drop to 1 heart but no further. Removed for the real game once
      // deaths are allowed.
      if (newGameState.mode === "tutorial" && newGameState.heroHealth < 1) {
        newGameState.heroHealth = 1;
      }

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
        // Use attackingEnemies from the result — enemies may have moved after attacking,
        // so searching by adjacency after updateEnemies() would miss the killer.
        const killerEnemy = result.attackingEnemies[0];
        if (killerEnemy) {
          newGameState.deathCause = {
            type: "enemy",
            enemyKind: killerEnemy.kind,
          };
        }
      }
    }

    // After enemies move, apply hazard deaths (stone-goblins falling into faulty floor)
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
      newGameState.stats.ghostsVanished = (newGameState.stats.ghostsVanished ?? 0) + adjacentGhosts.length;
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
        // Remove the pot and snake tag from the tile
        newMapData.subtypes[newY][newX] = subtype.filter(
          (t) => t !== TileSubtype.POT && t !== TileSubtype.SNAKE
        );
        // Spawn a snake enemy at this tile
        if (!newGameState.enemies) newGameState.enemies = [];
        const snake = new Enemy({ y: newY, x: newX });
        snake.kind = 'snake';
        newGameState.enemies.push(snake);

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
        // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
        newGameState.recentEnemyAttacks = result.attackingEnemies;
        // Guarantee at least 1 immediate damage from an ambush
        const dmgNow = Math.max(1, result.damage);
        if (dmgNow > 0) {
          const applied = Math.min(2, dmgNow);
          applyHeroDamage(newGameState, applied);
          newGameState.stats.damageTaken += applied;
        }
        // If the ambush was lethal, mark death cause as enemy snake
        if (newGameState.heroHealth === 0) {
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
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      } else {
        // MED/Potion: always goes to inventory
        newGameState.potionCount = (newGameState.potionCount || 0) + 1;
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      moved = true;
    }

    // If it's a RUNE, pick it up and clear the tile
    if (subtype.includes(TileSubtype.RUNE)) {
      newGameState.runeCount = (newGameState.runeCount || 0) + 1;
      newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      // Remove only the RUNE tag; preserve other overlays like ROAD
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter((t) => t !== TileSubtype.RUNE);
      // debug: rune picked up
    }

    // If it's a FAULTY_FLOOR, trigger the trap
    if (subtype.includes(TileSubtype.FAULTY_FLOOR)) {
      // Convert the faulty floor to open abyss and kill player instantly
      newMapData.subtypes[newY][newX] = [
        TileSubtype.OPEN_ABYSS,
        TileSubtype.PLAYER,
      ];
      newGameState.heroHealth = 0;
      newGameState.deathCause = { type: "faulty_floor" };
      // debug: faulty floor death
    }

    // If it's an OPEN_ABYSS (already triggered faulty floor), player dies
    if (subtype.includes(TileSubtype.OPEN_ABYSS)) {
      newGameState.heroHealth = 0;
      newGameState.deathCause = { type: "faulty_floor" };
      // debug: open abyss death
    }

    // If it's an EXIT (floor overlay)
    if (subtype.includes(TileSubtype.EXIT)) {
      if (!newGameState.hasExitKey) {
        // No exit key: allow movement onto tile but do nothing special
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
        subtype.includes(TileSubtype.SHIELD) ||
        subtype.includes(TileSubtype.SNAKE_MEDALLION) ||
        subtype.includes(TileSubtype.EXTRA_HEART) ||
        subtype.includes(TileSubtype.PINK_HEART) ||
        subtype.includes(TileSubtype.BOMB)) &&
      !subtype.includes(TileSubtype.CHEST)
    ) {
      if (subtype.includes(TileSubtype.BOMB)) {
        newGameState.bombCount = (newGameState.bombCount ?? 0) + BOMB_PACK_SIZE;
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      if (subtype.includes(TileSubtype.SWORD)) {
        newGameState.hasSword = true;
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      if (subtype.includes(TileSubtype.SHIELD)) {
        newGameState.hasShield = true;
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      if (subtype.includes(TileSubtype.SNAKE_MEDALLION)) {
        newGameState.hasSnakeMedallion = true;
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      if (subtype.includes(TileSubtype.EXTRA_HEART)) {
        // Adds a heart to the max AND fully refills health (e.g. 1/5 -> 6/6).
        newGameState.heroMaxHealth = (newGameState.heroMaxHealth ?? 5) + 1;
        newGameState.heroHealth = newGameState.heroMaxHealth;
        newGameState.stats.maxHealth = Math.max(newGameState.stats.maxHealth ?? 0, newGameState.heroHealth);
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      if (subtype.includes(TileSubtype.PINK_HEART)) {
        // The pink flaming heart prize, revealed from its locked realm chest.
        newGameState.pinkHeartCount = (newGameState.pinkHeartCount ?? 0) + 1;
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      // Clearing of item happens below when we set dest tile subtypes
    }

    // If it's a ROCK, pick it up (increment inventory) and clear the tile
    if (subtype.includes(TileSubtype.ROCK)) {
      newGameState.rockCount = (newGameState.rockCount || 0) + 1;
      newGameState.stats.rocksCollected = (newGameState.stats.rocksCollected ?? 0) + 1;
      newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      // Remove only the ROCK tag; preserve other overlays like ROAD
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter((t) => t !== TileSubtype.ROCK);
      // debug: rock picked up
    }

    // Belted berries are scattered loose on the realm floor: pick up on entry and clear the
    // tag (a ground pickup, like a rock). The pink heart is NOT here — it lives inside a
    // locked chest and is granted by the chest-reveal block above once the chest is opened.
    if (subtype.includes(TileSubtype.BERRY)) {
      newGameState.berryCount = (newGameState.berryCount || 0) + 1;
      newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter((t) => t !== TileSubtype.BERRY);
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
        // Weighted variance: 20% chance -1, 40% chance 0, 40% chance +1
        const variance = rng
          ? ((r) => (r < 0.20 ? -1 : r < 0.60 ? 0 : 1))(rng())
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

        // Flame transfer: striking a torch-carrying enemy at melee range relights
        // the hero's snuffed torch, same as brushing a wall torch. Applies whether
        // the blow kills or not — the flame is caught in the exchange.
        if (!newGameState.heroTorchLit && EnemyRegistry[enemy.kind]?.carriesTorch) {
          newGameState.heroTorchLit = true;
        }

        if (enemy.health <= 0) {
          // Clean up pink ring if a pink goblin dies
          cleanupPinkRing(enemy, newGameState.mapData.subtypes);
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
          newGameState.stats.enemiesKilledBySword = (newGameState.stats.enemiesKilledBySword ?? 0) + 1;
          // Track per-kind kill for melee
          trackEnemyKill(newGameState.stats, enemy.kind as EnemyKind, newGameState.currentFloor ?? 1);
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
      const isMultiTier = newGameState.maxFloors && newGameState.maxFloors > 1;
      if (isMultiTier) {
        // Multi-tier mode: keys are consumable, increment count
        newGameState.chestKeyCount = (newGameState.chestKeyCount ?? 0) + 1;
      } else {
        // Universal generic key: once picked up, always available for generic locks
        newGameState.hasKey = true;
      }
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
      const isMultiTier = newGameState.maxFloors && newGameState.maxFloors > 1;
      const hasChestKey = isMultiTier
        ? (newGameState.chestKeyCount ?? 0) > 0
        : newGameState.hasKey;

      // If locked and no key: allow stepping onto the chest tile, but do NOT open.
      if (isLocked && !hasChestKey) {
        // Fall through to normal movement logic below. The coexist rules will
        // allow PLAYER to share the tile with CHEST+LOCK, leaving it closed.
      } else {
        // Remove LOCK if present; consume key in multi-tier mode
        if (isLocked && hasChestKey) {
          newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][
            newX
          ].filter((t) => t !== TileSubtype.LOCK);
          if (isMultiTier) {
            newGameState.chestKeyCount = (newGameState.chestKeyCount ?? 1) - 1;
          } else if (newGameState.mode === "tutorial") {
            // Tutorial mirrors the daily-challenge "one key per chest" rule
            // by consuming the universal hasKey flag on unlock. Story/other
            // legacy modes deliberately keep the don't-consume behavior they
            // rely on.
            newGameState.hasKey = false;
          }
          // In legacy non-tutorial mode, universal key is not consumed
        }

        // Open the chest in place, but DO NOT grant item yet and DO NOT move the player
        // Keep the item (SWORD/SHIELD/SNAKE_MEDALLION) visible on top of the opened chest
        // Remove only the CHEST marker, leave item subtype as-is
        newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][
          newX
        ].filter((t) => t !== TileSubtype.CHEST);
        if (!newMapData.subtypes[newY][newX].includes(TileSubtype.OPEN_CHEST)) {
          newMapData.subtypes[newY][newX].push(TileSubtype.OPEN_CHEST);
        }
        // Track chest opening
        newGameState.stats.chestsOpened = (newGameState.stats.chestsOpened ?? 0) + 1;
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
      destSubtypes.includes(TileSubtype.ROAD_ROTATE_270) ||
      destSubtypes.includes(TileSubtype.EXIT) ||
      // Bomb scorch + outer-wall breaches are floor overlays the player stands on.
      destSubtypes.includes(TileSubtype.SINGED) ||
      destSubtypes.includes(TileSubtype.BREACH) ||
      destSubtypes.includes(TileSubtype.OPEN_ABYSS)
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
        (t === TileSubtype.SWORD || t === TileSubtype.SHIELD || t === TileSubtype.SNAKE_MEDALLION || t === TileSubtype.EXTRA_HEART || t === TileSubtype.BOMB || t === TileSubtype.PINK_HEART) &&
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
    // Track steps taken while poisoned
    newGameState.stats.poisonSteps = (newGameState.stats.poisonSteps ?? 0) + 1;
    if (poison.stepsSinceLastDamage >= poison.stepInterval) {
      // Apply poison damage
      const poisonDamage = poison.damagePerInterval;
      applyHeroDamage(newGameState, poisonDamage);
      newGameState.stats.damageTaken += poisonDamage;
      poison.stepsSinceLastDamage = 0;
      
      // Set death cause if poison kills the player
      if (newGameState.heroHealth === 0) {
        newGameState.deathCause = {
          type: "poison",
          enemyKind: "snake",
        };
      }
    }
  }

  if (newGameState.mode === "tutorial") {
    newGameState = applyTutorialDirector(newGameState, { y: newY, x: newX });
  }

  return newGameState;
}
