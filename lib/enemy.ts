import { canSee } from "./line_of_sight";
import { EnemyRegistry, BehaviorContext } from "./enemies/registry";

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
  player: { y: number; x: number };
  ghosts?: Array<{ y: number; x: number }>;
};

export class Enemy {
  y: number;
  x: number;
  state: EnemyState = EnemyState.IDLE;
  health: number = 5; // Goblin base health aligned with hero baseline
  attack: number = 1; // Goblin base attack
  // Simple facing state without importing Direction to avoid circular deps
  // Allowed values: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
  facing: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT' = 'DOWN';
  // Basic species/kind classification for behavior and rendering tweaks
  // 'goblin' default; 'ghost' steals the hero's light when adjacent; 'stone-exciter' special hunter; 'snake' poisons
  private _kind: 'goblin' | 'ghost' | 'stone-exciter' | 'snake' = 'goblin';
  // Per-enemy memory bag for registry-driven behaviors
  private _behaviorMem: Record<string, unknown> = {};
  get behaviorMemory(): Record<string, unknown> { return this._behaviorMem; }
  get kind(): 'goblin' | 'ghost' | 'stone-exciter' | 'snake' { return this._kind; }
  set kind(k: 'goblin' | 'ghost' | 'stone-exciter' | 'snake') {
    this._kind = k;
    if (k === 'ghost') {
      // Ghosts are fragile and do not deal contact damage.
      // Set HP to 2 and ensure attack is 0 so they never hurt the hero directly.
      if (this.health > 2) this.health = 2;
      this.attack = 0;
    } else if (k === 'stone-exciter') {
      // Stone-exciter uses fixed 5 damage when contacting the hero
      this.attack = 5;
      // Stone-exciter durability tuning: 8 HP baseline
      this.health = 8;
    } else if (k === 'snake') {
      // Snake baseline per registry: low HP, light attack
      if (this.health > 2) this.health = 2;
      this.attack = 1;
    }
  }
  // Pursuit memory: how many ticks to keep chasing after losing LOS
  private pursuitTtl: number = 0;
  // Last known player position when LOS was available
  private lastKnownPlayer: { y: number; x: number } | null = null;

  constructor(pos: { y: number; x: number }) {
    this.y = pos.y;
    this.x = pos.x;
  }

