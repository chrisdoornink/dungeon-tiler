import {
  Enemy,
  placeEnemies,
  updateEnemies,
  rehydrateEnemies,
  enemyAttackVariance,
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
import type {
  GateGroup,
  MapData,
  Platform,
  PotOverrides,
  RoomSnapshot,
  RoomTransition,
  SealPayloads,
  ToggleGroup,
  ColorLock,
} from "./types";
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
import { recordRewindStep, type RewindSnapshot } from "./rewind";
import {
  advanceWispTurn,
  stampWispPots,
  WISP_STANDARD_CONFIG,
  type WildWisp,
  type WispConfig,
} from "./wisp";
import { computeTorchGlow } from "../torch_glow";
import { addRunePotsForStoneExciters, generateCompleteMap, generateCompleteMapForFloor, allocateChestsAndKeys, rollWaterPlan } from "./map-features";
import { stampColorSwitchLock } from "./color_switch_puzzle";
import { addSnakesPerRules, addStaticGuardNearKey } from "./enemy-features";
import {
  advanceMachinery,
  throwToggle,
  turnColorSwitch,
  isColorSwitch,
  tileIsPlatformed,
} from "./machinery";
import {
  maybePlaceSwitchGate,
  occupiedTiles,
  type DailySwitchGate,
} from "./switch-gates";
import { buildOutsideWorld, buildNightmareRoom, innerEdgeForDirection } from "./outside-world";
import { buildPinkRealm } from "./pink-realm";
import { buildShaperArena, type ShaperEntry } from "../bosses/shaper_arena";
import { collapseFisherIntoBridge, buildFisherArena } from "../bosses/fisher_arena";
import { buildCoilwyrmArena } from "../bosses/coilwyrm_arena";
import {
  buildQuarrymasterArena,
  QUARRYMASTER_LAYOUTS,
} from "../bosses/quarrymaster_arena";
import {
  BOSS_KINDS,
  rollDailyBossKind,
  type BossKind,
} from "../bosses/boss_roster";
/**
 * Salt for the boss-kind roll's independent RNG stream. Any fixed value works; it exists
 * only to decorrelate this roll from the floor's own sequence (see the roll site).
 */
const BOSS_KIND_SEED_SALT = 0x5f1e_a17b;
/**
 * Salt for the boss-entrance FALLBACK stream. When the day's rolled entrance kind has no
 * legal spot on this particular floor 3, a different kind is placed instead (so a boss day
 * never silently loses its door) — and that retry's randomness is drawn from this separate
 * salted stream so it consumes NOTHING from the floor's own sequence, keeping enemy/snake/
 * decoy placement and /stats replay of every successfully-placed day byte-identical.
 */
const BOSS_ENTRANCE_FALLBACK_SEED_SALT = 0xb529_7a4d;
/**
 * Salt + roll rate for the floor-2 colour-switch puzzle's independent RNG stream. Same discipline as
 * BOSS_KIND_SEED_SALT: a separate salted stream so placing the puzzle consumes NOTHING from the
 * floor's own sequence, leaving enemy/rune/snake placement byte-identical and /stats reconstruction
 * of past days untouched.
 */
const COLOR_PUZZLE_SEED_SALT = 0x9e37_79b1;
const COLOR_PUZZLE_CHANCE = 0.2; // rolls ~20% of floor-2 days; nets ~15-20% (rare while the feature is vetted)
// Floor 1 gets a rarer, smaller variant (3 switches). Its builder never receives the daily seed, so
// the puzzle stream is seeded from the day's generated map instead — see the stamp in
// initializeGameStateForMultiTier. A distinct salt keeps it uncorrelated with the floor-2 stream.
const COLOR_PUZZLE_FLOOR1_SEED_SALT = 0x85eb_ca6b;
const COLOR_PUZZLE_FLOOR1_CHANCE = 0.07; // rolls ~7%, nets ~5% of floor-1 days (an occasional early twist)
import {
  rollBossEntranceKind,
  rollDecoySealCount,
  sealCoords,
  stampBossEntranceWithFallback,
  stampDecoySeals,
  arenaSeedForEntrance,
  type BossEntranceKind,
} from "../bosses/boss_entrances";
import { seedMist, advanceMist, mistContains } from "./pink-mist";
import { mulberry32 as mulberry32Fn, withPatchedMathRandom, hashStringToSeed } from "../rng";
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
  // A pot carrying its contents in the tile (`[POT, MED]`) — see the matching branch in
  // the walk-in path. Shattering it from range must reveal the same thing walking into it
  // would, so this has to sit ahead of the reveal roll below.
  if (subs.includes(TileSubtype.MED) || subs.includes(TileSubtype.FOOD)) {
    mapData.subtypes[y][x] = subs.filter((s) => s !== TileSubtype.POT);
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

/** Drop an empty seal-payload map to undefined, so state stays clean when nothing rolled. */
function orUndefined(payloads: SealPayloads): SealPayloads | undefined {
  return Object.keys(payloads).length > 0 ? payloads : undefined;
}

/**
 * END OF TURN. Called once by every turn-consuming action, AFTER the player's action has fully
 * resolved — which is what makes it the right and only place to advance puzzle machinery.
 *
 * Ordering is the whole point and it was wrong once: machinery used to advance alongside enemy
 * movement, which happens BEFORE the player acts. A platform would therefore slide away in the
 * same turn the player stepped toward it, so boarding a slab you could plainly see put the hero
 * in the lava it had just left. Enemies act first, the player acts, then the world moves.
 *
 * `amount` only scales the step counter; machinery advances once per turn regardless, because a
 * turn is a turn no matter how many steps it is booked as.
 */
function endTurn(state: GameState, amount: number = 1): void {
  if (amount > 0) {
    const currentStats = state.stats;
    state.stats = { ...currentStats, steps: currentStats.steps + amount };
  }
  // Pass the live enemies so a deck both stalls at any it would run over AND carries the rideable
  // ones standing on it (they board by pathing onto the deck; see isSafeFloorForEnemy). Mutated in
  // place when carried, so this must be the real enemy array, not a copy.
  advanceMachinery(state, findPlayerPosition(state.mapData), state.enemies);
}

/**
 * End a turn for an action that only SHALLOW-copied state — performWait and the four consumables
 * (food/potion/pink-heart/berry). advanceMachinery rewrites deck tiles and the rider's PLAYER tag
 * in `mapData` in place, so on a platform map that would corrupt the committed previous React
 * state's shared map. Clone it first — but only when there is machinery to advance, so the
 * daily/endless/boss (no platforms) never pay a full map clone on every potion. Movement needs no
 * wrapper: movePlayerCore already deep-copies its map, and advanceMachinery copies the platforms
 * array itself.
 */
function endShallowCopyTurn(state: GameState): void {
  if (state.platforms && state.platforms.length > 0) {
    state.mapData = cloneMapData(state.mapData);
  }
  endTurn(state);
}

/**
 * Advance moving platforms on a throw turn (rock/rune/bomb).
 *
 * A throw consumes a turn — enemies act inside the *Core — so the world must tick too, or a raft
 * freezes on the turn you throw. Called from the three throw wrappers on the resolved state, AFTER
 * resolveBossDefeat, so a rock that flipped a toggle advances the platform it just started or
 * stopped — the same order movePlayer uses (act, then advance the world).
 *
 * Gated on whether a throw actually happened. Each *Core returns early — without consuming a turn —
 * when the hero is dead, has no position, or holds no ammo; advancing machinery on those returns
 * would slide platforms for free (mash "throw" with an empty pouch to ferry across). We re-check
 * those guards against the INPUT rather than reading the result, because the result's ammo count is
 * not a reliable "did a turn happen" signal: throwing a rock at a stone-goblin while holding a rune
 * spends the rune, not the rock. endTurn(result, 0) advances the world WITHOUT ticking the step
 * counter — throws have never counted as steps, and daily scoring must not change.
 *
 * The cores already deep-copy mapData, so advanceMachinery mutates that fresh copy; and off a
 * platform map advanceMachinery is a no-op, so this is inert everywhere machinery does not exist.
 */
function advanceThrowMachinery(input: GameState, result: GameState, ammo: number): void {
  const acted = input.heroHealth > 0 && ammo > 0 && !!findPlayerPosition(input.mapData);
  if (acted) endTurn(result, 0);
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
// What walking into a bed of SPIKES costs. The move is always refused (spikes are a
// hard barrier — see the SPIKES branch in the movement handler), so this is purely the
// penalty for probing the wall: enough to punish mashing into it, small enough that a
// mis-tap isn't a run-ender.
export const SPIKES_BUMP_DAMAGE = 1;

const PINK_REALM_DAMAGE_CAP = 6;
function perTurnDamageCap(state: { inPinkRealm?: boolean }): number {
  return state.inPinkRealm ? PINK_REALM_DAMAGE_CAP : 4;
}

// --- Melee-exchange risk (anti-kite balance) --------------------------------
// Two moves used to be entirely risk-free, which let a patient player melee down
// even a stone goblin with zero danger (step away, step back, repeat):
//
//   1. Retreating from an adjacent enemy. The enemy's attack was fully cancelled
//      whenever the hero stepped off (see the `suppress` hook in movePlayerCore).
//   2. Closing a one-tile gap and striking. The enemy spent its turn walking into
//      the gap (no attack), then the hero's move resolved as a free melee hit.
//
// Both now carry a chance the enemy still lands its blow, restoring a risk gradient:
// standing toe-to-toe (attack an already-adjacent enemy) is the riskiest — the enemy
// always gets its swing; closing in to strike is a bit safer; retreating is the safest
// but no longer free. Rolled against the run's combat RNG (Math.random in real play, so
// daily-seed reconstruction is unaffected — combat variance is already non-deterministic).
const RETREAT_PARTING_HIT_CHANCE = 0.4;
const CLOSE_IN_COUNTER_CHANCE = 0.6;

// Damage a single enemy's contact hit lands right now, using the same variance model as
// the enemy turn (see enemyAttackVariance) and subtracting the hero's shield defense.
function enemyContactDamage(
  enemy: Enemy,
  rng: () => number,
  defense: number
): number {
  return Math.max(0, enemy.attack + enemyAttackVariance(enemy.kind, rng()) - defense);
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

/**
 * Pass a turn without acting.
 *
 * REQUIRED BY MOVING PLATFORMS, not a convenience. A platform advances once per turn and the
 * hero has to be standing on it to be carried — with no way to spend a turn in place there is
 * literally no way to ride one. Before this existed the only way to burn a turn was to walk into
 * a wall, which works (enemies have already acted by then) but is undiscoverable and reads as a
 * bug rather than a move.
 *
 * Deliberately costs everything a real turn costs: enemies act, hazards reap, machinery
 * advances, the step counter ticks. Waiting next to a goblin is a decision, not a free skip.
 */
export function performWait(gameState: GameState): GameState {
  // The pre-wait world for the Amber Moth ring buffer, captured before anything mutates. A wait is
  // a genuine turn (enemies act, the world ticks, the step counter advances), so it records a
  // rewind snapshot exactly as a move does — otherwise "N steps ago" silently skips the waits
  // between moves. recordRewindStep gates on the step count going up, which a wait does.
  const before = gameState;
  gameState = detonateLiveBombs(gameState);
  if (gameState.heroHealth <= 0) return gameState;

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
      preTickState.recentEnemyAttacks = result.attackingEnemies;
      if (result.damage > 0) {
        const applied = Math.max(0, result.damage - (preTickState.hasShield ? 1 : 0));
        applyHeroDamage(preTickState, applied);
        preTickState.stats.damageTaken += applied;
        recordEnemyDeathCause(preTickState, result.attackingEnemies);
      }
    }
  }

  onTurnElapsed(preTickState);

  const newGameState = { ...preTickState };
  endShallowCopyTurn(newGameState);
  return withRewindStep(before, newGameState);
}

/**
 * Using an item spends a turn, and a turn inside a boss arena can kill the boss without the
 * player swinging at anything: a bomb's fuse runs out (detonateLiveBombs, below), or a coil
 * length cut off last turn is reaped by applyEnemyHazardDeaths. Both used to land here with no
 * payout attached, so the kill paid nothing — see ensureBossArenaSolvable for what that cost.
 * Wrapped like performThrowRock rather than hooked, for the same reason: many exits.
 */
export function performUseFood(gameState: GameState): GameState {
  const bossesBefore = snapshotBosses(gameState);
  const result = performUseFoodCore(gameState);
  resolveBossDefeat(result, bossesBefore);
  return result;
}

function performUseFoodCore(gameState: GameState): GameState {
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
  onTurnElapsed(preTickState);

  // Use the food: heal 1 HP (capped at heroMaxHealth) and consume 1 food
  const newGameState = { ...preTickState };
  newGameState.heroHealth = Math.min(newGameState.heroMaxHealth ?? 5, newGameState.heroHealth + 1);
  newGameState.foodCount = count - 1;
  newGameState.stats = {
    ...newGameState.stats,
    foodUsed: (newGameState.stats.foodUsed ?? 0) + 1,
    maxHealth: Math.max(newGameState.stats.maxHealth ?? 0, newGameState.heroHealth),
  };
  endShallowCopyTurn(newGameState);

  // debug: used food
  
  return newGameState;
}

/**
 * Use potion from inventory to heal 2 HP (costs a move like throwing rocks/runes)
 */
export function performUsePotion(gameState: GameState): GameState {
  const bossesBefore = snapshotBosses(gameState);
  const result = performUsePotionCore(gameState);
  resolveBossDefeat(result, bossesBefore);
  return result;
}

function performUsePotionCore(gameState: GameState): GameState {
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
  onTurnElapsed(preTickState);

  // Use the potion: heal 2 HP (capped at heroMaxHealth) and consume 1 potion
  const newGameState = { ...preTickState };
  newGameState.heroHealth = Math.min(newGameState.heroMaxHealth ?? 5, newGameState.heroHealth + 2);
  newGameState.potionCount = count - 1;
  newGameState.stats = {
    ...newGameState.stats,
    potionsUsed: (newGameState.stats.potionsUsed ?? 0) + 1,
    maxHealth: Math.max(newGameState.stats.maxHealth ?? 0, newGameState.heroHealth),
  };
  endShallowCopyTurn(newGameState);

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
  const bossesBefore = snapshotBosses(gameState);
  const result = performUsePinkHeartCore(gameState);
  resolveBossDefeat(result, bossesBefore);
  return result;
}

function performUsePinkHeartCore(gameState: GameState): GameState {
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
  onTurnElapsed(preTickState);

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
  endShallowCopyTurn(newGameState);

  return newGameState;
}

/**
 * Use a belted berry (keyboard 'g'): heal a variable 3-4 hearts (clamped to max health).
 * Consumes one berry and costs a turn (enemies act first, like a potion). Does nothing if
 * none are held.
 */
export function performUseBerry(gameState: GameState): GameState {
  const bossesBefore = snapshotBosses(gameState);
  const result = performUseBerryCore(gameState);
  resolveBossDefeat(result, bossesBefore);
  return result;
}

function performUseBerryCore(gameState: GameState): GameState {
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
  onTurnElapsed(preTickState);

  // Consume the berry: heal a variable 3-4 hearts (capped at heroMaxHealth). The split is
  // deterministic on the hero's facing direction rather than a coin flip — vertical facing
  // (UP/DOWN) heals 3, horizontal facing (LEFT/RIGHT) heals 4. Four directions split evenly.
  const facingHorizontal =
    preTickState.playerDirection === Direction.LEFT || preTickState.playerDirection === Direction.RIGHT;
  const heal = facingHorizontal ? 4 : 3;
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
  endShallowCopyTurn(newGameState);

  return newGameState;
}

/**
 * Throw a rock, then settle any boss that died to it. The Fisher can ONLY be killed at
 * range, so its death payout has to hang off this path as well as movePlayer's — and
 * performThrowRockCore returns from a dozen places, so it's wrapped rather than hooked.
 */
export function performThrowRock(gameState: GameState): GameState {
  const bossesBefore = snapshotBosses(gameState);
  const result = performThrowRockCore(gameState);
  resolveBossDefeat(result, bossesBefore);
  // Advance the puzzle machinery (platforms/toggles) for the throw-turn...
  advanceThrowMachinery(gameState, result, gameState.rockCount ?? 0);
  // ...and route it through the wisp hook too: a thrown rock can smash a [POT, WISP] pot (or kill an
  // enemy that drops a wisp). advanceWispTurn is otherwise wired only into movePlayer, so without
  // this a rock-smashed wisp pot silently releases nothing. No hero step this turn, so its drift/pity
  // legs are inert; only smashed-pot + enemy-death release fire. Dormant (no wispConfig) => no-op.
  return advanceWispTurn(gameState, result);
}

/**
 * Throw a rock up to 4 tiles in the player's facing direction.
 * Minimal slice: if inventory has a rock and there is a clear 4-tile floor path,
 * land a ROCK on the 4th tile and decrement rockCount. No collisions/effects yet.
 */
/**
 * Damage a thrown thing actually lands on this enemy. Ordinary kinds take the flat
 * base (rock 2, bomb 8, rune = lethal); a kind with a `calcThrownDamage` gate can
 * refuse it per part, which is what keeps a rune or bomb from deleting an interior
 * Coilwyrm segment and desyncing its follow-the-leader chain.
 */
function thrownDamageTo(
  target: Enemy,
  source: "rock" | "rune" | "bomb",
  base: number,
  enemies: Enemy[] | undefined
): number {
  const gate = EnemyRegistry[target.kind]?.calcThrownDamage;
  if (!gate) return base;
  return Math.max(
    0,
    gate({ source, base, memory: target.behaviorMemory, enemies })
  );
}

export function performThrowRockCore(gameState: GameState): GameState {
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
        // Consult the per-kind gate, not the flat 2: an immune part (a Coilwyrm body
        // segment) must NOT be frozen for the tick, or the coil would break step.
        const rockDamage = thrownDamageTo(target, "rock", 2, enemiesNow);
        // Chained movers (Coilwyrm segments) are never frozen: holding one link out of a
        // turn leaves everything behind it standing still and tears the body apart. They
        // forfeit the cosmetic "dies on the tile it was drawn on" guarantee instead.
        if (
          ((rockDamage > 0 && targetHp <= rockDamage) || runeWillKill) &&
          !EnemyRegistry[target.kind]?.movesInLockstep
        ) {
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
  onTurnElapsed(preTickState);

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
      const rockDamage = thrownDamageTo(target, "rock", 2, newEnemies); // usually 2
      const newHealth = prevHealth - rockDamage;
      if (rockDamage <= 0) {
        // Bounced off an immune part (Coilwyrm body): the rock is spent, nothing else
        // changes. Falls through to the same "survived" shape below with 0 damage.
        return {
          ...preTickState,
          enemies: newEnemies,
          stats: {
            ...preTickState.stats,
            rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
          },
          rockCount: count - 1,
        };
      }
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
          damageDealt: preTickState.stats.damageDealt + Math.min(rockDamage, prevHealth),
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
            damageDealt: preTickState.stats.damageDealt + rockDamage,
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
    // A rock thrown into lava MELTS into the first lava tile it touches, cooling it
    // into walkable OBSIDIAN — the rock is spent on contact and the throw stops here.
    // Water is different (deliberately not a mirror of lava): rocks sail OVER both
    // water tiers mid-flight and only become a STEPPING_STONE if they come to rest
    // on a deep tile at the end of their range — see the landing block below.
    {
      const terrainSubs = newMapData.subtypes[ty][tx] || [];
      if (terrainSubs.includes(TileSubtype.LAVA)) {
        newMapData.subtypes[ty][tx] = terrainSubs
          .filter((t) => t !== TileSubtype.LAVA)
          .concat([TileSubtype.OBSIDIAN]);
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
    }
    // A rock landing on an unthrown floor switch HOLDS IT DOWN and is spent doing so. The
    // throw stops here rather than flying on, which is the whole point: rocks otherwise
    // travel their full range, so a switch three tiles away would be sailed straight over
    // and land behind it. Stopping on the plate is what turns "a switch across a crack" from
    // scenery into a puzzle you can actually solve.
    //
    // Only an UNTHROWN plate stops a rock — a pressed one is spent, so the rock sails over it
    // like any other floor decal.
    {
      const plateSubs = newMapData.subtypes[ty][tx] || [];
      if (plateSubs.includes(TileSubtype.PRESSURE_PLATE)) {
        const wiring: { gateGroups?: GateGroup[]; switchGate?: DailySwitchGate } = {
          gateGroups: preTickState.gateGroups,
          switchGate: preTickState.switchGate,
        };
        pressPlate(wiring, newMapData, ty, tx, "rock");
        return {
          ...preTickState,
          mapData: newMapData,
          gateGroups: wiring.gateGroups,
          switchGate: wiring.switchGate,
          rockCount: count - 1,
          stats: {
            ...preTickState.stats,
            rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
          },
        };
      }
    }
    // A rock landing on a TOGGLE_SWITCH throws it, for the same reason it throws a latching
    // plate: the switch may be somewhere the hero cannot stand. Unlike a plate this can be done
    // repeatedly, so a toggle across a lava channel is a switch you operate entirely by rock. A
    // colour switch across the channel is turned by rock the same way (dispatch on which owns it).
    {
      const toggleSubs = newMapData.subtypes[ty][tx] || [];
      if (toggleSubs.includes(TileSubtype.TOGGLE_SWITCH)) {
        const wiring: {
          mapData: MapData;
          toggleGroups?: ToggleGroup[];
          colorLocks?: ColorLock[];
          platforms?: Platform[];
        } = {
          mapData: newMapData,
          toggleGroups: preTickState.toggleGroups,
          colorLocks: preTickState.colorLocks,
          platforms: preTickState.platforms,
        };
        const occ = new Set((preTickState.enemies ?? []).map((e) => `${e.y},${e.x}`));
        const { crushed } = isColorSwitch(wiring, ty, tx)
          ? turnColorSwitch(wiring, ty, tx, occ)
          : throwToggle(wiring, ty, tx, occ);
        const after: GameState = {
          ...preTickState,
          mapData: newMapData,
          toggleGroups: wiring.toggleGroups,
          colorLocks: wiring.colorLocks,
          platforms: wiring.platforms,
          rockCount: count - 1,
          stats: {
            ...preTickState.stats,
            rocksThrown: (preTickState.stats.rocksThrown ?? 0) + 1,
          },
        };
        killEnemiesAt(after, crushed);
        return after;
      }
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
  // A rock that comes to rest on DEEP water sinks just below the surface and
  // becomes a STEPPING_STONE: a dry crossing exactly where the throw ended.
  // (Only the landing tile converts — mid-flight deep tiles are flown over, so
  // building a bridge means aiming each throw, not machine-gunning the near edge.)
  {
    const landing = newMapData.subtypes[ty][tx] || [];
    if (landing.includes(TileSubtype.DEEP_WATER)) {
      newMapData.subtypes[ty][tx] = landing
        .filter((t) => t !== TileSubtype.DEEP_WATER)
        .concat([TileSubtype.STEPPING_STONE]);
    } else if (!landing.includes(TileSubtype.OPEN_ABYSS)) {
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
/**
 * Throw a rune, then settle any boss that died to it. Same reason as the rock wrapper: the
 * payout used to hang off movePlayer only, so a thrown finisher left the arena with no exit key.
 * Wrapped rather than hooked, because the core returns from a dozen places.
 */
export function performThrowRune(gameState: GameState): GameState {
  const bossesBefore = snapshotBosses(gameState);
  const result = performThrowRuneCore(gameState);
  resolveBossDefeat(result, bossesBefore);
  advanceThrowMachinery(gameState, result, gameState.runeCount ?? 0);
  return result;
}

function performThrowRuneCore(gameState: GameState): GameState {
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
  onTurnElapsed(preTickState);

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
      // Runes instantly kill ALL enemies — unless the kind gates thrown damage per
      // part. A rune that strikes an armored part (a Coilwyrm body segment or its
      // still-coiled head) shatters against it: spent, nothing killed.
      if (thrownDamageTo(enemies[hitIdx], "rune", Infinity, enemies) <= 0) {
        return {
          ...preTickState,
          runeCount: count - 1,
          stats: {
            ...preTickState.stats,
            runesUsed: (preTickState.stats.runesUsed ?? 0) + 1,
          },
        };
      }
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

    // Wall/obstacle -> drop on last floor tile. Lava and deep water count as obstacles
    // here so a precious rune never lands in them: the rune drops on the last dry tile
    // before the hazard, where it can be retrieved. (Shallow water is fine to land on.)
    const runeSubs = newMapData.subtypes[ty]?.[tx] || [];
    const runeHitsLava =
      runeSubs.includes(TileSubtype.LAVA) || runeSubs.includes(TileSubtype.DEEP_WATER);
    if (newMapData.tiles[ty][tx] !== FLOOR || runeHitsLava) {
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
export const BOMB_PACK_SIZE = 5;

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
  // Molten rock and the dry crossings built on hazards survive a blast — a bomb must
  // never erase a pool or strand someone mid-crossing. Water tiers are deliberately
  // NOT preserved: the blast transforms them (shallow evaporates, deep -> shallow).
  TileSubtype.LAVA,
  TileSubtype.OBSIDIAN,
  TileSubtype.STEPPING_STONE,
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
  // Sealed doorways opened by this blast. Their payloads are stamped AFTER the
  // destruction pass below, so the same blast that clears the wall can't also wipe the
  // pot or cave mouth it just uncovered.
  const openedSeals: Array<[number, number]> = [];

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
        // A torch-bearing wall is set stone and shrugs the blast off. This is what keeps
        // a sealed doorway's two bracketing torches standing: the bomb rests directly
        // below the seal, so its 3x3 covers them, and without this the whole motif would
        // blow into one anonymous 3-wide hole instead of an unsealed door between torches.
        const isTorchWall =
          newMapData.tiles[y][x] === WALL && subs.includes(TileSubtype.WALL_TORCH);
        const openedWall = wasWall && !isProtected && !isTorchWall;
        if (openedWall) {
          newMapData.tiles[y][x] = FLOOR;
          wallsDestroyed += 1;
          if (wasTree) treesDestroyed += 1;
          if (subs.includes(TileSubtype.WALL_SEAL)) openedSeals.push([y, x]);
        }
        // A torch wall survives intact — no scorch, no stripped overlays.
        if (isTorchWall) continue;

        // Damage enemies caught in the blast. Most die; tough enemies (stone goblin,
        // 8 HP) can survive a single bomb.
        for (let i = enemies.length - 1; i >= 0; i--) {
          if (enemies[i].y === y && enemies[i].x === x) {
            const target = enemies[i];
            const prevHp = target.health ?? 1;
            // Per-kind gate: an armored part shrugs the blast off entirely (a bomb
            // must not blow the middle out of the Coilwyrm's coil).
            const blastDamage = thrownDamageTo(target, "bomb", BOMB_ENEMY_DAMAGE, enemies);
            if (blastDamage <= 0) continue;
            const newHp = prevHp - blastDamage;
            stats.damageDealt = stats.damageDealt + Math.min(blastDamage, prevHp);
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
        // Water flashes to steam instead of scorching: shallow water evaporates to dry
        // floor (the tag was already stripped above — it isn't preserved) and deep
        // water is blasted down to shallow. Neither takes a SINGED scorch, and molten
        // lava can't be scorched either.
        const hadShallowWater = subs.includes(TileSubtype.SHALLOW_WATER);
        const hadDeepWater = subs.includes(TileSubtype.DEEP_WATER);
        if (hadDeepWater && !kept.includes(TileSubtype.SHALLOW_WATER)) {
          kept.push(TileSubtype.SHALLOW_WATER);
        }
        if (becomesAbyss) {
          if (!kept.includes(TileSubtype.OPEN_ABYSS)) kept.push(TileSubtype.OPEN_ABYSS);
        } else if (
          !hadShallowWater &&
          !hadDeepWater &&
          !kept.includes(TileSubtype.LAVA) &&
          !kept.includes(TileSubtype.SINGED)
        ) {
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

  // Unseal any doorway this blast opened. Done after the destruction pass so what the
  // seal was hiding lands on already-cleared floor: the real doorway becomes a lockless
  // BOSS_ENTRANCE cave mouth, a decoy becomes a pot holding pink-realm fruit or food.
  // SINGED is dropped so the reward reads cleanly, and BREACH with it: a seal on the
  // fallback boundary row would otherwise be tagged as a hole in the dungeon's shell and
  // walk the hero out to the grassland instead of into what was walled up behind it.
  let sealPayloads = state.sealPayloads;
  let potOverrides = state.potOverrides;
  for (const [y, x] of openedSeals) {
    const key = `${y},${x}`;
    const payload = sealPayloads?.[key];
    if (!payload) continue;
    const kept = (newMapData.subtypes[y][x] || []).filter(
      (s) => s !== TileSubtype.SINGED && s !== TileSubtype.BREACH
    );
    if (payload === "boss") {
      newMapData.subtypes[y][x] = kept.concat([TileSubtype.BOSS_ENTRANCE]);
    } else {
      newMapData.subtypes[y][x] = kept.concat([TileSubtype.POT]);
      potOverrides = {
        ...(potOverrides ?? {}),
        [key]: payload === "berry" ? TileSubtype.BERRY : TileSubtype.FOOD,
      };
    }
    const next = { ...(sealPayloads ?? {}) };
    delete next[key];
    sealPayloads = Object.keys(next).length ? next : undefined;
  }

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
    sealPayloads,
    potOverrides,
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
/**
 * Throw a bomb, then settle any boss that died to it. Same reason as the rock wrapper: the
 * payout used to hang off movePlayer only, so a thrown finisher left the arena with no exit key.
 * Wrapped rather than hooked, because the core returns from a dozen places.
 */
export function performThrowBomb(gameState: GameState): GameState {
  const bossesBefore = snapshotBosses(gameState);
  const result = performThrowBombCore(gameState);
  resolveBossDefeat(result, bossesBefore);
  advanceThrowMachinery(gameState, result, gameState.bombCount ?? 0);
  return result;
}

function performThrowBombCore(gameState: GameState): GameState {
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
  onTurnElapsed(preTickState);

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
  // bomb is still consumed and counts as thrown. Lava behaves the same for v1 (the
  // bomb melts into it; v2.5 will detonate on impact and spray shrapnel), and DEEP
  // water douses the fuse — a soaked dud sinks. Shallow water is fine to rest on.
  if (
    !restSubs.includes(TileSubtype.OPEN_ABYSS) &&
    !restSubs.includes(TileSubtype.LAVA) &&
    !restSubs.includes(TileSubtype.DEEP_WATER)
  ) {
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
 * Where the snake medallion's portal is currently parked. The coordinates are only
 * meaningful for the map they were set on, so this travels with the map: every sub-area
 * (pink realm, nightmare, outside world, boss arena) stashes the outer portal in its
 * return record and starts with an empty slot of its own.
 */
export interface PortalLocation {
  roomId: RoomId;
  position: [number, number];
}

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
  endlessPlan?: { floorItems: Record<number, number[]> }; // Endless mode: which floors carry the guaranteed starter-item chests
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
  bombCount?: number; // Count of carried bombs (chest pickups grant a 5-pack)
  foodCount?: number; // Count of collected food items
  potionCount?: number; // Count of collected +2 potions
  pinkHeartCount?: number; // Pink flaming heart prizes held (pink realm); use with 'h' or keep as a trophy
  berryCount?: number; // Belted berries held (pink realm); use with 'g' to heal 2-3
  hasSnakeMedallion?: boolean; // Snake medallion for portal travel
  // Amber Moth rewind charm (Level 2 chest pool). rewindCharges is how many uses are left
  // — 1 from a chest, spent by either a manual rewind or the automatic on-death one.
  // rewindHistory is the ring buffer of recent world snapshots it winds back into; it is
  // only recorded while a charge is held. See lib/map/rewind.ts.
  rewindCharges?: number;
  rewindHistory?: RewindSnapshot[];
  // Wisp life-regen companion (see lib/map/wisp.ts). Live in daily + endless
  // (WISP_STANDARD_CONFIG) and the /test-wisp room; absent wispConfig keeps the whole
  // system dormant in story/tutorial/legacy modes.
  wispConfig?: WispConfig;
  wisps?: WildWisp[]; // Wild, uncaught wisps drifting on the map
  wispCompanions?: number; // Caught wisps carried as extra lives
  wispPos?: [number, number]; // Carried wisp's current perch (render + rescue tug target)
  heroTrail?: Array<[number, number]>; // Last few tiles the hero vacated, newest last
  wispPityFloors?: number[]; // Floors whose once-per-floor pity wisp already appeared
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
    // Item keys revealed from chests and actually picked up, in pickup order
    // (e.g. ["sword","shield","extra_heart"]). Lets analytics report exactly
    // which variable Level 2 items a run collected, not just a count.
    chestItemsCollected?: string[];
    itemsCollected?: number; // Total items picked up
    maxHealth?: number; // Highest health reached
    poisonSteps?: number; // Steps taken while poisoned
    ghostsVanished?: number; // Ghosts that vanished by getting close
    // Bosses killed this run. The daily has at most one (so `bossDefeated` says it all),
    // but endless stands a boss on every 6th floor, and a run that killed four should not
    // report the same thing as a run that killed one.
    bossesDefeated?: number;
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
  // Hearth & Home (/home) only — which family member the player is controlling.
  // Unset in daily/story/endless; dialogue rules may branch on it via customCondition.
  activeHeroId?: string;
  // Hearth & Home (/home) only — sprite paths that replace the hero art.
  // heroSprite is the front view and the fallback for all facings; back/side
  // are optional (side art faces right, mirrored for left). Unset = default
  // hero sprites.
  heroSprite?: string;
  heroSpriteBack?: string;
  heroSpriteSide?: string;
  // Render height of heroSprite as % of the tile (85 = NPC standard, 51 = dog).
  heroSpriteScale?: number;
  // Death cause tracking for specific death messages
  deathCause?: {
    type: "enemy" | "faulty_floor" | "poison" | "bomb" | "darkness" | "lava" | "spikes";
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
  potOverrides?: PotOverrides;
  // What each WALL_SEAL on this floor hides, keyed by `${y},${x}`. Deliberately held
  // here instead of on the tile so every seal looks identical until it is blown open
  // (see SealPayload). Consumed by detonateLiveBombs and reset on each new floor.
  sealPayloads?: SealPayloads;
  lastCheckpoint?: CheckpointSnapshot;
  // Portal state for snake medallion. Belongs to the map it was set on — the sub-area
  // stashes below carry the outer map's portal while the hero is away from it.
  portalLocation?: PortalLocation;
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
  // Boss-room entrances (see .claude/features/boss-daily-entrances/index.md).
  // inBossRoom: transient, true while the hero is inside a boss arena.
  // reachedBossRoom: run-level latch, true once a boss arena was entered this run.
  // bossArenaSeed: which elemental Shaper arena to build on entry (defaults lava).
  inBossRoom?: boolean;
  reachedBossRoom?: boolean;
  // Latches when the Shaper dies (gold key dropped). Run-level, so the endgame can
  // report the boss kill even after the hero leaves the arena.
  bossDefeated?: boolean;
  // Which of the four daily doors led here (bomb/douse/moat-lava/moat-water) — set
  // once, the day the entrance was rolled, so analytics can report which kind of
  // exit that day's boss room had (independent of whether the hero ever finds it).
  bossEntranceKind?: BossEntranceKind;
  // The boss the hero ACTUALLY entered and fought. Set on entry (rather than inferred from
  // the live enemies array, which is empty after the kill or after the hero leaves), so a
  // run reports which boss it faced. Absent on runs that never found the room.
  bossKind?: BossKind;
  // The boss the DAY rolled — present from floor-3 generation onward whether or not the
  // hero ever finds the entrance. Kept distinct from bossKind so "what did today hold" and
  // "what did this player fight" stay separately answerable; conflating them would make
  // every floor-3 run look like it met a boss.
  dailyBossKind?: BossKind;
  bossArenaSeed?: "water" | "lava";
  /**
   * Switch-and-barrier wiring for the current map: each entry is one PRESSURE_PLATE and the
   * SPIKES tiles it retracts. Held here rather than on the tiles so one arena can run
   * several independent sets (the Quarrymaster's three beds plus his chamber switch).
   * Absent on maps without the puzzle.
   */
  gateGroups?: GateGroup[];
  /**
   * Puzzle machinery (lib/map/machinery.ts): re-armable toggle switches and the platforms they
   * park. Absent on every map without a puzzle, which is currently all of them outside the
   * authored rooms in app/test-puzzle-room.
   */
  toggleGroups?: ToggleGroup[];
  /**
   * Colour locks (lib/map/machinery.ts): groups of turning colour switches whose combined colours
   * drive gates through a predicate. Used by the daily floor-2 colour puzzle (color_switch_puzzle.ts)
   * and the puzzle bench; absent on every other map.
   */
  colorLocks?: ColorLock[];
  platforms?: Platform[];
  /**
   * Daily switch gates: is the feature on for this run, and what did the day end up with?
   *
   * Both are set when floor 1 is built and carried forward by advanceToNextFloor's spread, which
   * is what makes the cascade work across floors generated minutes apart in separate RNG
   * streams. `switchGate` doubles as the "already spent" flag and as the analytics record — its
   * presence is what stops a second floor claiming one. `switchGatesEnabled` is left undefined
   * rather than false when off, so it stays absent from the serialized save for every run that
   * predates the feature.
   */
  switchGatesEnabled?: boolean;
  switchGate?: DailySwitchGate;
  // The floor to restore when the hero walks back out of a boss arena. Kept
  // separate from dungeonReturn/realmReturn (a boss room can be entered from the
  // dungeon OR from inside another sub-area, so the stashes must nest).
  bossReturn?: {
    mapData: MapData;
    enemies?: PlainEnemy[];
    position: [number, number];
    portalLocation?: PortalLocation;
  };
  // Pink realm only: the drifting mist's currently-covered tiles ([y,x] pairs). Grows/
  // shrinks organically each turn. Standing in it reverses the hero's controls; enemies
  // in it are blinded. Undefined / absent outside the realm.
  mist?: Array<[number, number]>;
  dungeonReturn?: {
    mapData: MapData;
    enemies?: PlainEnemy[];
    position: [number, number];
    // The dungeon's own medallion portal, held while the hero is in the sub-area. Its
    // coordinates only mean anything on the dungeon map (the pink realm is a MIRROR of
    // that map, so an unscoped portal set in the realm reads back as a wall tile), so it
    // rides here instead of staying live. See PortalLocation.
    portalLocation?: PortalLocation;
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
    portalLocation?: PortalLocation;
  };
}

/**
 * `rewindHistory` is excluded alongside `lastCheckpoint` for the same reason: both are
 * themselves collections of snapshots, so storing one inside a snapshot nests state
 * within state and grows it exponentially. The rewind buffer is rebuilt from live play
 * after a checkpoint revive, which is correct anyway — you can't wind back past a death.
 */
export type CheckpointSnapshot =
  Omit<
    GameState,
    "combatRng" | "lastCheckpoint" | "rewindHistory" | "enemies" | "npcs"
  > & {
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
  const { combatRng, lastCheckpoint, rewindHistory, enemies, ...rest } = state;
  void combatRng;
  void lastCheckpoint;
  void rewindHistory;
  const base = JSON.parse(
    JSON.stringify(rest)
  ) as Omit<
    GameState,
    "combatRng" | "lastCheckpoint" | "rewindHistory" | "enemies"
  >;
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
    const restored = orig.length > 0 ? [...orig] : [TileSubtype.NONE];
    // The hero may be standing on the inert ring when its owner dies. The saved
    // snapshot predates their arrival — keep the PLAYER marker or the hero gets
    // erased from the map (unfindable, invisible, every input dead).
    if (
      subtypes[mem.ringY]?.[mem.ringX]?.includes(TileSubtype.PLAYER) &&
      !restored.includes(TileSubtype.PLAYER)
    ) {
      restored.push(TileSubtype.PLAYER);
    }
    subtypes[mem.ringY][mem.ringX] = restored;
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
    // Water is kryptonite to pink goblins: touching either tier destroys them. Their
    // pathing and teleports refuse water tiles, so this is the safety net for any
    // path that still lands one there (the tile stays water — no conversion).
    const pinkOnWater =
      enemy.kind === "pink-goblin" &&
      (tileSubs.includes(TileSubtype.SHALLOW_WATER) ||
        tileSubs.includes(TileSubtype.DEEP_WATER));
    // A stone goblin is too heavy for a player-built stepping stone: the stone
    // sinks under its weight (tile reverts to deep water) and the goblin drowns.
    // For everyone else the stone is a safe crossing; for him it's an abyss.
    const stoneGoblinOnSteppingStone =
      enemy.kind === "stone-goblin" &&
      tileSubs.includes(TileSubtype.STEPPING_STONE);
    // A length of Coilwyrm cut off from its head. The head flags these the moment it
    // notices the gap a killed segment left (see coilwyrmHeadUpdate); reaping them here
    // rather than inside the behavior is what earns them death VFX and kill stats.
    const severedCoil =
      enemy.kind === "coilwyrm-coil" &&
      (enemy.behaviorMemory as { severed?: boolean } | undefined)?.severed === true;

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
    } else if (pinkOnWater) {
      cleanupPinkRing(enemy, subtypes);
      defeated.push(enemy);

      if (!state.recentDeaths) state.recentDeaths = [];
      state.recentDeaths.push([enemy.y, enemy.x]);

      state.stats.enemiesDefeated += 1;
      trackEnemyKill(state.stats, enemy.kind as EnemyKind, state.currentFloor ?? 1);

      if (!state.defeatedEnemies) state.defeatedEnemies = [];
      state.defeatedEnemies.push(createDefeatedEnemyInfo(enemy));
    } else if (stoneGoblinOnSteppingStone) {
      // The stone gives way: revert the crossing to deep water and drown him.
      subtypes[enemy.y][enemy.x] = subtypes[enemy.y][enemy.x].filter(
        (type) => type !== TileSubtype.STEPPING_STONE
      );
      subtypes[enemy.y][enemy.x].push(TileSubtype.DEEP_WATER);

      cleanupPinkRing(enemy, subtypes);
      defeated.push(enemy);

      if (!state.recentDeaths) state.recentDeaths = [];
      state.recentDeaths.push([enemy.y, enemy.x]);

      state.stats.enemiesDefeated += 1;
      trackEnemyKill(state.stats, enemy.kind as EnemyKind, state.currentFloor ?? 1);

      if (!state.defeatedEnemies) state.defeatedEnemies = [];
      state.defeatedEnemies.push(createDefeatedEnemyInfo(enemy));
    } else if (severedCoil) {
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
 * Kill whatever enemies are standing on `coords`, with the same bookkeeping a hazard death gets.
 *
 * Used by the spike beds a TOGGLE_SWITCH raises. Separate from applyEnemyHazardDeaths because
 * that one reaps enemies that walked ONTO a hazard, whereas this is the hazard arriving under
 * an enemy that never moved — same outcome, opposite cause, and only the toggle can cause it.
 */
function killEnemiesAt(state: GameState, coords: Array<[number, number]>): void {
  if (!state.enemies || coords.length === 0) return;
  const doomed = new Set(coords.map(([y, x]) => `${y},${x}`));
  const survivors: Enemy[] = [];
  for (const enemy of state.enemies) {
    if (!doomed.has(`${enemy.y},${enemy.x}`)) {
      survivors.push(enemy);
      continue;
    }
    cleanupPinkRing(enemy, state.mapData.subtypes);
    if (!state.recentDeaths) state.recentDeaths = [];
    state.recentDeaths.push([enemy.y, enemy.x]);
    state.stats.enemiesDefeated += 1;
    trackEnemyKill(state.stats, enemy.kind as EnemyKind, state.currentFloor ?? 1);
    if (!state.defeatedEnemies) state.defeatedEnemies = [];
    state.defeatedEnemies.push(createDefeatedEnemyInfo(enemy));
    const updated = processEnemyDefeat(state, createDefeatedEnemyInfo(enemy));
    Object.assign(state, updated);
  }
  state.enemies = survivors;
}

/**
 * The ENEMY-PHASE hook: enemies have just acted, so reap whoever stepped into a hazard.
 *
 * Runs BEFORE the player's action. Puzzle machinery deliberately does NOT advance here — see
 * endTurn for why that ordering matters.
 */
function onTurnElapsed(state: GameState): void {
  applyEnemyHazardDeaths(state);
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
        subtypes: mapData.subtypes,
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
/**
 * @param opts.switchGates Opt in to the daily's switch-gate feature (see
 *   lib/map/switch-gates.ts). Defaults to OFF so that every other caller — tests, story mode,
 *   endless, and the historical replays in lib/stats — is unaffected by construction. The two
 *   daily entry points turn it on, gated on SWITCH_GATE_START_DATE, because they are the only
 *   callers that know what date's map they are building.
 */
export function initializeGameStateForMultiTier(
  floor: number = 1,
  opts: { switchGates?: boolean } = {}
): GameState {
  // Compute the chest/key allocation for all floors (sword/shield on 1–4, medallion on 5–7)
  const allocationMap = allocateChestsAndKeys();

  // Convert Map to plain object for JSON serialization
  const floorChestAllocation: Record<number, { chests: number; keys: number; chestContents: number[] }> = {};
  allocationMap.forEach((val, key) => {
    floorChestAllocation[key] = val;
  });

  const floorAlloc = floorChestAllocation[floor] ?? { chests: 0, keys: 0, chestContents: [] };
  const mapData = generateCompleteMapForFloor(floorAlloc, floor);

  // Decoy cracks, 3-5, on every floor including this one. On floor 1 the hero has no
  // bombs at all, so a crack here is pure intrigue — it teaches the motif before it can
  // ever be used. (The real sealed doorway is floor 3 only; see advanceToNextFloor.)
  const sealPayloads = orUndefined(
    stampDecoySeals(mapData, rollDecoySealCount())
  );

  const playerPos = findPlayerPosition(mapData);
  const enemies = playerPos
    ? placeEnemies({
        grid: mapData.tiles,
        subtypes: mapData.subtypes,
        player: { y: playerPos[0], x: playerPos[1] },
        count: enemyCountForFloor(floor),
        minDistanceFromPlayer: 8,
      })
    : [];

  const { ghostCount, whiteGoblinCount } = enemyTypeAssignement(enemies, { floor });
  if (ghostCount > 0 && playerPos) {
    const ghosts = placeEnemies({
      grid: mapData.tiles,
      subtypes: mapData.subtypes,
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
      subtypes: mapData.subtypes,
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

  // The day's switch gate gets its first shot here. LAST in the floor's RNG stream on purpose —
  // after the map, the seals, the enemies, the runes and the snakes — so switching the feature
  // on moves none of those draws on any date. See maybePlaceSwitchGate.
  const gateWiring: {
    mapData: MapData;
    gateGroups?: GateGroup[];
    switchGate?: DailySwitchGate;
  } = { mapData: withRunes };
  // The day's wisp pots, baked into the map so the SAME pots hold wisps for every
  // player on this seed. Placed after every other generation draw but immediately
  // BEFORE the switch gate: the gate must stay the floor's final — and only
  // conditional — draw, so its on/off toggle can never shift these stamps (the
  // gates suite pins "enabling gates changes NOTHING else on the floor"). The
  // draws /stats replays historically (chest allocation, boss kind) all happen
  // earlier or on separate streams, so they stay true.
  stampWispPots(withRunes);

  // Level-scale colour puzzle on floor 1 (~5% of days; 3 switches rather than floor 2's 4, to suit
  // the smaller opening floor). Same /stats discipline as the floor-2 puzzle, adapted to a builder
  // that never receives the daily seed: it draws from its OWN stream, seeded from the day's already-
  // generated map (deterministic per date, yet consuming nothing from the shared Math.random
  // sequence). Stamped BEFORE the switch gate so its placement can never depend on whether switch
  // gates are enabled — the gates suite pins that toggling that feature changes nothing else on the
  // floor — and the map is hashed here, before the puzzle carves it, so both runs seed identically.
  // The switch gate is then handed the puzzle's tiles to avoid, so the two never collide.
  let colorLocks: ColorLock[] | undefined;
  const f1Player = findPlayerPosition(withRunes);
  if (floor === 1 && f1Player) {
    const mapKey = withRunes.tiles.map((r) => r.join("")).join("");
    const puzRng = mulberry32Fn(hashStringToSeed(mapKey) ^ COLOR_PUZZLE_FLOOR1_SEED_SALT);
    if (puzRng.next() < COLOR_PUZZLE_FLOOR1_CHANCE) {
      const avoid: Array<[number, number]> = (snakesAdded ?? []).map((e) => [e.y, e.x]);
      avoid.push([f1Player[0], f1Player[1]]);
      colorLocks =
        stampColorSwitchLock(withRunes, puzRng, { switches: 3, colors: 4, avoid }) ?? undefined;
    }
  }

  if (opts.switchGates) {
    const gateAvoid = occupiedTiles(snakesAdded);
    for (const l of colorLocks ?? [])
      for (const [ty, tx] of [...l.switches, ...l.gates]) gateAvoid.add(`${ty},${tx}`);
    maybePlaceSwitchGate(gateWiring, floor, findPlayerPosition(withRunes), {
      avoid: gateAvoid,
    });
  }

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
    colorLocks,
    sealPayloads,
    // Wisps are live in the daily: seeded pot stamps above, plus the runtime
    // enemy-drop and once-per-floor pity sources this config switches on.
    wispConfig: WISP_STANDARD_CONFIG,
    // Carried across floors: whether the feature is on for this run, and whether the day's one
    // gate has already been spent. advanceToNextFloor reads both.
    switchGatesEnabled: opts.switchGates ? true : undefined,
    switchGate: gateWiring.switchGate,
    gateGroups: gateWiring.gateGroups,
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
        subtypes: ensured.subtypes,
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
  
  // Daily floors 2 and 3 carry elemental terrain. Lava is always present on those
  // floors; water is SEMI-RANDOM — each floor independently rolls whether it gets a
  // pool and how big (rollWaterPlan: ~1/2 per candidate floor, weighted size tiers,
  // ~50%-coverage flood is rare). Lava and water can coexist on the same floor. Floor 1
  // is built elsewhere and stays element-free as the teaching floor.
  const includeLava = nextFloor === 2 || nextFloor === 3;

  // Generate new map with floor-specific seed. The water roll MUST happen inside this
  // seeded block (before map generation) so daily maps stay deterministic.
  // The day's boss entrance (floor 3 only), rolled inside the seeded block below so
  // every player gets the same one. Null on a bombless-unlucky roll or when the floor
  // had no safe spot for it — that day is simply bossless.
  let bossEntrance: BossEntranceKind | null = null;
  // What each WALL_SEAL on a bomb day hides (empty on the other entrance kinds).
  let sealPayloads: SealPayloads | undefined;
  // Ghosts guaranteed on a douse day (they're how you go dark, and the tell).
  const DOUSE_DAY_MIN_GHOSTS = 3;

  const newMapData = withPatchedMathRandom(rng, () => {
    const waterPlan = rollWaterPlan(nextFloor) ?? undefined;
    let mapData: MapData;
    if (allocation && (allocation.chests > 0 || allocation.keys > 0)) {
      mapData = generateCompleteMapForFloor(allocation, nextFloor, { includeLava, waterPlan });
    } else {
      // Floors 5+: no chests or keys, just a standard map without chests/keys
      mapData = generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, nextFloor, { includeLava, waterPlan });
    }
    // Floor 3 is the escape floor and the only one that hides a boss room. Stamped
    // BEFORE enemies are placed (below) so nothing spawns inside the moat/lava.
    if (nextFloor === 3) {
      // The bombable-wall entrance is only offered when the day actually hands out a
      // bomb (they come from the Level 2 optional-chest pool, which skips bombs ~1 day
      // in 3). Otherwise that day gets a douse/moat entrance instead of an unreachable
      // one. Chest allocation is fixed at run start, so this is stable for the day.
      const bombAvailable = Object.values(currentState.floorChestAllocation ?? {}).some(
        (a) => (a.chestContents ?? []).includes(TileSubtype.BOMB)
      );
      const kind = rollBossEntranceKind({ bombAvailable });
      if (kind) {
        // If the rolled kind has no legal spot on THIS floor 3, place a different
        // (reachable, non-bomb) kind instead, so a boss day never silently loses its
        // door. The retry draws from a SEPARATE salted stream so it consumes nothing from
        // `rng`: every successfully-placed day stays byte-identical and /stats replay of
        // past days is undisturbed. See stampBossEntranceWithFallback for the discipline.
        const placed = stampBossEntranceWithFallback(
          mapData,
          kind,
          mulberry32Fn(dailySeed ^ BOSS_ENTRANCE_FALLBACK_SEED_SALT)
        );
        if (placed) {
          bossEntrance = placed.kind;
          sealPayloads = placed.sealPayloads;
        }
      }
    }
    // Decoy cracks, 3-5, on EVERY floor — independent of the boss roll, so a floor
    // always carries cracks with no doorway behind most of them. Placed after the
    // doorway so they keep their distance from it.
    const decoys = stampDecoySeals(
      mapData,
      rollDecoySealCount(),
      sealPayloads ? sealCoords(sealPayloads) : []
    );
    sealPayloads = orUndefined({ ...(sealPayloads ?? {}), ...decoys });
    return mapData;
  });

  // Which boss the day's room holds. Rolled from a SEPARATE stream derived from the daily
  // seed — NOT from `rng` — so it consumes nothing from the floor's random sequence. Drawing
  // one value from `rng` here would shift every later roll (enemy placement, snakes), which
  // would change what past dates replay to and so silently corrupt the historical answers
  // that lib/stats/boss_day.ts and daily_chest.ts get by re-running this generator.
  // Deterministic from the date, so every player gets the same boss; independent of it, so
  // adding bosses later never disturbs existing daily maps.
  const dailyBossKind = bossEntrance
    ? withPatchedMathRandom(
        mulberry32Fn(dailySeed ^ BOSS_KIND_SEED_SALT),
        rollDailyBossKind
      )
    : undefined;

  // Find player position to place enemies
  const playerPos = findPlayerPosition(newMapData);
  const enemies = playerPos
    ? withPatchedMathRandom(rng, () => {
        const placed = placeEnemies({
          grid: newMapData.tiles,
          subtypes: newMapData.subtypes,
          player: { y: playerPos[0], x: playerPos[1] },
          count: enemyCountForFloor(nextFloor),
          minDistanceFromPlayer: 8,
        });
        const { ghostCount: gc, whiteGoblinCount: wgc } = enemyTypeAssignement(placed, { floor: nextFloor });
        if (gc > 0) {
          const ghosts = placeEnemies({
            grid: newMapData.tiles,
            subtypes: newMapData.subtypes,
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
            subtypes: newMapData.subtypes,
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
        // On a DOUSE day the ghosts are the mechanism AND the signpost: they snuff the
        // torch on contact, which is what reveals the dark portal, and their presence is
        // the hint that something is hidden here. The normal floor-3 roll can hand out
        // zero ghosts, which would leave the portal effectively undiscoverable — so top
        // the floor up to a guaranteed few.
        if (bossEntrance === "douse") {
          const have = placed.filter((e) => e.kind === "ghost").length;
          const need = DOUSE_DAY_MIN_GHOSTS - have;
          if (need > 0 && playerPos) {
            const extra = placeEnemies({
              grid: newMapData.tiles,
              subtypes: newMapData.subtypes,
              player: { y: playerPos[0], x: playerPos[1] },
              count: need,
              minDistanceFromPlayer: 6,
            });
            extra.forEach((g) => {
              g.kind = "ghost";
              placed.push(g);
            });
          }
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

  // Add rune pots and snakes. These MUST run inside the seeded block like every other
  // generation step: unseeded, two players on the same daily got different rune pots
  // and different snakes (snakes are lethal and runes one-shot stone goblins, so it was
  // a real fairness gap, not cosmetic).
  const withRunes = withPatchedMathRandom(rng, () =>
    addRunePotsForStoneExciters(newMapData, enemies)
  );
  const snakesAdded = withPatchedMathRandom(rng, () =>
    addSnakesPerRules(withRunes, enemies, { floor: nextFloor })
  );

  // Wisp pots for this floor. Immediately BEFORE the switch gate: the gate must stay the floor's
  // final rng-consuming draw so its toggle never shifts these stamps. Gated on the run carrying a
  // wisp config so legacy multi-floor modes don't grow markers.
  if (currentState.wispConfig) {
    withPatchedMathRandom(rng, () => stampWispPots(withRunes));
  }

  // This floor's shot at the day's switch gate, if an earlier floor did not already claim it. LAST
  // in `rng`'s stream on purpose — see maybePlaceSwitchGate; every draw it makes lands after the
  // map, boss, enemy, rune, snake and wisp draws above, so turning the feature on cannot change what
  // any past date replays to. gateGroups deliberately starts EMPTY rather than carrying
  // currentState's: it is per-map wiring, and the previous floor's beds died with the previous floor.
  const gateWiring: {
    mapData: MapData;
    gateGroups?: GateGroup[];
    switchGate?: DailySwitchGate;
  } = {
    mapData: withRunes,
    switchGate: currentState.switchGate,
  };
  if (currentState.switchGatesEnabled) {
    withPatchedMathRandom(rng, () =>
      maybePlaceSwitchGate(gateWiring, nextFloor, findPlayerPosition(withRunes), {
        avoid: occupiedTiles(snakesAdded),
      })
    );
  }

  // Level-scale colour-switch puzzle (floor 2 only, ~15-20% of days). Rolled + placed from a SEPARATE
  // salted stream (like dailyBossKind) and stamped TRULY LAST — after the switch gate above has read
  // the clean map and made its `rng` draws — so it consumes NOTHING from `rng` and its tiles are seen
  // by nothing downstream. The shared sequence stays byte-identical, so /stats reconstruction of past
  // days (boss kind, L2 chests, switch gates, wisps) is unchanged and no date-gate is needed. It only
  // carves dead-end wall pockets + drops switches on empty floor and relocates the exit key behind the
  // gate, so it can never sever the floor or softlock; returns null (stamps nothing) when no safe spot.
  // ONE colour puzzle per run: floor 1 generates first, so if it already placed one, floor 2 skips
  // its roll — a day never stacks two (they play repetitive back-to-back). currentState IS the
  // floor-1 state here (nextFloor === 2), and floor-1 puzzle presence is deterministic per daily
  // seed, so this stays fully deterministic. It reads a flag, draws nothing, and the floor-2 roll it
  // gates uses only its OWN salted stream — so `rng` (and therefore /stats replay) is untouched
  // whichever way it goes; still no date-gate needed. Floor 1 only fires ~5% of days, so floor 2's
  // effective rate barely moves (loses the ~1% of days that would have had both).
  const floor1HasColorPuzzle = (currentState.colorLocks?.length ?? 0) > 0;
  let colorLocks: ColorLock[] | undefined;
  if (nextFloor === 2 && playerPos && !floor1HasColorPuzzle) {
    const puzRng = mulberry32Fn(dailySeed ^ COLOR_PUZZLE_SEED_SALT);
    if (puzRng.next() < COLOR_PUZZLE_CHANCE) {
      const avoid: Array<[number, number]> = (snakesAdded ?? []).map((e) => [e.y, e.x]);
      avoid.push([playerPos[0], playerPos[1]]);
      colorLocks =
        stampColorSwitchLock(withRunes, puzRng, { switches: 4, colors: 4, avoid }) ?? undefined;
    }
  }

  // Create new game state preserving hero stats and inventory
  return {
    ...currentState,
    currentFloor: nextFloor,
    maxFloors,
    mapData: withRunes,
    enemies: snakesAdded,
    // Fresh per floor: only floor 2 may carry it, and it must RESET on every other floor (the spread
    // above would otherwise inherit the previous floor's lock, which points at tiles that don't exist
    // on this map).
    colorLocks,
    switchGate: gateWiring.switchGate,
    // Replaced, not merged: gateGroups is per-map wiring and the previous floor's beds are gone
    // with the previous floor. Carrying them forward would leave pressPlate matching a plate
    // coordinate on a map that no longer has it.
    gateGroups: gateWiring.gateGroups,
    hasExitKey: false, // Reset exit key for new floor
    portalLocation: undefined, // Reset placed portal — no backtracking between floors
    win: false, // Reset win state
    // Boss room for the day: which elemental arena the entrance opens into, and (on a
    // bomb day) what each sealed wall tile hides. bossEntranceKind is persisted even if
    // the hero never finds the entrance, so analytics can report what kind of door the
    // day actually had.
    bossEntranceKind: bossEntrance ?? undefined,
    bossArenaSeed: bossEntrance ? arenaSeedForEntrance(bossEntrance) : undefined,
    sealPayloads,
    dailyBossKind,
    // Wild wisps, the hero's trail and the companion's perch are positions on the
    // floor being left behind — reset. Carried companions and the per-floor pity
    // latch (wispPityFloors, keyed by floor number) ride along via the spread.
    wisps: undefined,
    heroTrail: undefined,
    wispPos: undefined,
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
      portalLocation: ret.portalLocation,
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
      portalLocation: undefined, // per-map; the realm's rides in the stash
      realmReturn: {
        mapData: removePlayerFromMapData(state.mapData),
        enemies: serializeEnemies(state.enemies),
        position,
        mist: state.mist,
        portalLocation: state.portalLocation,
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
      portalLocation: ret.portalLocation,
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
    portalLocation: state.portalLocation,
  };
  return {
    ...state,
    mapData: placePlayerAt(outsideMap, entry),
    enemies: rehydrateEnemies(outsideEnemies),
    playerDirection: direction,
    inOutsideWorld: true,
    outsideDirection: direction,
    reachedOutsideWorld: true,
    portalLocation: undefined, // per-map; the dungeon's rides in dungeonReturn
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

// Pink-realm population tuning. The realm guards the heart chest, but the old density
// (4 swarms of 4 + 4 ninjas = 20 enemies) made the reward not worth the trouble, so the
// counts are halved. Still a fight, no longer a wall.
const REALM_WHITE_SWARMS = 2; // two sets of white goblins (4 goblins each)
const REALM_WHITE_GOBLIN_HP = 3; // buffed from 1 so a single hero swing can't clear them
const REALM_PINK_NINJAS = 2; // two hit-and-run ninja pink goblins

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
      goblin.maxHealth = REALM_WHITE_GOBLIN_HP; // keep HUD hearts in sync with the buffed HP
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
    // The realm gets a blank portal slot; the dungeon's rides in the stash. Leaving it
    // live would let a portal set in here — a horizontal mirror of the dungeon — teleport
    // the hero onto the mirrored dungeon tile (typically a wall) after they walk back.
    portalLocation: undefined,
    dungeonReturn: {
      mapData: dungeonMap,
      enemies: serializeEnemies(state.enemies),
      position: ringPos,
      portalLocation: state.portalLocation,
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
    // Any portal placed inside the realm dies with the realm; the dungeon's comes back.
    portalLocation: ret.portalLocation,
    dungeonReturn: undefined,
    recentDeaths: [],
    recentBombBlasts: [],
  };
}

// Map the hero's step direction to the arena edge they arrive at (walking DOWN into
// the mouth drops them in at the north edge, and so on).
const BOSS_ENTRY_BY_DIRECTION: Record<Direction, ShaperEntry> = {
  [Direction.DOWN]: "north",
  [Direction.UP]: "south",
  [Direction.RIGHT]: "west",
  [Direction.LEFT]: "east",
};

/**
 * Step onto a boss-room entrance (a lockless cave mouth, or a dark portal while the
 * torch is out) -> warp into the boss arena. Mirrors enterPinkRealm: swap in the
 * freshly built arena map + enemies, carry the run's vitals/inventory, and latch the
 * reachedBossRoom secret flag.
 *
 * WHICH boss is the day's roll (dailyBossKind), so it's the same for every player that day —
 * see rollDailyBossKind. The entrance still sets the Shaper's elemental variant; the Fisher
 * ignores it (its arena is outdoor and always the same shape, varying only in pond layout).
 * Falls back to the Shaper when dailyBossKind is absent, which covers runs saved before the
 * roll existed.
 */
function enterBossRoom(
  state: GameState,
  entrancePos: [number, number],
  direction: Direction
): GameState {
  const kind: BossKind = state.dailyBossKind ?? "shaper";
  const entry = BOSS_ENTRY_BY_DIRECTION[direction] ?? "south";
  // Each boss brings its own arena. Only the Shaper reads `entry`: the others are built
  // around a fixed approach (the Fisher from the bottom of the pond, the Quarrymaster from
  // the door opposite his chamber), so passing a compass direction in would mean nothing.
  const arena: GameState =
    kind === "fisher"
      ? buildFisherArena()
      : kind === "coilwyrm"
      ? buildCoilwyrmArena()
      : kind === "quarrymaster"
      ? // Layout is rolled here rather than defaulted, so every player gets the SAME room on
        // a given day — enterBossRoom runs inside the daily seeded RNG, same contract as the
        // boss roll itself. Without this the arena would silently be layout 0 forever.
        buildQuarrymasterArena({
          layoutIndex: Math.floor(Math.random() * QUARRYMASTER_LAYOUTS.length),
        }).state
      : buildShaperArena(
          { name: "boss", seed: state.bossArenaSeed === "water" ? "water" : "lava" },
          entry
        );

  // The arena tile the hero arrives on becomes the way back out (same subtype both
  // ways, exactly like the pink realm's ring): step off it, then back onto it, to
  // return to the dungeon. Stepping onto it is only a RETURN while inBossRoom, so it
  // can never re-trigger the entry warp.
  const arenaMap = arena.mapData;
  const arrival = findPlayerPosition(arenaMap);
  if (arrival) {
    const [ay, ax] = arrival;
    const cell = arenaMap.subtypes[ay][ax];
    if (!cell.includes(TileSubtype.BOSS_ENTRANCE)) cell.push(TileSubtype.BOSS_ENTRANCE);
  }

  // Take ONLY the arena's map + boss from the builder; every other field must come
  // from the live run, or entering the fight would wipe the run (exit key, stats,
  // floor, daily mode, fog) — the builder's literal is standalone-harness defaults.
  return {
    ...state,
    mapData: arenaMap,
    enemies: arena.enemies,
    // Switch-and-spike wiring, for the arenas that have it. This has to come from the
    // builder alongside the map: it is arena STATE, not one of the standalone-harness
    // defaults the comment above warns against taking. Undefined for the other three
    // bosses, which is correct — they have no plates.
    gateGroups: arena.gateGroups,
    npcs: [],
    inBossRoom: true,
    reachedBossRoom: true,
    bossKind: kind,
    playerDirection: direction,
    // Stash the floor exactly as it was (player lifted out) so the way back is a
    // faithful restore. Kept in its own field: dungeonReturn is already in use by
    // the outside world / pink realm, and a boss room can be entered from either.
    bossReturn: {
      mapData: removePlayerFromMapData(state.mapData),
      enemies: serializeEnemies(state.enemies),
      position: entrancePos,
      portalLocation: state.portalLocation,
    },
    portalLocation: undefined, // per-map; the floor's rides in bossReturn
    mist: undefined, // realm mist doesn't follow you into the arena
    recentDeaths: [],
    recentBombBlasts: [],
  };
}

/**

 * Where each boss stood going INTO this turn. Captured up front because the turn
 * handlers mutate the enemies array in place, so after they run the pre-state no longer
 * shows a boss that just died.
 */
export interface BossSnapshot {
  shaper: [number, number] | null;
  fisher: [number, number] | null;
  quarrymaster: [number, number] | null;
  coilwyrm: [number, number] | null;
}

export function snapshotBosses(state: GameState): BossSnapshot {
  const find = (kind: EnemyKind): [number, number] | null => {
    const e = (state.enemies ?? []).find((en) => en.kind === kind);
    return e ? [e.y, e.x] : null;
  };
  // The Coilwyrm counts as "still here" while ANY of its parts stands, not just a head:
  // a decapitated body can spend a turn (or more) headless before it promotes a replacement
  // or is reaped, and if the snapshot only saw heads those turns would have coilwyrm: null —
  // so the turn the last segment finally died would skip the payout branch entirely and the
  // exit key would never drop. Registry-driven (bodyPart) so the next segmented boss inherits it.
  const findCoilwyrm = (): [number, number] | null => {
    const head = find("coilwyrm");
    if (head) return head;
    const part = (state.enemies ?? []).find((en) => EnemyRegistry[en.kind]?.bodyPart);
    return part ? [part.y, part.x] : null;
  };
  return {
    shaper: find("shaper"),
    fisher: find("fisher"),
    quarrymaster: find("quarrymaster"),
    coilwyrm: findCoilwyrm(),
  };
}

/**
 * The payout every boss owes on top of its own drop: a HEART.
 *
 * Granted outright rather than dropped as an EXTRA_HEART tile because the four bosses die
 * in four different places — the Fisher's corpse becomes a bridge across the spikes, so
 * "the tile it died on" is not somewhere an item can safely sit — and because a reward that
 * lands the instant the last blow does reads as the kill paying out, not as more looting.
 * Same effect as the chest item: +1 to max health and a full refill.
 *
 * It matters most in endless, where a boss stands on every 6th floor and its heart is the
 * only sustain the arena offers, but it applies in the daily too: killing the boss and
 * walking back out to finish floor 3 should leave the hero stronger for it.
 *
 * `bossesDefeated` counts them because `bossDefeated` is a boolean — true for the daily's
 * single fight, useless for an endless run that killed four.
 */
function settleBossKill(after: GameState): void {
  after.bossDefeated = true;
  after.heroMaxHealth = (after.heroMaxHealth ?? 5) + 1;
  after.heroHealth = after.heroMaxHealth;
  after.stats.maxHealth = Math.max(after.stats.maxHealth ?? 0, after.heroHealth);
  after.stats.bossesDefeated = (after.stats.bossesDefeated ?? 0) + 1;
}

/**
 * Boss death payouts, detected centrally by comparing the pre-turn snapshot to the
 * resolved state rather than hooked into each of the many kill paths — so melee, thrown
 * rocks and bombs all work. Idempotent via bossDefeated.
 *
 *   Shaper -> drops the gold key that opens the arena's exit (the alternate ending).
 *   Fisher -> topples forward across the spikes; its body IS the crossing, and the key
 *             comes with it. There is no other way anyone reaches the far bank.
 *   Quarrymaster -> drops the gold key like the Shaper. Reaching the exit still needs the
 *             chamber switch thrown, which is a separate gate (see gateGroups).
 *
 * All four also hand over a heart — see settleBossKill.
 *
 * Whatever this decides, `ensureBossArenaSolvable` gets the last word — a boss arena with
 * nothing left to kill and no way to the exit is a dead run, so the key is guaranteed there
 * rather than here. Add new bosses to the branches below for the right drop in the right
 * place; the net is what makes a mistake in one survivable.
 */
function resolveBossDefeat(after: GameState, before: BossSnapshot): void {
  awardBossDefeat(after, before);
  ensureBossArenaSolvable(after);
}

/**
 * Is this enemy the fight itself — the thing whose death ends the arena?
 *
 * Keyed off BOSS_KINDS, the roster that already defines what a boss IS, rather than the
 * registry's `boss` flag: that flag was added for the Coilwyrm's regrow check and only ever
 * reached the two kinds that needed it, so the Fisher and Quarrymaster read as ordinary
 * enemies through it. Anything that asks "is the boss dead" and gets that wrong pays out
 * mid-fight or not at all, so the question is asked in exactly one place.
 *
 * `bodyPart` comes along for segmented bosses: a headless length of Coilwyrm is still the boss,
 * and it is registry-driven so the next segmented boss inherits this for free.
 */
function isBossPart(enemy: Enemy): boolean {
  if (BOSS_KINDS.includes(enemy.kind as BossKind)) return true;
  return Boolean(EnemyRegistry[enemy.kind]?.bodyPart);
}

/**
 * Last-resort guarantee: you killed everything in a boss arena, so the exit must be openable.
 *
 * The per-boss payouts above are precise — right drop, right tile, right turn — and precision
 * is exactly what leaks. It has already happened once: a Coilwyrm decapitated a turn earlier
 * left only body segments, so the turn they finally died had no head in the pre-turn snapshot
 * and the payout branch was skipped. The player had killed the boss and was sealed in the room
 * with no key and nothing left to hit — an unwinnable run with no way to tell it was a bug.
 *
 * So the invariant is enforced from the other end, where it does not depend on knowing which
 * kill path fired: in an arena, with no boss and no boss body still standing, if there is no
 * key on the floor and none in the pack, hand it over. Granted straight to the pack rather than
 * dropped as a tile because a drop still has to be walked onto, and the whole point here is that
 * nothing further is required of the player.
 *
 * Fires at most once per arena by construction — afterwards `hasExitKey` is set, and on the turn
 * it is spent the run is already leaving (win or floor transition, both excluded).
 *
 * `bossKind` is required alongside `inBossRoom` so this only ever speaks for a room the run
 * actually entered to fight something. Both are set together (enterBossRoom, endlessBossStateFor),
 * cleared together, and saved together, so requiring it costs nothing in real play — but a bare
 * arena built straight from a builder for a test harness has no boss to be owed a key for.
 */
function ensureBossArenaSolvable(after: GameState): void {
  if (!after.inBossRoom || !after.bossKind || after.hasExitKey) return;
  if (after.win || after.needsFloorTransition) return;
  if ((after.enemies ?? []).some(isBossPart)) return;
  let hasExit = false;
  for (const row of after.mapData.subtypes) {
    for (const cell of row) {
      if (cell.includes(TileSubtype.EXITKEY)) return; // reachable on the floor: nothing to do
      if (cell.includes(TileSubtype.EXIT)) hasExit = true;
    }
  }
  if (!hasExit) return; // no keyed door in here to be stuck behind
  after.hasExitKey = true;
  // The heart rides along: a payout this missed the key on missed the rest of the kill too.
  if (!after.bossDefeated) settleBossKill(after);
}

function awardBossDefeat(after: GameState, before: BossSnapshot): void {
  if (!after.inBossRoom || after.bossDefeated) return;
  const alive = after.enemies ?? [];
  // Prefer the recorded death tile; fall back to where it stood before the killing blow.
  const deathTile = (fallback: [number, number]): [number, number] => {
    const deaths = after.recentDeaths ?? [];
    return deaths.length > 0 ? deaths[deaths.length - 1] : fallback;
  };

  if (before.shaper && !alive.some((e) => e.kind === "shaper")) {
    const [ky, kx] = deathTile(before.shaper);
    const cell = after.mapData.subtypes[ky]?.[kx];
    if (cell && !cell.includes(TileSubtype.EXITKEY)) cell.push(TileSubtype.EXITKEY);
    settleBossKill(after);
    return;
  }

  if (before.fisher && !alive.some((e) => e.kind === "fisher")) {
    const [, kx] = deathTile(before.fisher);
    collapseFisherIntoBridge(after, kx);
    settleBossKill(after);
    return;
  }

  if (before.coilwyrm) {
    // The ONLY boss here whose "is it dead" test cannot just be "no enemy of that kind
    // remains". A Coilwyrm's body REGROWS a head, so between the blow that kills one and the
    // tick where the body promotes a replacement there is a turn with no coilwyrm in the array
    // at all — paying out there hands over the exit key mid-fight. Its body parts therefore
    // count as the boss still standing, which is correct for both endings: a body long enough
    // to promote produces a new head, and one too short marks itself severed and is reaped
    // within a tick. See isBossPart for what counts as still standing.
    if (alive.some(isBossPart)) return;
    const [ky, kx] = deathTile(before.coilwyrm);
    const cell = after.mapData.subtypes[ky]?.[kx];
    if (cell && !cell.includes(TileSubtype.EXITKEY)) cell.push(TileSubtype.EXITKEY);
    settleBossKill(after);
    return;
  }

  if (before.quarrymaster && !alive.some((e) => e.kind === "quarrymaster")) {
    const [ky, kx] = deathTile(before.quarrymaster);
    const cell = after.mapData.subtypes[ky]?.[kx];
    if (cell && !cell.includes(TileSubtype.EXITKEY)) cell.push(TileSubtype.EXITKEY);
    // His pods close with him — he is what held them open. Leaving them glowing after he
    // dies reads as "more is coming" during the walk back to the exit, which is the exact
    // opposite of what killing him should feel like.
    for (const row of after.mapData.subtypes) {
      for (let x = 0; x < row.length; x++) {
        const i = row[x].indexOf(TileSubtype.SPAWN_POD);
        if (i >= 0) row[x].splice(i, 1);
      }
    }
    settleBossKill(after);
  }
}

/**
 * Throw a pressure plate: latch the switch and retract every spike bed wired to it.
 *
 * Called both when the hero steps onto one and when a thrown rock lands on one — a rock has
 * weight, so it holds the plate down just as a boot does, and that is what lets a switch on
 * the far side of a crack be solved rather than merely looked at.
 *
 * The spikes sink into the ground and leave SPIKE_HOLES — bare sockets that are walkable and
 * purely cosmetic. Keeping a mark rather than reverting to clean floor means a thrown switch
 * is legible from across the room, which matters when the switches are far apart and the
 * player is being chased between them.
 *
 * The plate itself latches (PRESSURE_PLATE -> PRESSURE_PLATE_PRESSED) and is never re-armed:
 * the whole point of the mechanic is visible, banked progress toward the boss.
 *
 * Mutates in place; safe to call on a tile with no group wired to it (no-op).
 */
function pressPlate(
  state: { gateGroups?: GateGroup[]; switchGate?: DailySwitchGate },
  mapData: MapData,
  y: number,
  x: number,
  by: "rock" | "boot"
): void {
  const cell = mapData.subtypes[y]?.[x];
  if (cell) {
    const i = cell.indexOf(TileSubtype.PRESSURE_PLATE);
    if (i >= 0) cell[i] = TileSubtype.PRESSURE_PLATE_PRESSED;
  }
  // Record engagement with THE DAILY'S gate only, matched by plate coordinate. A daily run that
  // finds the floor-3 boss door presses up to four Quarrymaster plates, and those are the
  // arena's puzzle, not this feature — counting them would inflate every number in the report.
  const daily = state.switchGate;
  if (daily && !daily.thrownBy && daily.plate[0] === y && daily.plate[1] === x) {
    state.switchGate = { ...daily, thrownBy: by };
  }
  const group = state.gateGroups?.find(
    (g) => g.plate[0] === y && g.plate[1] === x && !g.open
  );
  if (!group) return;
  // Replace the array rather than flipping `open` in place: gateGroups is shared by
  // reference with the pre-move state (and with any checkpoint snapshot holding it), and
  // a mutated group would corrupt a restore.
  state.gateGroups = (state.gateGroups ?? []).map((g) =>
    g === group ? { ...g, open: true } : g
  );
  for (const [gy, gx] of group.gates) {
    const bed = mapData.subtypes[gy]?.[gx];
    if (!bed) continue;
    const i = bed.indexOf(TileSubtype.SPIKES);
    if (i >= 0) bed[i] = TileSubtype.SPIKE_HOLES;
  }
}

/**
 * Does taking the boss arena's exit END the run?
 *
 * In the DAILY it does: the arena is a secret room hidden off floor 3, and its exit is an
 * ALTERNATE ENDING — there is no floor after the boss, so walking out wins outright.
 *
 * In ENDLESS it does not. There the boss floor IS floor 6/12/18/... — the descent opens
 * straight into the arena with no entrance to find — so its exit is the stairs down like
 * any other floor's, and treating it as an ending would cash the whole run out at floor 6.
 */
function bossArenaEndsRun(state: GameState): boolean {
  return !!state.inBossRoom && state.mode !== "endless";
}

/** Step back onto the arrival tile inside a boss arena -> restore the saved floor. */
function returnFromBossRoom(
  state: GameState,
  direction: Direction
): GameState | null {
  const ret = state.bossReturn;
  if (!ret) return null;
  return {
    ...state,
    mapData: placePlayerAt(ret.mapData, ret.position),
    enemies: ret.enemies ? rehydrateEnemies(ret.enemies) : [],
    playerDirection: direction,
    inBossRoom: false,
    portalLocation: ret.portalLocation,
    bossReturn: undefined,
    recentDeaths: [],
    recentBombBlasts: [],
  };
}

// A "chase hit": the hero lands a clipping melee blow on a pink goblin that just fled
// from point-blank range. Pink goblins retreat when you're adjacent (see their behavior),
// vacating the tile before the hero's strike resolves — so a melee-only hero could chase
// one forever without connecting. This gives a determined chase a real-but-reduced chance
// to wound the fleer, tuned so a full-health pink goblin (4 HP) falls within ~5-10 tiles.
// Damage is floored to at least 1 so every landed hit makes progress. Records the death
// VFX at the goblin's CURRENT (fled-to) tile. Mirrors the melee block in movePlayerCore.
function applyHeroChaseHit(
  state: GameState,
  goblin: Enemy,
  rng: () => number
): void {
  const variance = ((r) => (r < 0.2 ? -1 : r < 0.6 ? 0 : 1))(rng());
  const swordBonus = state.hasSword ? 2 : 0;
  const raw = EnemyRegistry[goblin.kind].calcMeleeDamage({
    heroAttack: state.heroAttack,
    swordBonus,
    variance,
    memory: goblin.behaviorMemory,
    enemies: state.enemies,
  });
  const dmg = Math.max(1, raw);
  goblin.health -= dmg;
  state.stats.damageDealt += dmg;
  if (goblin.health <= 0) {
    cleanupPinkRing(goblin, state.mapData.subtypes);
    if (!state.defeatedEnemies) state.defeatedEnemies = [];
    const defeated = {
      y: goblin.y,
      x: goblin.x,
      kind: goblin.kind,
      behaviorMemory: goblin.behaviorMemory,
    };
    state.defeatedEnemies.push(defeated);
    const updated = processEnemyDefeat(state, defeated);
    Object.assign(state, updated);
    state.enemies = (state.enemies ?? []).filter((e) => e !== goblin);
    state.stats.enemiesDefeated += 1;
    state.stats.enemiesKilledBySword =
      (state.stats.enemiesKilledBySword ?? 0) + 1;
    trackEnemyKill(state.stats, goblin.kind as EnemyKind, state.currentFloor ?? 1);
    if (!state.recentDeaths) state.recentDeaths = [];
    state.recentDeaths.push([goblin.y, goblin.x]);
  }
}

// Lava that appears UNDER the hero (e.g. the Shaper's fire raining down onto the
// tile they're standing on) is lethal even without a step. Stepping onto lava is
// already fatal in the movement resolver; this catches lava that materialized
// beneath a hero who didn't move.
//
// This used to say "a living hero can only be on a lava tile if it spawned under them, so this
// never false-fires." MOVING_PLATFORM broke that: riding a slab means legitimately standing on a
// lava tile for several turns, and without the platform guard below this killed the hero on the
// very turn they boarded. Any future way of standing safely on lava has to be excused here too —
// the movement resolver's check is NOT the only one.
function killIfStandingOnLava(state: GameState): GameState {
  if (state.heroHealth <= 0) return state;
  const pos = findPlayerPosition(state.mapData);
  if (!pos) return state;
  const subs = state.mapData.subtypes[pos[0]]?.[pos[1]] ?? [];
  if (
    subs.includes(TileSubtype.LAVA) &&
    !subs.includes(TileSubtype.OBSIDIAN) &&
    !subs.includes(TileSubtype.MOVING_PLATFORM)
  ) {
    state.heroHealth = 0;
    if (!state.deathCause) state.deathCause = { type: "lava" };
  }
  return state;
}

export function movePlayer(
  gameState: GameState,
  direction: Direction
): GameState {
  // Resolve the move first, then detonate any armed bomb against the player's FINAL
  // position so stepping out of the 3x3 blast keeps the hero safe. (movePlayer never
  // places a bomb, so every BOMB_LIVE present was armed on a previous turn.) Skip
  // detonation on a floor transition — that floor is being replaced.
  // Snapshot boss positions BEFORE resolving the turn: movePlayerCore mutates the
  // enemies array in place, so after the call the pre-state no longer shows them.
  const bossesBefore = snapshotBosses(gameState);
  const result = movePlayerCore(gameState, direction);
  if (result.needsFloorTransition) return result;
  // Boss death payouts (Shaper's gold key / the Fisher collapsing into a bridge).
  resolveBossDefeat(result, bossesBefore);
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
  const detonated = killIfStandingOnLava(detonateLiveBombs(result));
  // Drift the pink mist one turn as the hero MOVES through the realm — only while already
  // in the realm (not the entry/exit turn) so the freshly-seeded cloud holds for a beat.
  // Standing actions (throwing, using items) blind mist-covered enemies but deliberately
  // don't shift the cloud; the hero stirs it by walking through it.
  if (gameState.inPinkRealm && detonated.inPinkRealm) {
    return withRewindStep(
      gameState,
      advanceWispTurn(gameState, {
        ...detonated,
        mist: advanceMist(detonated.mist ?? [], detonated.mapData),
      })
    );
  }
  return withRewindStep(gameState, advanceWispTurn(gameState, detonated));
}

/**
 * Record the pre-move world on the Amber Moth's ring buffer. Placed at the very end of
 * movePlayer so the snapshot is taken against the turn as it FINALLY resolved (post-bomb,
 * post-hazard, post-mist) — and so every rewind lands on a state the engine itself
 * produced. A no-op unless the hero is carrying a charge and actually took a step.
 */
function withRewindStep(before: GameState, after: GameState): GameState {
  const history = recordRewindStep(before, after);
  if (history === after.rewindHistory) return after;
  return { ...after, rewindHistory: history };
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

  // Stepping off the map edge from a breach tile leads to the outside world. Story mode
  // is excluded: its geography is authored rooms wired together by ROOM_TRANSITION, so a
  // bombed perimeter wall is just a hole in the wall — dropping the hero into a generated
  // grassland would strand them outside the story's room graph.
  if (
    gameState.mode !== "story" &&
    isSteppingThroughBreach(gameState, [currentY, currentX], direction, height, width)
  ) {
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

  // Stepping onto a boss-room entrance warps into the boss arena. A BOSS_ENTRANCE
  // (lockless cave mouth) always triggers; a DARK_PORTAL only triggers while the
  // hero's torch is OUT (it is invisible and inert in the light). Never re-triggers
  // once already inside a boss room.
  {
    const destTile = gameState.mapData.tiles[newY]?.[newX];
    const destSubs = gameState.mapData.subtypes[newY]?.[newX] ?? [];
    const onFloor = destTile === FLOOR || destTile === FLOWERS;
    if (gameState.inBossRoom) {
      // Inside the arena the arrival tile is the way back to the dungeon.
      if (onFloor && destSubs.includes(TileSubtype.BOSS_ENTRANCE)) {
        const back = returnFromBossRoom(gameState, direction);
        if (back) return back;
      }
    } else {
      if (onFloor && destSubs.includes(TileSubtype.BOSS_ENTRANCE)) {
        return enterBossRoom(gameState, [newY, newX], direction);
      }
      if (
        onFloor &&
        destSubs.includes(TileSubtype.DARK_PORTAL) &&
        gameState.heroTorchLit === false
      ) {
        return enterBossRoom(gameState, [newY, newX], direction);
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

  // Carried from the enemy tick to the melee block below (which lives outside the
  // enemy-turn `if`): who attacked, how much cap the tick already spent, and where every
  // enemy stood BEFORE it moved — the last one lets the melee resolver tell a "closing"
  // enemy (walked into the hero's path this turn) from one that was already adjacent.
  let enemyTurnDamageApplied = 0;
  let enemyAttacksThisTurn: EnemyAttackInfo[] = [];
  const prevEnemyPositions = new Map<Enemy, { y: number; x: number }>();

  // Tick enemies BEFORE resolving player movement so adjacent enemies can attack
  const playerPosNow = [currentY, currentX] as [number, number];
  // Predict where the hero will stand once this move resolves, so ranged attackers
  // (the pink goblin) can gate line-of-sight on the destination rather than the tile
  // the hero is leaving — the fix for "the beam fired through the wall as I rounded
  // the corner". We only trust the prediction for a clean walk onto an open floor tile
  // (nothing blocking, no occupant); anything ambiguous falls back to the current tile,
  // i.e. today's behavior, so there is no regression.
  const destTileForLos = newMapData.tiles[newY]?.[newX];
  const destSubsForLos = newMapData.subtypes[newY]?.[newX] ?? [];
  const destBlockedForLos =
    destSubsForLos.includes(TileSubtype.ROCK) ||
    destSubsForLos.includes(TileSubtype.POT) ||
    destSubsForLos.includes(TileSubtype.CHEST) ||
    destSubsForLos.includes(TileSubtype.BOOKSHELF);
  const destOccupiedForLos =
    (newGameState.enemies?.some((e) => e.y === newY && e.x === newX) ?? false) ||
    (newGameState.npcs?.some(
      (n) => n.y === newY && n.x === newX && !n.isDead()
    ) ?? false);
  const heroWillMove =
    (newY !== currentY || newX !== currentX) &&
    destTileForLos === FLOOR &&
    !destBlockedForLos &&
    !destOccupiedForLos;
  const playerNextPos = heroWillMove
    ? { y: newY, x: newX }
    : { y: currentY, x: currentX };
  // If this move lunges at an adjacent pink goblin, remember it: pink goblins flee
  // point-blank and vacate the tile before the strike resolves, so the normal melee
  // block below finds nothing. We roll a reduced chance to clip the fleer after the
  // enemy tick (see applyHeroChaseHit) so a melee chase can't go on forever.
  const chasedPinkGoblin =
    (newY !== currentY || newX !== currentX)
      ? newGameState.enemies?.find(
          (e) => e.y === newY && e.x === newX && e.kind === "pink-goblin"
        ) ?? null
      : null;
  if (newGameState.enemies && Array.isArray(newGameState.enemies)) {
    // Snapshot pre-move positions so the melee resolver can detect a "closing" enemy.
    for (const e of newGameState.enemies) prevEnemyPositions.set(e, { y: e.y, x: e.x });
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
        playerNext: playerNextPos,
        // Pink mist blinds enemies standing in it (no move/attack) — EXCEPT pink goblins,
        // which instead shuffle one tile toward the nearest clear tile (handled in their
        // behavior via the `mist` context below). The realm haze tiles are passed so that
        // behavior can see where the mist is.
        skipEnemy: mistBlindSkip(gameState, true),
        mist: gameState.mist,
        // Retreat parting shot: an adjacent enemy the hero steps away from (any direction,
        // not just directly-away) used to have its attack fully cancelled — the free retreat
        // that let a player kite anything to death. Now it lands a reduced-chance parting hit
        // instead. Stepping INTO the enemy to strike it is unchanged: that enemy still gets its
        // full swing (toe-to-toe is the riskiest option). Snakes always bite when adjacent, and
        // non-adjacent (e.g. ranged) attacks are never suppressed here.
        suppress: (e: Enemy) => {
          const adj = Math.abs(e.y - currentY) + Math.abs(e.x - currentX) === 1;
          if (!adj) return false;
          const attackingThisEnemy = newY === e.y && newX === e.x;
          if (attackingThisEnemy) return false;
          if (e.kind === "snake") return false;
          // Bosses keep their own bespoke anti-kite tuning (the Coilwyrm's split-on-cut, the
          // Fisher's spike moat, ...) and their deterministic policy sims, so leave them on the
          // original rule: a retreat is only free when moving directly away, never a parting
          // shot. The general risk is for ordinary enemies — the ones the kite exploit trivialized.
          if (isBossPart(e)) {
            const dy = newY - currentY;
            const dx = newX - currentX;
            const movingAway =
              (dy !== 0 && Math.sign(dy) === Math.sign(currentY - e.y)) ||
              (dx !== 0 && Math.sign(dx) === Math.sign(currentX - e.x));
            return movingAway;
          }
          const rng = newGameState.combatRng ?? Math.random;
          // Suppress (the enemy misses) unless the parting-shot roll connects.
          return rng() >= RETREAT_PARTING_HIT_CHANCE;
        },
      }
    );
    // Transient: expose this tick's attacks for render-layer VFX (pink beam etc.)
    newGameState.recentEnemyAttacks = result.attackingEnemies;
    enemyAttacksThisTurn = result.attackingEnemies ?? [];
    if (result.damage > 0) {
      const applied = Math.min(perTurnDamageCap(newGameState), result.damage);
      enemyTurnDamageApplied = applied;
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
    onTurnElapsed(newGameState);

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

  // Pink-goblin chase hit: if the goblin we lunged at fled its tile during the enemy
  // turn (rather than getting cornered and zapping from it), roll a reduced chance to
  // clip it as it scrambles away. If it stayed put, the normal melee block below hits it.
  if (
    chasedPinkGoblin &&
    (newGameState.enemies?.includes(chasedPinkGoblin) ?? false) &&
    !(chasedPinkGoblin.y === newY && chasedPinkGoblin.x === newX)
  ) {
    const chaseRng = newGameState.combatRng ?? Math.random;
    const CHASE_HIT_CHANCE = 0.5;
    if (chaseRng() < CHASE_HIT_CHANCE) {
      applyHeroChaseHit(newGameState, chasedPinkGoblin, chaseRng);
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
      endTurn(newGameState);
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
        const isFinalFloor = currentFloor >= maxFloors || bossArenaEndsRun(newGameState);

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
      endTurn(newGameState);
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

    // A bed of spikes is an ABSOLUTE barrier, not a survivable toll: the hero shoves
    // into it, takes a scratch, and does not move. Unlike lava (which kills but is
    // still *entered*), spikes can never be crossed at any HP — that is what lets an
    // outdoor arena put the boss permanently out of melee reach. Rocks still fly over
    // it, because the throw scan only stops on non-FLOOR tiles and this is an overlay.
    if (subtype.includes(TileSubtype.SPIKES)) {
      applyHeroDamage(newGameState, SPIKES_BUMP_DAMAGE);
      newGameState.stats = {
        ...newGameState.stats,
        damageTaken: newGameState.stats.damageTaken + SPIKES_BUMP_DAMAGE,
      };
      if (newGameState.heroHealth <= 0 && !newGameState.deathCause) {
        newGameState.deathCause = { type: "spikes" };
      }
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
      } else if (
        subtype.includes(TileSubtype.MED) ||
        subtype.includes(TileSubtype.FOOD)
      ) {
        // A pot whose contents are written INTO the tile (`[POT, MED]`), the same way snake
        // and rune pots already work. Preferred over the potOverrides side table whenever a
        // level needs a guaranteed drop: the guarantee travels with the map, so a state
        // clone, a room transition or a save/restore can't silently turn it back into a
        // food/potion coin flip. Just drop the POT tag and leave the contents.
        newMapData.subtypes[newY][newX] = newMapData.subtypes[newY][newX].filter(
          (t) => t !== TileSubtype.POT
        );
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
        const isFinalFloor = currentFloor >= maxFloors || bossArenaEndsRun(newGameState);

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
          // Multi-part bosses gate on the struck part's role and on whether its other
          // parts still stand (the Coilwyrm's tail-only cuts and armored head).
          memory: enemy.behaviorMemory,
          enemies: newGameState.enemies,
        });
        try { /* debug log removed */ } catch {}
        enemy.health -= heroDamage;
        newGameState.stats.damageDealt += heroDamage;

        // Flame transfer: striking a torch-carrying enemy at melee range relights
        // the hero's snuffed torch, same as brushing a wall torch. Applies whether
        // the blow kills or not — the flame is caught in the exchange. Exception:
        // a hero swimming in deep water can't catch a flame (melee resolves in
        // place, so the hero is still in the water).
        if (
          !newGameState.heroTorchLit &&
          EnemyRegistry[enemy.kind]?.carriesTorch &&
          !(newGameState.mapData.subtypes[currentY]?.[currentX] ?? []).includes(
            TileSubtype.DEEP_WATER
          )
        ) {
          newGameState.heroTorchLit = true;
        }

        // Closing-enemy counter (anti-kite): a struck enemy that walked into the hero's
        // path THIS turn — it wasn't already adjacent, and it spent its move closing rather
        // than attacking — used to eat the hero's blow for free (the one-tile-gap exploit).
        // Now that clash carries a chance it lands a hit too. A killing blow avoids the
        // counter (the enemy is cut down mid-lunge), so one-shotting weak enemies stays safe
        // while a tanky one like a stone goblin, which survives the hero's chip damage, bites
        // back. Already-adjacent enemies are handled by the enemy turn (they got their swing),
        // and a blinded/suppressed one never counts as "closing" since it couldn't move here.
        if (enemy.health > 0) {
          const prev = prevEnemyPositions.get(enemy);
          const wasAdjacentBefore =
            !!prev &&
            Math.abs(prev.y - currentY) + Math.abs(prev.x - currentX) === 1;
          const attackedThisTurn = enemyAttacksThisTurn.some(
            (a) => a.y === enemy.y && a.x === enemy.x
          );
          // Bosses are exempt (see the suppress hook): their fights are tuned and sim-tested
          // on their own terms, so the general closing-counter does not apply to them.
          const isClosingEnemy =
            !wasAdjacentBefore && !attackedThisTurn && !isBossPart(enemy);
          if (isClosingEnemy && rng() < CLOSE_IN_COUNTER_CHANCE) {
            const defense = newGameState.hasShield ? 1 : 0;
            const remainingCap = Math.max(
              0,
              perTurnDamageCap(newGameState) - enemyTurnDamageApplied
            );
            const counter = Math.min(
              remainingCap,
              enemyContactDamage(enemy, rng, defense)
            );
            if (counter > 0) {
              applyHeroDamage(newGameState, counter);
              newGameState.stats.damageTaken += counter;
              enemyTurnDamageApplied += counter;
              // Tutorial guardrail: mirror the enemy-turn floor (never die in the tutorial).
              if (newGameState.mode === "tutorial" && newGameState.heroHealth < 1) {
                newGameState.heroHealth = 1;
              }
              // Surface the counter to the render layer so the hit is visible.
              newGameState.recentEnemyAttacks = [
                ...(newGameState.recentEnemyAttacks ?? []),
                {
                  kind: enemy.kind,
                  damage: counter,
                  y: enemy.y,
                  x: enemy.x,
                  ranged: false,
                },
              ];
              // A closing snake still delivers venom.
              if (enemy.kind === "snake") {
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
              }
              if (newGameState.heroHealth <= 0 && !newGameState.deathCause) {
                newGameState.deathCause = { type: "enemy", enemyKind: enemy.kind };
              }
            }
          }
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

    // If it's an item revealed from a chest (SWORD/SHIELD/...), pick it up on entry
    // but ONLY if the tile no longer has a CHEST (i.e., after it's been opened).
    //
    // This block MUST stay AFTER the combat branch above, alongside the KEY/EXITKEY
    // pickups. Combat returns early (the hero never enters an enemy-occupied tile), and
    // that early return skips the item-tag clearing at the end of the move. Run this
    // before combat and an enemy standing on an opened chest's loot turns every melee
    // swing into another pickup: the tag survives, so the item is re-granted and
    // re-recorded on each hit — a duplicated `chestItemsCollected` entry for the boolean
    // items, and stacking +1 max HP / +3 bombs for EXTRA_HEART and BOMB.
    if (
      (subtype.includes(TileSubtype.SWORD) ||
        subtype.includes(TileSubtype.SHIELD) ||
        subtype.includes(TileSubtype.SNAKE_MEDALLION) ||
        subtype.includes(TileSubtype.EXTRA_HEART) ||
        subtype.includes(TileSubtype.PINK_HEART) ||
        subtype.includes(TileSubtype.AMBER_MOTH) ||
        subtype.includes(TileSubtype.BOMB)) &&
      !subtype.includes(TileSubtype.CHEST)
    ) {
      // Record exactly which chest item this was (in pickup order) for analytics.
      const collectedNow: string[] = [];
      if (subtype.includes(TileSubtype.BOMB)) collectedNow.push("bomb");
      if (subtype.includes(TileSubtype.SWORD)) collectedNow.push("sword");
      if (subtype.includes(TileSubtype.SHIELD)) collectedNow.push("shield");
      if (subtype.includes(TileSubtype.SNAKE_MEDALLION)) collectedNow.push("snake_medallion");
      if (subtype.includes(TileSubtype.EXTRA_HEART)) collectedNow.push("extra_heart");
      if (subtype.includes(TileSubtype.PINK_HEART)) collectedNow.push("pink_heart");
      if (subtype.includes(TileSubtype.AMBER_MOTH)) collectedNow.push("amber_moth");
      if (collectedNow.length > 0) {
        newGameState.stats.chestItemsCollected = [
          ...(newGameState.stats.chestItemsCollected ?? []),
          ...collectedNow,
        ];
      }
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
      if (subtype.includes(TileSubtype.AMBER_MOTH)) {
        // Two rewinds, spendable manually or automatically on death. The ring buffer only
        // starts recording once a charge is held (see recordRewindStep), so the charm can
        // never wind back past the moment it was picked up.
        newGameState.rewindCharges = (newGameState.rewindCharges ?? 0) + 2;
        newGameState.stats.itemsCollected = (newGameState.stats.itemsCollected ?? 0) + 1;
      }
      // Clearing of item happens below when we set dest tile subtypes
    }

    // Lava is instant death on entry — a glowing wall, not a survivable toll. This check
    // sits AFTER the combat branch above (gotcha: the FAULTY_FLOOR block runs BEFORE combat):
    // attacking a stone goblin standing on lava must resolve melee in place, and the hero never
    // actually enters an enemy-occupied tile, so combat returns first and we only reach here when
    // the destination lava tile is empty. OBSIDIAN (a rock-cooled lava tile) is safe and does not
    // trigger this. The tile keeps its LAVA tag (kept alive by the coexist whitelist below) so the
    // hero is rendered sinking on the glowing tile.
    // A MOVING_PLATFORM overhead makes the tile safe exactly as OBSIDIAN does. The LAVA tag
    // stays put, so the tile still glows and still kills the moment the slab moves on.
    if (
      subtype.includes(TileSubtype.LAVA) &&
      !subtype.includes(TileSubtype.OBSIDIAN) &&
      !tileIsPlatformed(newMapData, newY, newX)
    ) {
      newGameState.heroHealth = 0;
      if (!newGameState.deathCause) newGameState.deathCause = { type: "lava" };
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

    // If it's a pressure plate, throw it: the switch latches down for good and every
    // cage gate in its group drops to bare floor. Like the lightswitch, the plate stays
    // on the tile and coexists with the player (it just changes to the pressed art).
    if (subtype.includes(TileSubtype.PRESSURE_PLATE)) {
      pressPlate(newGameState, newMapData, newY, newX, "boot");
    }

    // A toggle switch is thrown the same way but never latches — see throwToggle. A colour switch
    // shares the same tile but TURNS its colour instead of flipping, so dispatch on which system
    // owns this position. Spike beds either can raise can crush an enemy standing on one, which is
    // why the enemy list is passed in.
    if (subtype.includes(TileSubtype.TOGGLE_SWITCH)) {
      const occ = new Set((newGameState.enemies ?? []).map((e) => `${e.y},${e.x}`));
      const { crushed } = isColorSwitch(newGameState, newY, newX)
        ? turnColorSwitch(newGameState, newY, newX, occ)
        : throwToggle(newGameState, newY, newX, occ);
      killEnemiesAt(newGameState, crushed);
    }

    // A CODE_TORCH is a cipher-room legend sconce (lib/map/cipher_room.ts). Stepping onto it with a lit
    // torch ignites it, revealing that switch's target colour; unlit it shows nothing, so lighting the
    // row is what makes the code readable. Lit state lives on the owning ColorLock's legend. Rebuilt
    // immutably (newGameState is only a shallow copy of gameState, so its colorLocks are still shared).
    if (subtype.includes(TileSubtype.CODE_TORCH) && newGameState.heroTorchLit) {
      newGameState.colorLocks = (newGameState.colorLocks ?? []).map((lock) => {
        const i = lock.legend?.torches.findIndex(([ty, tx]) => ty === newY && tx === newX) ?? -1;
        if (i < 0 || !lock.legend || lock.legend.lit[i]) return lock;
        const lit = lock.legend.lit.slice();
        lit[i] = true;
        return { ...lock, legend: { ...lock.legend, lit } };
      });
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
      // Pressure plates are floor switches the hero stands ON to hold/throw them.
      destSubtypes.includes(TileSubtype.PRESSURE_PLATE) ||
      destSubtypes.includes(TileSubtype.PRESSURE_PLATE_PRESSED) ||
      // A toggle stays on its tile so it can be thrown again — that is the whole difference
      // from a latching plate. The slab and its track decal are floor the hero stands on.
      destSubtypes.includes(TileSubtype.TOGGLE_SWITCH) ||
      // A code torch is a walkable floor sconce — the hero passes over it (and lights it doing so).
      destSubtypes.includes(TileSubtype.CODE_TORCH) ||
      destSubtypes.includes(TileSubtype.MOVING_PLATFORM) ||
      destSubtypes.includes(TileSubtype.PLATFORM_TRACK) ||
      // Retracted spike beds are walkable floor decals. Without this the hero standing on
      // one replaces the tile's subtypes with just PLAYER, so the sockets are erased for
      // good the first time anyone walks the opened lane — the mark that records a thrown
      // switch would vanish exactly when the player used it.
      destSubtypes.includes(TileSubtype.SPIKE_HOLES) ||
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
      destSubtypes.includes(TileSubtype.OPEN_ABYSS) ||
      // Lava (the hero dies on it but is rendered on the glowing tile) and obsidian
      // (a walkable rock-cooled crossing) are floor overlays the player stands on.
      destSubtypes.includes(TileSubtype.LAVA) ||
      destSubtypes.includes(TileSubtype.OBSIDIAN) ||
      // Water tiers (wade shallow, swim deep) and stepping stones (a rock dropped
      // into deep water) are floor overlays the player stands on.
      destSubtypes.includes(TileSubtype.SHALLOW_WATER) ||
      destSubtypes.includes(TileSubtype.DEEP_WATER) ||
      destSubtypes.includes(TileSubtype.STEPPING_STONE) ||
      // Boss entrances are floor overlays: a BOSS_ENTRANCE always warps before we
      // get here, but a DARK_PORTAL walked over in the light is inert and must be
      // preserved (not wiped) so it still works once the torch goes out.
      destSubtypes.includes(TileSubtype.BOSS_ENTRANCE) ||
      destSubtypes.includes(TileSubtype.DARK_PORTAL)
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
        (t === TileSubtype.SWORD || t === TileSubtype.SHIELD || t === TileSubtype.SNAKE_MEDALLION || t === TileSubtype.EXTRA_HEART || t === TileSubtype.BOMB || t === TileSubtype.PINK_HEART || t === TileSubtype.AMBER_MOTH) &&
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

    // Relight from lava: ending a move anywhere inside a lava tile's glow is close
    // enough to bend over and dip the torch in. The glow octagon (lib/torch_glow.ts —
    // the same area the render layer lights) is symmetric, so "hero inside a lava
    // tile's glow" is equivalent to "a lava tile inside the octagon around the hero".
    if (!newGameState.heroTorchLit) {
      const glowArea = computeTorchGlow(newY, newX, newMapData.tiles);
      for (const key of glowArea.keys()) {
        const [ly, lx] = key.split(",").map(Number);
        if (newMapData.subtypes[ly]?.[lx]?.includes(TileSubtype.LAVA)) {
          newGameState.heroTorchLit = true;
          break;
        }
      }
    }

    // The torch cannot burn while swimming: ending a move in DEEP water snuffs it and
    // overrides every relight source above (wall torches, lava glow) until the hero is
    // back on land. Stepping stones and shallow water are dry enough — no snuff, and neither
    // is a MOVING_PLATFORM: the hero is riding ON the water, not in it. That matters more than
    // it sounds, because a lit torch is what keeps a douse-day portal shut and what several
    // enemy kinds react to — a slab crossing has to be a real alternative to swimming, not the
    // same toll with extra steps.
    if (
      newMapData.subtypes[newY]?.[newX]?.includes(TileSubtype.DEEP_WATER) &&
      !tileIsPlatformed(newMapData, newY, newX)
    ) {
      newGameState.heroTorchLit = false;
    }
  }

  // Enemies have already been updated at the start of this turn
  // Increment steps if a move occurred
  if (moved) {
    endTurn(newGameState);
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
