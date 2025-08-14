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

  constructor(pos: { y: number; x: number }) {
    this.y = pos.y;
    this.x = pos.x;
  }

  update(ctx: EnemyUpdateContext) {
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
        if (isFloor(grid, ny, nx) && !wouldCollideWithPlayer) {
          this.y = ny;
          this.x = nx;
          break;
        }
      }
    } else {
      // Keep IDLE for now; we'll expand later (e.g., patrol)
      this.state = EnemyState.IDLE;
    }
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
  player: { y: number; x: number }
): void {
  for (const e of enemies) {
    e.update({ grid, player });
  }
}