  update(ctx: EnemyUpdateContext): number {
    const { grid, subtypes, player } = ctx;
    // Default to IDLE this tick; we'll promote to HUNTING if we see/move/attack
    this.state = EnemyState.IDLE;
    // Reset moved flag each tick; UI may use this for sprite selection
    try { (this.behaviorMemory as Record<string, unknown>)["moved"] = false; } catch {}
    // Vision check: limit by distance for all enemies; LOS required for non-ghosts.
    const distManhattan = Math.abs(player.y - this.y) + Math.abs(player.x - this.x);
    const withinRange = distManhattan <= ENEMY_VISION_RADIUS;
    // Ghosts can see through walls (ignore LOS) but still obey range.
    const seesNow = withinRange && (this.kind === 'ghost' ? true : canSee(grid, [this.y, this.x], [player.y, player.x]));

    // Update pursuit memory
    if (seesNow) {
      this.pursuitTtl = ENEMY_PURSUIT_TTL; // refresh memory window
      this.lastKnownPlayer = { y: player.y, x: player.x };
    } else if (this.pursuitTtl > 0 && this.lastKnownPlayer) {
      this.pursuitTtl -= 1;
    }

    const hasPursuitTarget = seesNow || (this.pursuitTtl > 0 && this.lastKnownPlayer !== null);
    const targetPos = seesNow ? player : (this.lastKnownPlayer as { y: number; x: number } | null);

    if (hasPursuitTarget && targetPos) {
      // Take one greedy step toward the target, biasing to retain line-of-sight when we currently see them.
      const dyRaw = targetPos.y - this.y;
      const dxRaw = targetPos.x - this.x;
      const stepY = dyRaw === 0 ? 0 : dyRaw > 0 ? 1 : -1;
      const stepX = dxRaw === 0 ? 0 : dxRaw > 0 ? 1 : -1;

      // Always face toward the target when pursuing, even if we cannot move this tick
      if (Math.abs(dxRaw) >= Math.abs(dyRaw)) {
        this.facing = dxRaw > 0 ? 'RIGHT' : (dxRaw < 0 ? 'LEFT' : this.facing);
      } else {
        this.facing = dyRaw > 0 ? 'DOWN' : (dyRaw < 0 ? 'UP' : this.facing);
      }

      // Candidate moves toward the target
      const candMoves: Array<[number, number]> = [];
      if (stepX !== 0) candMoves.push([0, stepX]);
      if (stepY !== 0) candMoves.push([stepY, 0]);

      // Determine move ordering
      let tryMoves: Array<[number, number]> = [];
      if (seesNow) {
        // Prefer moves that preserve LOS after moving
        const losPreserving: Array<[number, number]> = [];
        const nonLos: Array<[number, number]> = [];
        for (const [dy, dx] of candMoves) {
          const ny = this.y + dy;
          const nx = this.x + dx;
          if (isSafeFloorForEnemy(grid, subtypes, ny, nx, this.kind)) {
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
        const canAnyMove = tryMoves.some(([dy, dx]) => isSafeFloorForEnemy(grid, subtypes, this.y + dy, this.x + dx, this.kind));
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
          console.log(`[ENEMY ATTACK] ${this.kind} at (${this.y},${this.x}) attacking player at (${player.y},${player.x}) - distance: ${Math.abs(this.y - player.y) + Math.abs(this.x - player.x)}, base damage: ${this.attack}`);
          return this.attack;
        }
        if (isSafeFloorForEnemy(grid, subtypes, ny, nx, this.kind)) {
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
              console.log(`[ENEMY ATTACK] Ghost ${this.kind} at (${this.y},${this.x}) attacking player at (${player.y},${player.x}) after phasing - distance: ${Math.abs(this.y - player.y) + Math.abs(this.x - player.x)}, base damage: ${this.attack}`);
              return this.attack;
            }
            if (isSafeFloorForEnemy(grid, subtypes, ty, tx, this.kind)) {
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
      // Keep IDLE for now; we'll expand later (e.g., patrol)
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
};

function isFloor(grid: number[][], y: number, x: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length && grid[y][x] === 0;
}

function isInBounds(grid: number[][], y: number, x: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

function isWall(grid: number[][], y: number, x: number): boolean {
  return isInBounds(grid, y, x) && grid[y][x] === 1; // WALL id from map.ts
}

// Variant that allows per-enemy rules: ghosts can traverse faulty floors.
function isSafeFloorForEnemy(
  grid: number[][],
  subtypes: number[][][] | undefined,
  y: number,
  x: number,
  kind: 'goblin' | 'ghost' | 'stone-exciter' | 'snake'
): boolean {
  if (!isInBounds(grid, y, x)) return false;
  if (kind === 'ghost') {
    // Ghosts can occupy floor or wall tiles
    return isFloor(grid, y, x) || isWall(grid, y, x);
  }
  // Non-ghosts: must be a floor and not faulty
  if (!isFloor(grid, y, x)) return false;
  if (!subtypes) return true;
  const tileSubs = subtypes[y]?.[x] || [];
  const isFaulty = tileSubs.includes(18);
  return !isFaulty;
}

export function placeEnemies(args: PlaceEnemiesArgs): Enemy[] {
  const { grid, player, count, minDistanceFromPlayer = 2, rng = Math.random } = args;
  const h = grid.length;
  const w = grid[0]?.length ?? 0;

  const candidates: Array<{ y: number; x: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isFloor(grid, y, x)) continue;
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
  y: number;
  x: number;
  kind?: 'goblin' | 'ghost' | 'stone-exciter' | 'snake';
  _kind?: 'goblin' | 'ghost' | 'stone-exciter' | 'snake';
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
    const e = new Enemy({ y: Number(d?.y ?? 0), x: Number(d?.x ?? 0) });
    // Kind setter applies any stat adjustments; prefer public kind, else serialized private _kind
    const k = d?.kind ?? d?._kind;
    if (k === 'ghost' || k === 'stone-exciter' || k === 'goblin' || k === 'snake') {
      e.kind = k;
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
export function updateEnemies(
  grid: number[][],
  enemies: Enemy[],
  player: { y: number; x: number },
  opts?: {
    rng?: () => number;
    defense?: number;
    suppress?: (e: Enemy) => boolean;
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
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
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
  }
): { damage: number; attackingEnemies: Array<{ kind: string; damage: number }> };
export function updateEnemies(
  grid: number[][],
  subtypesOrEnemies: number[][][] | Enemy[],
  enemiesOrPlayer?: Enemy[] | { y: number; x: number },
  playerOrOpts?: { y: number; x: number } | {
    rng?: () => number;
    defense?: number;
    suppress?: (e: Enemy) => boolean;
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
  },
  opts?: {
    rng?: () => number;
    defense?: number;
    suppress?: (e: Enemy) => boolean;
    playerTorchLit?: boolean;
    setPlayerTorchLit?: (lit: boolean) => void;
  }
): number | { damage: number; attackingEnemies: Array<{ kind: string; damage: number }> } {
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
  let totalDamage = 0;
  const attackingEnemies: Array<{ kind: string; damage: number }> = [];
  // Do not auto-relight the torch each tick; torch state persists unless changed by hooks
  // Track occupied tiles this tick to prevent overlaps; start with current positions
  const occupied = new Set<string>(enemies.map((e) => `${e.y},${e.x}`));
  // Precompute ghost positions for context
  const ghostPositions = enemies.filter(e => e.kind === 'ghost').map(e => ({ y: e.y, x: e.x }));
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const prevKey = `${e.y},${e.x}`;
    const prevY = e.y;
    const prevX = e.x;
    // Delegate to registry customUpdate when available (e.g., stone-exciter)
    const cfg = EnemyRegistry[e.kind];
    let base: number;
    if (cfg?.behavior?.customUpdate) {
      const enemyCtx: BehaviorContext['enemy'] = {
        y: e.y,
        x: e.x,
        facing: e.facing,
        memory: e.behaviorMemory,
        attack: e.attack,
      };
      base = cfg.behavior.customUpdate({
        grid,
        enemies: enemies.map(en => ({ y: en.y, x: en.x, kind: en.kind, health: en.health })),
        enemyIndex: i,
        player: { y: player.y, x: player.x, torchLit: opts?.playerTorchLit ?? true },
        ghosts: ghostPositions,
        rng,
        setPlayerTorchLit: opts?.setPlayerTorchLit,
        enemy: enemyCtx,
      });
      // Write back any mutations from customUpdate
      e.y = enemyCtx.y;
      e.x = enemyCtx.x;
      e.facing = enemyCtx.facing;
      const mem = enemyCtx.memory as { exciterState?: 'HUNTING' | 'IDLE' };
      if (mem.exciterState) {
        e.state = mem.exciterState === 'HUNTING' ? EnemyState.HUNTING : EnemyState.IDLE;
      }
    } else {
      base = e.update({ grid, subtypes, player, ghosts: ghostPositions });
    }
    // If moved, validate occupancy (cannot occupy another enemy's tile)
    const newKey = `${e.y},${e.x}`;
    if (newKey !== prevKey) {
      if (occupied.has(newKey)) {
        // Revert move; keep this enemy at previous position
        e.y = prevY;
        e.x = prevX;
      } else {
        // Reserve new tile and release old
        occupied.delete(prevKey);
        occupied.add(newKey);
      }
    }
    // Optionally suppress this enemy's attack for this tick
    if (base > 0 && !suppress?.(e)) {
      // Variance: goblins mirror hero damage spread (-1/0/+1). Other enemies keep 25% crit (+2).
      let variance = 0;
      let rVal: number | null = null;
      if (rng) {
        rVal = rng();
        if (e.kind === 'goblin') {
          variance = rVal < 1/3 ? -1 : rVal < 2/3 ? 0 : 1;
        } else {
          variance = rVal >= 0.75 ? 2 : rVal < 1/3 ? -1 : rVal < 2/3 ? 0 : 1;
        }
      }
      const effective = Math.max(0, base + variance - defense);
      // debug log removed
      totalDamage += effective;
      
      // Track attacking enemies for condition application
      if (effective > 0) {
        attackingEnemies.push({ kind: e.kind, damage: effective });
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
    if (isAdjacent && e.kind === 'ghost' && opts?.setPlayerTorchLit) {
      opts.setPlayerTorchLit(false);
    }
  }

  // Backward-compatible return: if called with old signature, return the damage number
  if (usingOldSignature) {
    return totalDamage;
  }
  return { damage: totalDamage, attackingEnemies };
}
