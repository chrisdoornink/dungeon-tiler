import { canSee } from "./line_of_sight";

export const ENEMY_PURSUIT_TTL = 5;

export enum EnemyState {
  IDLE = "IDLE",
  HUNTING = "HUNTING",
}

export type EnemyUpdateContext = {
  grid: number[][];
  player: { y: number; x: number };
};

export class Enemy {
  y: number;
  x: number;
  state: EnemyState = EnemyState.IDLE;
  health: number = 3; // Goblin base health
  attack: number = 1; // Goblin base attack
  // Simple facing state without importing Direction to avoid circular deps
  // Allowed values: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
  facing: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT' = 'DOWN';
  // Basic species/kind classification for behavior and rendering tweaks
  // 'goblin' default; 'ghost' steals the hero's light when adjacent
  private _kind: 'goblin' | 'ghost' = 'goblin';
  get kind(): 'goblin' | 'ghost' { return this._kind; }
  set kind(k: 'goblin' | 'ghost') {
    this._kind = k;
    if (k === 'ghost') {
      // Ghosts are fragile: 2 HP. If currently higher (default 3), clamp to 2.
      if (this.health > 2) this.health = 2;
      // Keep attack as-is unless design says otherwise (currently 1)
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
    const { grid, player } = ctx;
    // Default to IDLE this tick; we'll promote to HUNTING if we see/move/attack
    this.state = EnemyState.IDLE;
    // Ghosts can see through walls; others use standard LOS
    const seesNow = this.kind === 'ghost'
      ? true
      : canSee(grid, [this.y, this.x], [player.y, player.x]);

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
          if (isFloor(grid, ny, nx)) {
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
        const canAnyMove = tryMoves.some(([dy, dx]) => isFloor(grid, this.y + dy, this.x + dx));
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
        if (isFloor(grid, ny, nx)) {
          // Update facing based on chosen step
          if (dx !== 0) this.facing = dx > 0 ? 'RIGHT' : 'LEFT';
          else if (dy !== 0) this.facing = dy > 0 ? 'DOWN' : 'UP';
          this.y = ny;
          this.x = nx;
          moved = true;
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
              this.state = EnemyState.HUNTING;
              return this.attack;
            }
            if (isFloor(grid, ty, tx)) {
              if (dx !== 0) this.facing = dx > 0 ? 'RIGHT' : 'LEFT';
              else if (dy !== 0) this.facing = dy > 0 ? 'DOWN' : 'UP';
              this.y = ty;
              this.x = tx;
              // moved successfully through walls
              moved = true;
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

export function updateEnemies(
  grid: number[][],
  enemies: Enemy[],
  player: { y: number; x: number },
  opts?: { rng?: () => number; defense?: number; suppress?: (e: Enemy) => boolean }
): number {
  const rng = opts?.rng; // undefined means no variance
  const defense = opts?.defense ?? 0;
  const suppress = opts?.suppress;
  let totalDamage = 0;
  // Track occupied tiles this tick to prevent overlaps; start with current positions
  const occupied = new Set<string>(enemies.map((e) => `${e.y},${e.x}`));
  for (const e of enemies) {
    const prevKey = `${e.y},${e.x}`;
    const prevY = e.y;
    const prevX = e.x;
    const base = e.update({ grid, player });
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
      const variance = rng
        ? ((r => (r >= 0.75 ? 2 : r < 1/3 ? -1 : r < 2/3 ? 0 : 1))(rng()))
        : 0;
      const effective = Math.max(0, base + variance - defense);
      totalDamage += effective;
    }
  }
  return totalDamage;
}
