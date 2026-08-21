import { canSee } from "./line_of_sight";
import { EnemyRegistry, BehaviorContext, type EnemyKind } from "./enemies/registry";
import { orderPursuitSteps } from "./enemies/pursuit";
import { COILWYRM_HEAD_ATTACK, COILWYRM_HEAD_HP, COILWYRM_SEGMENT_HP } from "./bosses/coilwyrm";
import { QUARRYMASTER_HP, QUARRYMASTER_ATTACK } from "./bosses/quarrymaster";

export const ENEMY_PURSUIT_TTL = 5;
// Maximum vision radius for enemies, measured in Manhattan distance.
// Matches HUD proximity (8 tiles) so enemies don't aggro before you can see them.
export const ENEMY_VISION_RADIUS = 8;

export enum EnemyState {
  IDLE = "IDLE",
  HUNTING = "HUNTING",
}

export type EnemyUpdateContext = {
  grid: number[][];
  subtypes?: number[][][];
  // torchLit drives torch-snuff stealth: when false, most enemies cannot acquire
  // the hero (see the vision check in Enemy.update).
  player: { y: number; x: number; torchLit?: boolean };
  ghosts?: Array<{ y: number; x: number }>;
  // Optional RNG (0..1) used for unpredictable pursuit-axis selection. Defaults
  // to Math.random when omitted (matching runtime combat variance behavior).
  rng?: () => number;
};

