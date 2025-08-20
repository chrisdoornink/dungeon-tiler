import { canSee } from "./line_of_sight";

export const ENEMY_PURSUIT_TTL = 5;

export enum EnemyState {
  IDLE = "IDLE",
  HUNTING = "HUNTING",
}

export type EnemyUpdateContext = {
  grid: number[][];
  player: { y: number; x: number };
  ghosts?: Array<{ y: number; x: number }>;
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
  // 'goblin' default; 'ghost' steals the hero's light when adjacent; 'stone-exciter' special hunter
  private _kind: 'goblin' | 'ghost' | 'stone-exciter' = 'goblin';
  get kind(): 'goblin' | 'ghost' | 'stone-exciter' { return this._kind; }
  set kind(k: 'goblin' | 'ghost' | 'stone-exciter') {
    this._kind = k;
    if (k === 'ghost') {
      // Ghosts are fragile: 2 HP. If currently higher (default 3), clamp to 2.
      if (this.health > 2) this.health = 2;
      // Keep attack as-is unless design says otherwise (currently 1)
    } else if (k === 'stone-exciter') {
      // Stone-exciter uses fixed 5 damage when contacting the hero
      this.attack = 5;
      // Stone-exciter durability tuning: 8 HP baseline
      this.health = 8;
    }
  }
  // Pursuit memory: how many ticks to keep chasing after losing LOS
  private pursuitTtl: number = 0;
  // Last known player position when LOS was available
  private lastKnownPlayer: { y: number; x: number } | null = null;
  // Stone-exciter internal counters
  private exciterHuntTurns: number = 0; // remaining double-move turns (5 when triggered)
  private exciterRequireOutOfRange: boolean = false; // after finishing, must get >4 away to retrigger

  constructor(pos: { y: number; x: number }) {
    this.y = pos.y;
    this.x = pos.x;
  }

  update(ctx: EnemyUpdateContext): number {
    const { grid, player } = ctx;
    // Default to IDLE this tick; we'll promote to HUNTING if we see/move/attack
    this.state = EnemyState.IDLE;
    // Stone-exciter behavior: blind wander; within 4 tiles hunts for 5 turns, double-steps (toward + perpendicular). Contact deals 5. After 5 turns, stop until out of range.
    if (this.kind === 'stone-exciter') {
      const dy = player.y - this.y;
      const dx = player.x - this.x;
      const dist = Math.abs(dy) + Math.abs(dx); // Manhattan trigger
      const ghostDist = Array.isArray(ctx.ghosts) && ctx.ghosts.length > 0
        ? Math.min(...ctx.ghosts.map(g => Math.abs(g.y - this.y) + Math.abs(g.x - this.x)))
        : Infinity;
      let startedThisTick = false;
      if (this.exciterHuntTurns <= 0) {
        if (!this.exciterRequireOutOfRange && (dist <= 4 || ghostDist <= 4)) {
          this.exciterHuntTurns = 5; // 5 turns of double steps
          startedThisTick = true;
        }
      }

      if (this.exciterHuntTurns > 0) {
        this.state = EnemyState.HUNTING;
        // Close-range special applies ONLY on the first tick we start hunting.
        // Otherwise use regular two-step movement without attacking during hunting.
        if (dist <= 2 && startedThisTick) {
          // Always face the hero while in close range
          if (Math.abs(dx) >= Math.abs(dy)) this.facing = dx > 0 ? 'RIGHT' : 'LEFT';
          else this.facing = dy > 0 ? 'DOWN' : 'UP';
          // Step 1 toward hero
          let stepsTaken = 0;
          const toward1: [number, number] = Math.abs(dx) >= Math.abs(dy)
            ? [0, dx > 0 ? 1 : -1]
            : [dy > 0 ? 1 : -1, 0];
          let ny = this.y + toward1[0];
          let nx = this.x + toward1[1];
          if (isFloor(grid, ny, nx) && !(ny === player.y && nx === player.x)) {
            if (toward1[1] !== 0) this.facing = toward1[1] > 0 ? 'RIGHT' : 'LEFT';
            else if (toward1[0] !== 0) this.facing = toward1[0] > 0 ? 'DOWN' : 'UP';
            this.y = ny; this.x = nx;
            stepsTaken += 1;
          }
          // Step 2 prefer toward hero; if that would land on the player's tile, SKIP the second step (remain adjacent)
          const ddy = player.y - this.y; const ddx = player.x - this.x;
          const toward2: [number, number] = Math.abs(ddx) >= Math.abs(ddy)
            ? [0, ddx > 0 ? 1 : -1]
            : [ddy > 0 ? 1 : -1, 0];
          ny = this.y + toward2[0];
          nx = this.x + toward2[1];
          let moved2 = false;
          if (ny === player.y && nx === player.x) {
            // skip second step entirely to avoid stepping onto the hero; remain adjacent
            moved2 = true; // treat as handled to avoid fallback attempts
          } else if (isFloor(grid, ny, nx)) {
            if (toward2[1] !== 0) this.facing = toward2[1] > 0 ? 'RIGHT' : 'LEFT';
            else if (toward2[0] !== 0) this.facing = toward2[0] > 0 ? 'DOWN' : 'UP';
            this.y = ny; this.x = nx;
            stepsTaken += 1;
            moved2 = true;
          } else {
            const perpChoices: Array<[number, number]> = toward2[0] === 0
              ? [ [-1,0], [1,0] ]
              : [ [0,-1], [0,1] ];
            for (const [py, px] of perpChoices) {
              const nny = this.y + py;
              const nnx = this.x + px;
              if (!isFloor(grid, nny, nnx)) continue;
              if (nny === player.y && nnx === player.x) continue;
              if (px !== 0) this.facing = px > 0 ? 'RIGHT' : 'LEFT';
              else if (py !== 0) this.facing = py > 0 ? 'DOWN' : 'UP';
              this.y = nny; this.x = nnx;
              stepsTaken += 1;
              moved2 = true;
              break;
            }
          }
          if (!moved2) {
            // final greedy that avoids player tile
            const dyf = player.y - this.y; const dxf = player.x - this.x;
            const stepF: [number, number] = Math.abs(dxf) >= Math.abs(dyf)
              ? [0, dxf > 0 ? 1 : -1]
              : [dyf > 0 ? 1 : -1, 0];
            const nyf = this.y + stepF[0];
            const nxf = this.x + stepF[1];
            if (isFloor(grid, nyf, nxf) && !(nyf === player.y && nxf === player.x)) {
              if (stepF[1] !== 0) this.facing = stepF[1] > 0 ? 'RIGHT' : 'LEFT';
              else if (stepF[0] !== 0) this.facing = stepF[0] > 0 ? 'DOWN' : 'UP';
              this.y = nyf; this.x = nxf;
              stepsTaken += 1;
            }
          }
          // If still fewer than 2 steps, try one more greedy move
          if (stepsTaken < 2) {
            const dyf2 = player.y - this.y; const dxf2 = player.x - this.x;
            const stepF2: [number, number] = Math.abs(dxf2) >= Math.abs(dyf2)
              ? [0, dxf2 > 0 ? 1 : -1]
              : [dyf2 > 0 ? 1 : -1, 0];
            const nyf2 = this.y + stepF2[0];
            const nxf2 = this.x + stepF2[1];
            if (isFloor(grid, nyf2, nxf2) && !(nyf2 === player.y && nxf2 === player.x)) {
              if (stepF2[1] !== 0) this.facing = stepF2[1] > 0 ? 'RIGHT' : 'LEFT';
              else if (stepF2[0] !== 0) this.facing = stepF2[0] > 0 ? 'DOWN' : 'UP';
              this.y = nyf2; this.x = nxf2;
              stepsTaken += 1;
            }
          }
          // After close-range movement, if adjacent and JUST started hunting this tick, deal contact damage
          if (startedThisTick && (Math.abs(player.y - this.y) + Math.abs(player.x - this.x) === 1)) {
            // Consume one hunting turn and possibly enter cooldown before returning damage
            this.exciterHuntTurns -= 1;
            if (this.exciterHuntTurns <= 0) {
              this.exciterRequireOutOfRange = true;
            }
            return this.attack; // 5 for stone-exciter
          }
        } else {
          // Regular hunting: first step toward player, second step perpendicular (sporadic)
          // First step: greedy toward player (one axis step)
          let stepsTaken = 0;
          let step1: [number, number] | null = null;
          if (Math.abs(dx) >= Math.abs(dy)) step1 = [0, dx > 0 ? 1 : -1];
          else step1 = [dy > 0 ? 1 : -1, 0];
          const s1y = this.y + step1[0];
          const s1x = this.x + step1[1];
          if (isFloor(grid, s1y, s1x) && !(s1y === player.y && s1x === player.x)) {
            // update facing
            if (step1[1] !== 0) this.facing = step1[1] > 0 ? 'RIGHT' : 'LEFT';
            else if (step1[0] !== 0) this.facing = step1[0] > 0 ? 'DOWN' : 'UP';
            this.y = s1y; this.x = s1x;
            stepsTaken += 1;
          }
          // Second step: greedy toward player again; if blocked, fall back to perpendicular options
          const ddy2 = player.y - this.y; const ddx2 = player.x - this.x;
          const toward2: [number, number] = Math.abs(ddx2) >= Math.abs(ddy2)
            ? [0, ddx2 > 0 ? 1 : -1]
            : [ddy2 > 0 ? 1 : -1, 0];
          let moved2 = false;
          const n2y = this.y + toward2[0];
          const n2x = this.x + toward2[1];
          if (isFloor(grid, n2y, n2x) && !(n2y === player.y && n2x === player.x)) {
            if (toward2[1] !== 0) this.facing = toward2[1] > 0 ? 'RIGHT' : 'LEFT';
            else if (toward2[0] !== 0) this.facing = toward2[0] > 0 ? 'DOWN' : 'UP';
            this.y = n2y; this.x = n2x;
            stepsTaken += 1;
            moved2 = true;
          }
          if (!moved2) {
            const perpChoices: Array<[number, number]> = toward2[0] === 0
              ? [ [-1,0], [1,0] ]
              : [ [0,-1], [0,1] ];
            for (const [py, px] of perpChoices) {
              const nny = this.y + py;
              const nnx = this.x + px;
              if (!isFloor(grid, nny, nnx)) continue;
              if (nny === player.y && nnx === player.x) continue; // do not step onto the player
              if (px !== 0) this.facing = px > 0 ? 'RIGHT' : 'LEFT';
              else if (py !== 0) this.facing = py > 0 ? 'DOWN' : 'UP';
              this.y = nny; this.x = nnx;
              stepsTaken += 1;
              moved2 = true;
              break;
            }
          }
          // Final guarantee: if we only achieved one step due to constraints, try one more greedy step if possible
          if (stepsTaken < 2) {
            const dyf = player.y - this.y; const dxf = player.x - this.x;
            const stepF: [number, number] = Math.abs(dxf) >= Math.abs(dyf)
              ? [0, dxf > 0 ? 1 : -1]
              : [dyf > 0 ? 1 : -1, 0];
            const nyf = this.y + stepF[0];
            const nxf = this.x + stepF[1];
            if (isFloor(grid, nyf, nxf) && !(nyf === player.y && nxf === player.x)) {
              if (stepF[1] !== 0) this.facing = stepF[1] > 0 ? 'RIGHT' : 'LEFT';
              else if (stepF[0] !== 0) this.facing = stepF[0] > 0 ? 'DOWN' : 'UP';
              this.y = nyf; this.x = nxf;
              stepsTaken += 1;
            }
          }
        }
        this.exciterHuntTurns -= 1;
        if (this.exciterHuntTurns <= 0) {
          // Enter cool-down until out of range
          this.exciterRequireOutOfRange = true;
        }
        return 0;
      }

      // Not hunting: wander aimlessly (blind), one random orthogonal step if floor and not onto player
      const dirs: Array<[number, number]> = [[-1,0],[0,1],[1,0],[0,-1]];
      const choices: Array<[number, number]> = [];
      for (const [wy, wx] of dirs) {
        const ny = this.y + wy; const nx = this.x + wx;
        if (!isFloor(grid, ny, nx)) continue;
        if (ny === player.y && nx === player.x) continue;
        choices.push([wy, wx]);
      }
      if (choices.length > 0) {
        const pick = choices[Math.floor(Math.random() * choices.length)];
        const ny = this.y + pick[0];
        const nx = this.x + pick[1];
        if (pick[1] !== 0) this.facing = pick[1] > 0 ? 'RIGHT' : 'LEFT';
        else if (pick[0] !== 0) this.facing = pick[0] > 0 ? 'DOWN' : 'UP';
        this.y = ny; this.x = nx;
      }
      // If fully out of range (>4), allow retrigger again
      if (this.exciterRequireOutOfRange && dist > 4) {
        this.exciterRequireOutOfRange = false;
      }
      return 0;
    }
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
  // Precompute ghost positions for context
  const ghostPositions = enemies.filter(e => e.kind === 'ghost').map(e => ({ y: e.y, x: e.x }));
  for (const e of enemies) {
    const prevKey = `${e.y},${e.x}`;
    const prevY = e.y;
    const prevX = e.x;
    const base = e.update({ grid, player, ghosts: ghostPositions });
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
