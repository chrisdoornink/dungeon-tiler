import { canSee } from "./line_of_sight";

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

  constructor(pos: { y: number; x: number }) {
    this.y = pos.y;
    this.x = pos.x;
  }

  update(ctx: EnemyUpdateContext): number {
    const { grid, player } = ctx;
    const sees = canSee(grid, [this.y, this.x], [player.y, player.x]);
    if (sees) {
      this.state = EnemyState.HUNTING;
      // Take one greedy step toward the player, without walking through walls.
      const dyRaw = player.y - this.y;
      const dxRaw = player.x - this.x;
      const stepY = dyRaw === 0 ? 0 : dyRaw > 0 ? 1 : -1;
      const stepX = dxRaw === 0 ? 0 : dxRaw > 0 ? 1 : -1;

      // Prefer horizontal movement when on same row, or generally attempt horizontal first
      const tryMoves: Array<[number, number]> = [];
      if (stepX !== 0) tryMoves.push([0, stepX]);
      if (stepY !== 0) tryMoves.push([stepY, 0]);

      for (const [dy, dx] of tryMoves) {
        const ny = this.y + dy;
        const nx = this.x + dx;
        // Do not move onto the player's tile; skip if would collide
        const wouldCollideWithPlayer = ny === player.y && nx === player.x;
        if (wouldCollideWithPlayer) {
          // Attack the player instead of moving
          // Face toward the player even if not moving
          if (Math.abs(dxRaw) >= Math.abs(dyRaw)) {
            this.facing = dxRaw > 0 ? 'RIGHT' : 'LEFT';
          } else {
            this.facing = dyRaw > 0 ? 'DOWN' : 'UP';
          }
          return this.attack;
        }
        if (isFloor(grid, ny, nx) && !wouldCollideWithPlayer) {
          // Update facing based on chosen step
          if (dx !== 0) this.facing = dx > 0 ? 'RIGHT' : 'LEFT';
          else if (dy !== 0) this.facing = dy > 0 ? 'DOWN' : 'UP';
          this.y = ny;
          this.x = nx;
          break;
        }
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
  for (const e of enemies) {
    const base = e.update({ grid, player });
    // Optionally suppress this enemy's attack for this tick
    if (base > 0 && !suppress?.(e)) {
      const variance = rng ? ((r => (r < 1/3 ? -1 : r < 2/3 ? 0 : 1))(rng())) : 0;
      const effective = Math.max(0, base + variance - defense);
      totalDamage += effective;
    }
  }
  return totalDamage;
}