// Monotonic + random suffix so ids never collide within or across sessions.
// Presentation-only identity (the render layer tracks enemies across turns to
// animate movement); NOT part of game logic and never touches lib/rng.ts, so
// daily-seed determinism is unaffected.
let nextEnemyIdSeq = 0;
function generateEnemyId(): string {
  nextEnemyIdSeq += 1;
  return `en-${nextEnemyIdSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class Enemy {
  // Stable identity across turns and serialization (see generateEnemyId).
  id: string;
  y: number;
  x: number;
  state: EnemyState = EnemyState.IDLE;
  health: number = 5; // Goblin base health aligned with hero baseline
  // Tracks each enemy's actual max HP (kind baseline, or a spawn-time override like the
  // pink-realm white-goblin buff) so HUD hearts scale correctly instead of reading the
  // static per-kind registry value.
  maxHealth: number = 5;
  attack: number = 1; // Goblin base attack
  // Simple facing state without importing Direction to avoid circular deps
  // Allowed values: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
  facing: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT' = 'DOWN';
  // Basic species/kind classification for behavior and rendering tweaks
  // 'fire-goblin' default; 'ghost' steals the hero's light when adjacent; 'stone-goblin' special hunter; 'snake' poisons
  private _kind: EnemyKind = 'fire-goblin';
  // Per-enemy memory bag for registry-driven behaviors
  private _behaviorMem: Record<string, unknown> = {};
  get behaviorMemory(): Record<string, unknown> { return this._behaviorMem; }
  get kind(): EnemyKind { return this._kind; }
  set kind(k: EnemyKind) {
    this._kind = k;
    if (k === 'ghost') {
      // Ghosts are fragile and do not deal contact damage.
      // Set HP to 2 and ensure attack is 0 so they never hurt the hero directly.
      if (this.health > 2) this.health = 2;
      this.attack = 0;
    } else if (k === 'stone-goblin') {
      // Stone-exciter uses fixed 5 damage when contacting the hero
      this.attack = 5;
      // Stone-exciter durability tuning: 8 HP baseline
      this.health = 8;
    } else if (k === 'fire-goblin') {
      this.health = 4;
      this.attack = 1;
    } else if (k === 'water-goblin') {
      // Water goblin: same HP as before, lower attack without spear
      this.attack = 1;
    } else if (k === 'water-goblin-spear') {
      // Water goblin with spear: similar to hero with sword (+1)
      this.attack = 3;
    } else if (k === 'earth-goblin') {
      // Earth goblin: low HP, base attack
      this.health = 3;
      this.attack = 1;
    } else if (k === 'earth-goblin-knives') {
      // Earth goblin with knives: low HP, high attack
      this.health = 3;
      this.attack = 2;
    } else if (k === 'pink-goblin') {
      // Pink goblin: moderate HP, low melee attack, has ranged attack + teleport
      this.health = 4;
      this.attack = 1;
    } else if (k === 'snake') {
      // Snake baseline per registry: low HP, light attack
      if (this.health > 2) this.health = 2;
      this.attack = 1;
    } else if (k === 'white-goblin') {
      // White goblin swarm member: very fragile, light attack. Pink-realm swarms are
      // buffed at spawn by overriding .health directly (see buildPinkRealmEnemies), which
      // also updates maxHealth so the HUD reflects the buffed baseline.
      this.health = 1;
      this.attack = 1;
    } else if (k === 'shaper') {
      // The Shaper boss: low HP (reaching it is the challenge, not out-damaging
      // it). attack 0 — it never deals contact damage; its weapon is the terrain
      // it reshapes. Melee against it uses the standard formula (see registry).
      this.health = 5;
      this.attack = 0;
    } else if (k === 'coilwyrm') {
      // Coilwyrm head: the only part that bites. Two hits kill it (a flat
      // COILWYRM_HEADSHOT_DAMAGE per blow, see the registry gate), but a body of
      // COILWYRM_SPLIT_MIN or more behind it just grows a replacement.
      this.health = COILWYRM_HEAD_HP;
      this.attack = COILWYRM_HEAD_ATTACK;
    } else if (k === 'coilwyrm-coil') {
      // A body segment: a moving wall. Deals no damage; every segment is cuttable.
      this.health = COILWYRM_SEGMENT_HP;
      this.attack = 0;
    } else if (k === 'fisher') {
      // The Fisher boss: unreachable by design, so its HP is denominated in THROWN
      // ROCKS (2 damage each) — 8 is exactly four clean hits. attack 2 is its spear,
      // which only lands on a telegraphed lane you failed to step out of.
      this.health = 8;
      this.attack = 2;
    } else if (k === 'quarrymaster') {
      // The Quarrymaster boss: deliberately no tougher than a spear goblin. The fight
      // is his summons and his crumbling floor, not his statline — once you are through
      // the cage gates and standing next to him he goes down in a few swings.
      this.health = QUARRYMASTER_HP;
      this.attack = QUARRYMASTER_ATTACK;
    }
    this.maxHealth = this.health;
  }
  // Pursuit memory: how many ticks to keep chasing after losing LOS
  private pursuitTtl: number = 0;
  // Last known player position when LOS was available
  private lastKnownPlayer: { y: number; x: number } | null = null;

  constructor(pos: { y: number; x: number; id?: string }) {
    this.y = pos.y;
    this.x = pos.x;
    this.id = pos.id ?? generateEnemyId();
  }

  update(ctx: EnemyUpdateContext): number {
    const { grid, subtypes, player } = ctx;
    // Default to IDLE this tick; we'll promote to HUNTING if we see/move/attack
    this.state = EnemyState.IDLE;
    // Reset moved flag each tick; UI may use this for sprite selection
    try { (this.behaviorMemory as Record<string, unknown>)["moved"] = false; } catch {}
    // Vision check: limit by distance for all enemies; LOS required for non-ghosts.
    const distManhattan = Math.abs(player.y - this.y) + Math.abs(player.x - this.x);
    // Torch-snuff stealth: a hero whose torch is out is invisible to most enemies —
    // they can't ACQUIRE the hero (existing pursuit memory still plays out, so
    // snuffing mid-chase means "break contact and slip away", not instant amnesia).
    // Fire goblins carry their own light and still hunt, but one tile shorter since
    // the hero's flame isn't there to spot. Ghosts sense the hero regardless (they
    // are the torch-snuffers; hiding from them with their own trick would be free).
    const torchLit = player.torchLit ?? true;
    const visionRadius =
      torchLit || this.kind === 'ghost'
        ? ENEMY_VISION_RADIUS
        : this.kind === 'fire-goblin'
        ? ENEMY_VISION_RADIUS - 1
        : 0;
    const withinRange = distManhattan <= visionRadius;
    // Ghosts can see through walls (ignore LOS) but still obey range.
    const seesNow = withinRange && (this.kind === 'ghost' ? true : canSee(grid, [this.y, this.x], [player.y, player.x]));

    // Update pursuit memory
    if (seesNow) {
      this.pursuitTtl = ENEMY_PURSUIT_TTL; // refresh memory window
      this.lastKnownPlayer = { y: player.y, x: player.x };
      // Once a static guard (e.g. the floor-3 exit-key guard) spots the player it
      // stops holding its post and behaves like a normal goblin thereafter.
      if (this.behaviorMemory["isGuard"] === true) {
        this.behaviorMemory["guardWoke"] = true;
      }
    } else if (this.pursuitTtl > 0 && this.lastKnownPlayer) {
      this.pursuitTtl -= 1;
    }

    const hasPursuitTarget = seesNow || (this.pursuitTtl > 0 && this.lastKnownPlayer !== null);
    const targetPos = seesNow ? player : (this.lastKnownPlayer as { y: number; x: number } | null);

    if (hasPursuitTarget && targetPos) {
      // Take one greedy step toward the target, biasing to retain line-of-sight when we currently see them.
      const dyRaw = targetPos.y - this.y;
      const dxRaw = targetPos.x - this.x;

      // Always face toward the target when pursuing, even if we cannot move this tick
      if (Math.abs(dxRaw) >= Math.abs(dyRaw)) {
        this.facing = dxRaw > 0 ? 'RIGHT' : (dxRaw < 0 ? 'LEFT' : this.facing);
      } else {
        this.facing = dyRaw > 0 ? 'DOWN' : (dyRaw < 0 ? 'UP' : this.facing);
      }

      // Candidate moves toward the target. Bias toward the axis with the
      // larger remaining gap, but randomize the choice so enemies cannot be
      // read with certainty (no more "always close the column first").
      const rng = ctx.rng ?? Math.random;
      const candMoves: Array<[number, number]> = orderPursuitSteps(dyRaw, dxRaw, rng);

      // Determine move ordering
      let tryMoves: Array<[number, number]> = [];
      if (seesNow) {
        // Prefer moves that preserve LOS after moving
        const losPreserving: Array<[number, number]> = [];
        const nonLos: Array<[number, number]> = [];
        for (const [dy, dx] of candMoves) {
          const ny = this.y + dy;
          const nx = this.x + dx;
          if (isSafeFloorForEnemy(grid, subtypes, ny, nx, this.kind, true)) {
            if (canSee(grid, [ny, nx], [player.y, player.x])) losPreserving.push([dy, dx]);
            else nonLos.push([dy, dx]);
          }
        }
        // Keep original bias (horizontal-first) within each bucket
        tryMoves = [...losPreserving, ...nonLos];
      } else {
        // Memory pursuit: only try the primary axis step; if blocked, give up
        tryMoves = candMoves.slice(0, 1);
      }

      // In memory mode, if the primary step is not walkable, drop pursuit immediately
      if (!seesNow) {
        const canAnyMove = tryMoves.some(([dy, dx]) => isSafeFloorForEnemy(grid, subtypes, this.y + dy, this.x + dx, this.kind, true));
        if (!canAnyMove) {
          this.pursuitTtl = 0;
          this.state = EnemyState.IDLE;
          return 0;
        }
      }

      let moved = false;
      for (const [dy, dx] of tryMoves) {
        const ny = this.y + dy;
        const nx = this.x + dx;
        // Do not move onto the player's tile; skip if would collide
        const wouldCollideWithPlayer = ny === player.y && nx === player.x;
        if (wouldCollideWithPlayer) {
          // Attack the player instead of moving
          // Facing was already aligned above
          this.state = EnemyState.HUNTING;
          return this.attack;
        }
        if (isSafeFloorForEnemy(grid, subtypes, ny, nx, this.kind, true)) {
          // Update facing based on chosen step
          if (dx !== 0) this.facing = dx > 0 ? 'RIGHT' : 'LEFT';
          else if (dy !== 0) this.facing = dy > 0 ? 'DOWN' : 'UP';
          this.y = ny;
          this.x = nx;
          moved = true;
          try { (this.behaviorMemory as Record<string, unknown>)["moved"] = true; } catch {}
          break;
        }
        // Ghosts can phase through walls: continue along axis until next floor tile
        if (this.kind === 'ghost' && (dy !== 0 || dx !== 0)) {
          let ty = ny;
          let tx = nx;
          // advance along same axis until a floor is found or out of bounds
          while (ty >= 0 && ty < grid.length && tx >= 0 && tx < grid[0].length) {
            // stop if we reach the player's tile; treat as attack opportunity
            if (ty === player.y && tx === player.x) {
              if (Math.abs(dxRaw) >= Math.abs(dyRaw)) {
                this.facing = dxRaw > 0 ? 'RIGHT' : 'LEFT';
              } else {
                this.facing = dyRaw > 0 ? 'DOWN' : 'UP';
              }
              // End adjacent to the player (at the tile just before the player's tile)
              // so proximity hooks (e.g., torch snuff) can trigger this tick.
              const adjY = ty - dy;
              const adjX = tx - dx;
              if (isSafeFloorForEnemy(grid, subtypes, adjY, adjX, this.kind)) {
                this.y = adjY;
                this.x = adjX;
              }
              this.state = EnemyState.HUNTING;
              return this.attack;
            }
            if (isSafeFloorForEnemy(grid, subtypes, ty, tx, this.kind, true)) {
              if (dx !== 0) this.facing = dx > 0 ? 'RIGHT' : 'LEFT';
              else if (dy !== 0) this.facing = dy > 0 ? 'DOWN' : 'UP';
              this.y = ty;
              this.x = tx;
              // moved successfully through walls
              moved = true;
              try { (this.behaviorMemory as Record<string, unknown>)["moved"] = true; } catch {}
              break;
            }
            // continue stepping through walls
            ty += dy;
            tx += dx;
          }
          // if we moved, break out of tryMoves loop
          if (moved) break;
        }
      }
      // Decide state after attempting action
      if (seesNow || moved) this.state = EnemyState.HUNTING;
      else {
        // If we failed to move while only pursuing memory (not currently seeing), drop pursuit
        this.pursuitTtl = 0;
        this.state = EnemyState.IDLE;
      }
    } else {
      // Idle goblins have a 50% chance to wander randomly each turn.
      // Static guards (e.g. the floor-3 exit-key guard) hold their post and do NOT
      // wander until they have seen the player at least once (guardWoke).
      const isGoblin = this.kind !== 'ghost' && this.kind !== 'snake' && this.kind !== 'white-goblin';
      const isStaticGuard =
        this.behaviorMemory["isGuard"] === true && this.behaviorMemory["guardWoke"] !== true;
      if (isGoblin && !isStaticGuard && Math.random() < 0.5) {
        const dirs: Array<[number, number, 'UP'|'RIGHT'|'DOWN'|'LEFT']> = [
          [-1, 0, 'UP'], [1, 0, 'DOWN'], [0, -1, 'LEFT'], [0, 1, 'RIGHT'],
        ];
        // Shuffle directions
        for (let i = dirs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        for (const [dy, dx, face] of dirs) {
          const ny = this.y + dy;
          const nx = this.x + dx;
          if (ny === player.y && nx === player.x) continue;
          if (isSafeFloorForEnemy(grid, subtypes, ny, nx, this.kind, false)) {
            this.y = ny;
            this.x = nx;
            this.facing = face;
            try { (this.behaviorMemory as Record<string, unknown>)["moved"] = true; } catch {}
            break;
          }
        }
      }
      this.state = EnemyState.IDLE;
    }
    return 0;
  }
}

export type PlaceEnemiesArgs = {
  grid: number[][];
  player: { y: number; x: number };
  count: number;
  minDistanceFromPlayer?: number;
  rng?: () => number; // 0..1
  // Per-tile subtype stacks. When provided, tiles carrying a lethal/blocking hazard
  // (open abyss, faulty floor, lava) are excluded as spawn candidates. Long-standing
  // bug: without this, enemies could spawn directly ON an abyss/faulty tile (rare at
  // 2 faulty tiles/floor, common once lava adds 6-12 hazard tiles) — a free turn-1 kill
  // or an enemy standing in instant-death terrain.
  subtypes?: number[][][];
};

// Subtypes that make a floor tile an illegal spawn location (lethal, blocking, or
// terrain a randomly-assigned kind might not be able to leave/survive — enemy kinds
// are assigned AFTER placement, so water tiles could hand a pink goblin an instant
// death or strand a non-swimmer).
const SPAWN_BLOCKING_SUBTYPES = new Set<number>([
  18, // FAULTY_FLOOR
  51, // OPEN_ABYSS
  58, // SHALLOW_WATER
  59, // DEEP_WATER
  60, // LAVA
  66, // SPIKES (impassable — an enemy spawned here could never leave)
]);

function isFloor(grid: number[][], y: number, x: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length && (grid[y][x] === 0 || grid[y][x] === 5);
}

function isInBounds(grid: number[][], y: number, x: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

function isWall(grid: number[][], y: number, x: number): boolean {
  return isInBounds(grid, y, x) && grid[y][x] === 1; // WALL id from map.ts
}

// Variant that allows per-enemy rules: ghosts can traverse faulty floors.
// Goblins avoid FAULTY_FLOOR when patrolling but not when chasing.
// All enemies always avoid OPEN_ABYSS.
/**
 * Which enemy kinds will board (and be carried by) a moving platform.
 *
 * Excluded, by request: GHOSTS (they float over everything and pass through walls — a deck is
 * meaningless to them), PINK GOBLINS (water is lethal to them and they retreat rather than
 * commit), and SNAKES (they won't swim and don't chase like goblins). Everything else — the
 * fire/water/earth goblin family, stone and white goblins — rides. Bosses never reach this path.
 */
export function enemyCanRidePlatforms(kind: string): boolean {
  return kind !== "ghost" && kind !== "pink-goblin" && kind !== "snake";
}

function isSafeFloorForEnemy(
  grid: number[][],
  subtypes: number[][][] | undefined,
  y: number,
  x: number,
  kind: EnemyKind,
  isChasing: boolean = false
): boolean {
  if (!isInBounds(grid, y, x)) return false;
  if (kind === 'ghost') {
    // Ghosts can occupy floor or wall tiles
    return isFloor(grid, y, x) || isWall(grid, y, x);
  }
  // Non-ghosts: must be a floor
  if (!isFloor(grid, y, x)) return false;
  if (!subtypes) return true;
  const tileSubs = subtypes[y]?.[x] || [];
  // A MOVING_PLATFORM deck is solid ground: an enemy that rides platforms may board it even
  // though the tile beneath is lava or deep water. This is what lets a goblin chase the hero onto
  // a raft. Kinds that never ride (ghosts float, pink goblins die on water contact, snakes won't)
  // fall through to the normal hazard checks and refuse it. See enemyCanRidePlatforms.
  if (tileSubs.includes(73) && enemyCanRidePlatforms(kind)) return true; // MOVING_PLATFORM
  const isFaulty = tileSubs.includes(18); // FAULTY_FLOOR
  const isOpenAbyss = tileSubs.includes(51); // OPEN_ABYSS
  const isLava = tileSubs.includes(60); // LAVA (instant-death terrain)
  const isSpikes = tileSubs.includes(66); // SPIKES (impassable to every entity)
  const isShallowWater = tileSubs.includes(58); // SHALLOW_WATER (wadeable shoreline)
  const isDeepWater = tileSubs.includes(59); // DEEP_WATER (swimmers only)
  // Check for blocking subtypes (torches on floor, town signs, checkpoints, bookshelves)
  const hasBlockingSubtype = tileSubs.includes(16) || // WALL_TORCH (used for floor torches too)
                              tileSubs.includes(37) || // TOWN_SIGN
                              tileSubs.includes(22) || // CHECKPOINT
                              tileSubs.includes(36);   // BOOKSHELF

  // Always avoid open abysses. A crack that has already given way is a visible hole, and
  // nothing walks into one on purpose — falling in is what FAULTY_FLOOR is for (a chasing
  // goblin steps on the hidden crack, it opens, and thereafter everyone routes around it).
  if (isOpenAbyss) return false;

  // Lava is a lethal, obvious wall: unlike hidden faulty cracks, no goblin ever walks
  // into it (not even when chasing). Only the stone goblin crosses it freely.
  if (isLava && kind !== 'stone-goblin') return false;

  // A bed of spikes is a wall for everything, with no exception — it is the outdoor
  // world's hard barrier (see TileSubtype.SPIKES), and the Fisher's arena depends on it
  // holding in BOTH directions: the hero can't cross to the boss, and nothing the boss
  // throws over can wander back. Without this, snakes would slither across it freely
  // (spikes are a FLOOR overlay, so the base-grid check waves them through).
  if (isSpikes) return false;

  // Shallow water is wadeable, but not by everyone: fire goblins won't risk their
  // torch near water at all; knife-throwers keep their blades dry; white goblins
  // stay on land and funnel around pools; pink goblins die on contact with any
  // water (kryptonite — see applyEnemyHazardDeaths). Waders: water goblins (both
  // kinds), the unencumbered earth goblin, snakes, and stone goblins.
  if (isShallowWater) {
    const wades =
      kind === 'water-goblin' ||
      kind === 'water-goblin-spear' ||
      kind === 'earth-goblin' ||
      kind === 'snake' ||
      kind === 'stone-goblin';
    if (!wades) return false;
  }

  // Deep water takes real swimmers: water goblins (both kinds, the spearman swims
  // weapon and all) and the unencumbered earth goblin. Stone goblins sink (they
  // only cross deep water on stepping stones — which then sink under their weight,
  // see applyEnemyHazardDeaths); snakes won't swim; everyone else refuses.
  // (Ghosts never reach here — they float over everything via the early return.)
  if (isDeepWater) {
    const swims =
      kind === 'water-goblin' ||
      kind === 'water-goblin-spear' ||
      kind === 'earth-goblin';
    if (!swims) return false;
  }

  // Goblins avoid faulty floors when patrolling, but can step on them when chasing
  const isGoblin = kind === 'fire-goblin' || kind === 'water-goblin' || kind === 'water-goblin-spear' || 
                   kind === 'earth-goblin' || kind === 'earth-goblin-knives' || kind === 'pink-goblin' || 
                   kind === 'stone-goblin' || kind === 'white-goblin';
  
  if (isFaulty) {
    // Goblins can step on faulty floors only when chasing
    if (isGoblin && isChasing) {
      // Allow goblins to step on faulty floors when chasing
    } else {
      // All other cases: avoid faulty floors (snakes always, goblins when patrolling)
      return false;
    }
  }
  
  return !hasBlockingSubtype;
}

export function placeEnemies(args: PlaceEnemiesArgs): Enemy[] {
  const { grid, player, count, minDistanceFromPlayer = 2, rng = Math.random, subtypes } = args;
  const h = grid.length;
  const w = grid[0]?.length ?? 0;

  const candidates: Array<{ y: number; x: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isFloor(grid, y, x)) continue;
      // Never spawn an enemy on a lethal/blocking hazard tile (abyss/faulty/lava).
      if (subtypes) {
        const subs = subtypes[y]?.[x];
        if (subs && subs.some((s) => SPAWN_BLOCKING_SUBTYPES.has(s))) continue;
      }
      const d = Math.hypot(y - player.y, x - player.x);
      if (d >= minDistanceFromPlayer) {
        candidates.push({ y, x });
      }
    }
  }

  const enemies: Enemy[] = [];
  const taken = new Set<string>();
  taken.add(`${player.y},${player.x}`);

  // Simple random selection without replacement
  for (let i = 0; i < count && candidates.length > 0; i++) {
    // pick index via rng
    const idx = Math.floor(rng() * candidates.length);
    const cand = candidates[idx];

    const key = `${cand.y},${cand.x}`;
    if (taken.has(key)) {
      // remove and continue
      candidates.splice(idx, 1);
      i--; // try again for same slot
      continue;
    }

    enemies.push(new Enemy({ y: cand.y, x: cand.x }));
    taken.add(key);
    candidates.splice(idx, 1);
  }

  return enemies;
}

// Rehydrate a list of plain enemy objects (e.g., from JSON) back into Enemy instances
export type PlainEnemy = {
  id?: string;
  y: number;
  x: number;
  kind?: EnemyKind;
  _kind?: EnemyKind;
  health?: number;
  attack?: number;
  facing?: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT';
  state?: EnemyState;
  behaviorMemory?: Record<string, unknown>;
  _behaviorMem?: Record<string, unknown>;
};

export function rehydrateEnemies(list: PlainEnemy[]): Enemy[] {
  if (!Array.isArray(list)) return [];
  return list.map((d: PlainEnemy) => {
    // Preserve the stable id when present (old saves without one get a fresh id).
    const e = new Enemy({
      y: Number(d?.y ?? 0),
      x: Number(d?.x ?? 0),
      id: typeof d?.id === "string" && d.id ? d.id : undefined,
    });
    // Kind setter applies any stat adjustments; prefer public kind, else serialized private _kind
    let k: string | undefined = d?.kind ?? d?._kind;
    // Migration: old saved games may have legacy kind names
    if (k === 'goblin') k = 'fire-goblin';
    if (k === 'stone-exciter') k = 'stone-goblin';
    // Validate against the registry rather than a hand-written list. The list version
    // silently dropped any kind nobody remembered to add to it — a rehydrated enemy would
    // come back as a default fire-goblin — and it needed editing for every new boss, which
    // is exactly what conflicted when the Fisher and the Quarrymaster landed together.
    if (k && Object.prototype.hasOwnProperty.call(EnemyRegistry, k)) {
      e.kind = k as EnemyKind;
    }
    // Preserve health/attack if present after kind effects
    if (typeof d?.health === 'number') e.health = d.health;
    if (typeof d?.attack === 'number') e.attack = d.attack;
    // Facing
    if (d?.facing === 'UP' || d?.facing === 'RIGHT' || d?.facing === 'DOWN' || d?.facing === 'LEFT') {
      e.facing = d.facing;
    }
    // State (best-effort)
    if (d?.state === EnemyState.HUNTING) e.state = EnemyState.HUNTING;
    else e.state = EnemyState.IDLE;
    // Behavior memory bag
    const mem = d?.behaviorMemory ?? d?._behaviorMem;
    if (mem && typeof mem === 'object') {
      // @ts-expect-error accessing private bag for rehydration
      e._behaviorMem = { ...mem };
    }
    return e;
  });
}

// Overloads for better type inference at call sites
// One enemy's attack this tick, with enough context for the render layer to
// draw attack effects (e.g. the pink goblin's ranged beam needs the attacker's
// post-move position and whether the hit came from range).
export type EnemyAttackInfo = {
  kind: string;
  damage: number;
  y: number;
  x: number;
  ranged: boolean;
};

// The +/- swing applied to an enemy's base attack, given a single rng roll in [0,1).
// Goblins (and the two bosses that share their feel) roll a gentle -1/0/+1 weighted
// toward their base; everything else can land a +2 crit. Extracted so the melee
// counter-hit in game-state (a closing enemy that clashes onto the hero's sword)
// uses the exact same model as the enemy turn — see updateEnemies below.
export function enemyAttackVariance(kind: EnemyKind, r: number): number {
  const goblinBucket =
    kind === "fire-goblin" ||
    kind === "water-goblin" ||
    kind === "water-goblin-spear" ||
    kind === "earth-goblin" ||
    kind === "earth-goblin-knives" ||
    kind === "pink-goblin" ||
    kind === "white-goblin" ||
    kind === "coilwyrm" ||
    kind === "quarrymaster";
  if (goblinBucket) return r < 0.4 ? -1 : r < 0.8 ? 0 : 1;
  return r >= 0.75 ? 2 : r < 1 / 3 ? -1 : r < 2 / 3 ? 0 : 1;
}

export function updateEnemies(
  grid: number[][],
  enemies: Enemy[],
  player: { y: number; x: number },
  opts?: {
    rng?: () => number;
    defense?: number;
    suppress?: (e: Enemy) => boolean;
    skipEnemy?: (e: Enemy) => boolean;
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
    mist?: Array<[number, number]>;
    // Hero's predicted end-of-turn tile (after their pending move resolves). Used
    // by ranged attackers to gate LOS so they can't fire at a hero rounding a corner.
    playerNext?: { y: number; x: number };
    // Tiles no enemy may end its tick on (Hearth & Home party allies). Purely
    // additive: absent everywhere except party scenes.
    blockedTiles?: Array<[number, number]>;
  }
): number;
export function updateEnemies(
  grid: number[][],
  subtypes: number[][][],
  enemies: Enemy[],
  player: { y: number; x: number },
  opts?: {
    rng?: () => number;
    defense?: number;
    suppress?: (e: Enemy) => boolean;
    skipEnemy?: (e: Enemy) => boolean;
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
    mist?: Array<[number, number]>;
    // Hero's predicted end-of-turn tile (after their pending move resolves). Used
    // by ranged attackers to gate LOS so they can't fire at a hero rounding a corner.
    playerNext?: { y: number; x: number };
    // Tiles no enemy may end its tick on (Hearth & Home party allies). Purely
    // additive: absent everywhere except party scenes.
    blockedTiles?: Array<[number, number]>;
  }
): { damage: number; attackingEnemies: EnemyAttackInfo[] };
export function updateEnemies(
  grid: number[][],
  subtypesOrEnemies: number[][][] | Enemy[],
  enemiesOrPlayer?: Enemy[] | { y: number; x: number },
  playerOrOpts?: { y: number; x: number } | {
    rng?: () => number;
    defense?: number;
    suppress?: (e: Enemy) => boolean;
    skipEnemy?: (e: Enemy) => boolean;
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
    mist?: Array<[number, number]>;
    // Hero's predicted end-of-turn tile (after their pending move resolves). Used
    // by ranged attackers to gate LOS so they can't fire at a hero rounding a corner.
    playerNext?: { y: number; x: number };
    // Tiles no enemy may end its tick on (Hearth & Home party allies). Purely
    // additive: absent everywhere except party scenes.
    blockedTiles?: Array<[number, number]>;
  },
  opts?: {
    rng?: () => number;
    defense?: number;
    suppress?: (e: Enemy) => boolean;
    skipEnemy?: (e: Enemy) => boolean;
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
    mist?: Array<[number, number]>;
    // Hero's predicted end-of-turn tile (after their pending move resolves). Used
    // by ranged attackers to gate LOS so they can't fire at a hero rounding a corner.
    playerNext?: { y: number; x: number };
    // Tiles no enemy may end its tick on (Hearth & Home party allies). Purely
    // additive: absent everywhere except party scenes.
    blockedTiles?: Array<[number, number]>;
  }
): number | { damage: number; attackingEnemies: EnemyAttackInfo[] } {
  // Handle backward compatibility: old signature was (grid, enemies, player, opts)
  let subtypes: number[][][] | undefined;
  let enemies: Enemy[];
  let player: { y: number; x: number };
  let finalOpts: typeof opts;

  const usingOldSignature = Array.isArray(subtypesOrEnemies) && subtypesOrEnemies.length > 0 && 'y' in subtypesOrEnemies[0];
  if (usingOldSignature) {
    // Old signature: updateEnemies(grid, enemies, player, opts)
    subtypes = undefined;
    enemies = subtypesOrEnemies as Enemy[];
    player = enemiesOrPlayer as { y: number; x: number };
    finalOpts = playerOrOpts as typeof opts;
  } else {
    // New signature: updateEnemies(grid, subtypes, enemies, player, opts)
    subtypes = subtypesOrEnemies as number[][][];
    enemies = enemiesOrPlayer as Enemy[];
    player = playerOrOpts as { y: number; x: number };
    finalOpts = opts;
  }
  const rng = finalOpts?.rng; // undefined means no variance
  const defense = finalOpts?.defense ?? 0;
  const suppress = finalOpts?.suppress;
  const skipEnemy = finalOpts?.skipEnemy;
  let totalDamage = 0;
  const attackingEnemies: EnemyAttackInfo[] = [];
  // Do not auto-relight the torch each tick; torch state persists unless changed by hooks
  // Track occupied tiles this tick to prevent overlaps; start with current positions
  const occupied = new Set<string>(enemies.map((e) => `${e.y},${e.x}`));
  // The hero's tile is reserved too: no enemy may ever END its tick on the player
  // (they attack from adjacent tiles instead). An enemy landing on the hero desyncs
  // entity vs. tile state and can strand the run — the pink goblin's ring teleport
  // once did exactly that.
  occupied.add(`${player.y},${player.x}`);
  // Party allies (Hearth & Home) are solid to enemies, exactly like the hero.
  for (const [by, bx] of finalOpts?.blockedTiles ?? []) {
    occupied.add(`${by},${bx}`);
  }
  // Boss adds — the summon channel (Quarrymaster hatches, Coilwyrm growth, ...).
  // Buffered rather than pushed straight onto `enemies`: the loop below captures its bound,
  // so an immediate push would let a newborn act on the very turn it appeared. Appended
  // after the loop, and always at the END so a follower can never tick ahead of the head
  // that steers it.
  const spawned: Enemy[] = [];
  // Tiles handed to a newborn this tick. A mover's old tile is normally released back into
  // `occupied` after its hook returns; if a spawn claimed it, that release must NOT
  // un-reserve it, or a later enemy stacks onto the newborn.
  const spawnClaimed = new Set<string>();
  // Whose hook is running, and where it started. This is what lets a behavior spawn into the
  // tile it is itself stepping out of — the Coilwyrm's tail sprouting a segment behind
  // itself. That tile is still in `occupied` at hook time (the release happens after the
  // hook returns), so without the exemption a "leave something behind me" spawn is always
  // refused and the coil cannot grow.
  let actor: { prevKey: string; ctx: BehaviorContext['enemy'] } | null = null;
  const spawnEnemy: NonNullable<BehaviorContext['spawnEnemy']> = (spec) => {
    const key = `${spec.y},${spec.x}`;
    const actorIsVacating =
      !!actor &&
      actor.prevKey === key &&
      `${actor.ctx.y},${actor.ctx.x}` !== actor.prevKey;
    // A summon may NOT land on the hero, a live enemy, or another newborn — unless it is
    // the caller's own tile and the caller is on its way out of it.
    if (occupied.has(key) && !actorIsVacating) return false;
    if (spawned.some((sp) => sp.y === spec.y && sp.x === spec.x)) return false;
    if (!isInBounds(grid, spec.y, spec.x)) return false;
    const born = new Enemy({ y: spec.y, x: spec.x });
    born.kind = spec.kind; // the kind setter applies that kind's HP/attack
    if (spec.memory) Object.assign(born.behaviorMemory, spec.memory);
    occupied.add(key);
    spawnClaimed.add(key);
    spawned.push(born);
    return true;
  };
  // Precompute ghost positions for context
  const ghostPositions = enemies.filter(e => e.kind === 'ghost').map(e => ({ y: e.y, x: e.x }));
  const initialCount = enemies.length;
  for (let i = 0; i < initialCount; i++) {
    const e = enemies[i];
    // Skip enemies marked for skip (e.g., about to die to a player's projectile this turn).
    // Skipped enemies do not move, attack, or trigger proximity hooks.
    if (skipEnemy?.(e)) continue;
    const prevKey = `${e.y},${e.x}`;
    const prevY = e.y;
    const prevX = e.x;
    // Delegate to registry customUpdate when available (e.g., stone-goblin)
    const cfg = EnemyRegistry[e.kind];
    let base: number;
    // Frozen enemies (e.g., the scripted tutorial ghost) do not move or attack
    // this tick, but they DO still run proximity hooks below — so a frozen
    // ghost can still snuff the torch when the player steps adjacent to it.
    const isFrozen =
      (e.behaviorMemory as Record<string, unknown> | undefined)?.["frozen"] === true;
    if (isFrozen) {
      base = 0;
    } else if (cfg?.behavior?.customUpdate) {
      const enemyCtx: BehaviorContext['enemy'] = {
        y: e.y,
        x: e.x,
        facing: e.facing,
        memory: e.behaviorMemory,
        attack: e.attack,
      };
      actor = { prevKey, ctx: enemyCtx };
      base = cfg.behavior.customUpdate({
        grid,
        subtypes,
        enemies: enemies.map(en => ({ y: en.y, x: en.x, kind: en.kind, health: en.health, behaviorMemory: en.behaviorMemory })),
        enemyIndex: i,
        // Read the NORMALIZED opts, not the raw 5th arg: under the legacy
        // 4-arg signature `opts` is undefined, which silently fed every
        // custom-update enemy `torchLit: true`. Snakes hunt on exactly this
        // flag (see the snake behavior in enemies/registry), so a stale `true`
        // there would quietly disable the mechanic.
        player: { y: player.y, x: player.x, torchLit: finalOpts?.playerTorchLit ?? true },
        playerNext: finalOpts?.playerNext,
        ghosts: ghostPositions,
        rng,
        setPlayerTorchLit: finalOpts?.setPlayerTorchLit,
        mist: finalOpts?.mist,
        spawnEnemy,
        enemy: enemyCtx,
      });
      actor = null;
      // Write back any mutations from customUpdate
      e.y = enemyCtx.y;
      e.x = enemyCtx.x;
      e.facing = enemyCtx.facing;
      const mem = enemyCtx.memory as {
        exciterState?: 'HUNTING' | 'IDLE';
        becomeKind?: EnemyKind;
      };
      if (mem.exciterState) {
        e.state = mem.exciterState === 'HUNTING' ? EnemyState.HUNTING : EnemyState.IDLE;
      }
      // Metamorphosis: a behavior can ask for its own kind to change (a severed length of
      // Coilwyrm growing its own head, a shelled boss cracking open). Applied here rather
      // than in the behavior because `kind` lives on the Enemy, not in the snapshot — and
      // the setter resets health/attack to the new kind's baseline, which is the point.
      if (mem.becomeKind && mem.becomeKind !== e.kind) {
        e.kind = mem.becomeKind;
        delete mem.becomeKind;
      }
    } else {
      base = e.update({
        grid,
        subtypes,
        player: { y: player.y, x: player.x, torchLit: finalOpts?.playerTorchLit ?? true },
        ghosts: ghostPositions,
        rng,
      });
    }
    // If moved, validate occupancy (cannot occupy another enemy's tile)
    const newKey = `${e.y},${e.x}`;
    if (newKey !== prevKey) {
      // White goblins can stack on the same tile as their swarm-mates
      const canStack = e.kind === 'white-goblin' && enemies.some((other, idx) => 
        idx !== i && 
        other.kind === 'white-goblin' && 
        other.y === e.y && 
        other.x === e.x &&
        other.behaviorMemory?.swarmId === e.behaviorMemory?.swarmId
      );
      
      if (occupied.has(newKey) && !canStack) {
        // Revert move; keep this enemy at previous position
        e.y = prevY;
        e.x = prevX;
      } else {
        // Reserve new tile and release old (white goblins can share tiles). A tile a
        // newborn claimed this tick stays reserved even though its former occupant left.
        if (!spawnClaimed.has(prevKey)) occupied.delete(prevKey);
        if (!canStack) occupied.add(newKey);
      }
    }
    // Optionally suppress this enemy's attack for this tick
    if (base > 0 && !suppress?.(e)) {
      // Variance: goblins weighted toward base damage (50% 0, 25% -1, 25% +1). Other enemies keep 25% crit (+2).
      // Both bosses sit in the goblin bucket deliberately (see enemyAttackVariance): the
      // 'other' branch hands out a 25% +2 crit. On the Coilwyrm's head that made its base-2
      // bite roll 4 — the entire per-turn cap — so two bites killed a full-health hero with
      // no tell; there it reads 1-3 and a bite is a mistake you can survive learning from.
      // The Quarrymaster is meant to hit like a spear goblin, and the crit would make him
      // spikier than his design brief allows.
      const variance = rng ? enemyAttackVariance(e.kind, rng()) : 0;
      const effective = Math.max(0, base + variance - defense);
      // debug log removed
      totalDamage += effective;
      
      // Track attacking enemies for condition application and attack VFX
      // (post-move position; ranged when the hit landed from beyond melee).
      if (effective > 0) {
        attackingEnemies.push({
          kind: e.kind,
          damage: effective,
          y: e.y,
          x: e.x,
          ranged: Math.abs(e.y - player.y) + Math.abs(e.x - player.x) > 1,
        });
      }
    }

    // Proximity behavior hook (e.g., ghost snuff torch) based on post-move adjacency
    const isAdjacent = Math.abs(e.y - player.y) + Math.abs(e.x - player.x) === 1;
    if (cfg?.behavior?.onProximity && isAdjacent) {
      const playerTorchLit = finalOpts?.playerTorchLit ?? true;
      const setPlayerTorchLit = finalOpts?.setPlayerTorchLit;
      cfg.behavior.onProximity({
        grid,
        enemies: enemies.map(en => ({ y: en.y, x: en.x, kind: en.kind, health: en.health })),
        enemyIndex: i,
        player: { y: player.y, x: player.x, torchLit: playerTorchLit },
        ghosts: ghostPositions,
        rng,
        setPlayerTorchLit,
        enemy: {
          y: e.y,
          x: e.x,
          facing: e.facing,
          memory: e.behaviorMemory,
          attack: e.attack,
        },
      });
    }
    // Robust fallback: if a ghost is adjacent, ensure torch is snuffed regardless of hook wiring
    // (normalized opts, for the same reason as the customUpdate branch above)
    if (isAdjacent && e.kind === 'ghost' && finalOpts?.setPlayerTorchLit) {
      finalOpts.setPlayerTorchLit(false);
    }
  }

  // Newborns join the roster now that every existing enemy has taken its tick.
  if (spawned.length > 0) enemies.push(...spawned);

  // Backward-compatible return: if called with old signature, return the damage number
  if (usingOldSignature) {
    return totalDamage;
  }
  return { damage: totalDamage, attackingEnemies };
}
