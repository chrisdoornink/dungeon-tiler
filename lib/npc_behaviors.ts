import { NPC } from "./npc";
import { Direction, FLOOR, TileSubtype } from "./map/constants";

/**
 * Restricted tiles where dogs cannot move (entrance/exit areas)
 */
const DOG_RESTRICTED_TILES: Array<[number, number]> = [
  [12, 30], [12, 29], [13, 29], [13, 30], [11, 29], [11, 30],
  [30, 4], [29, 4], [28, 4], [27, 4]
];

/**
 * Check if a position is restricted for dogs
 */
function isDogRestrictedTile(y: number, x: number): boolean {
  return DOG_RESTRICTED_TILES.some(([restrictedY, restrictedX]) => 
    restrictedY === y && restrictedX === x
  );
}

/**
 * Context for NPC behavior updates
 */
export interface NPCBehaviorContext {
  npc: NPC;
  grid: number[][];
  subtypes?: number[][][];
  player: { y: number; x: number };
  npcs: NPC[];
  // Combatant AI reads attack/health when present (Enemy satisfies this);
  // movement-only behaviors just use y/x.
  enemies?: Array<{ y: number; x: number; attack?: number; health?: number }>;
  rng?: () => number;
}

/**
 * Result of an NPC behavior update
 */
export interface NPCBehaviorResult {
  moved: boolean;
  spriteChanged?: boolean;
  interaction?: "pet" | null;
}

/**
 * Dog behavior: follows the player 75% of the time, stays put 25% of the time
 * Alternates front sprites when moving, uses back sprites when moving up
 * After being pet, moves out of the player's way
 */
export function updateDogBehavior(ctx: NPCBehaviorContext): NPCBehaviorResult {
  const { npc, grid, player, npcs, enemies, rng } = ctx;
  const random = rng ?? Math.random;
  
  // Check if player is adjacent (for potential petting)
  const distToPlayer = Math.abs(npc.y - player.y) + Math.abs(npc.x - player.x);
  
  // Check if dog was recently pet (within last 500ms) - if so, move out of the way
  const lastPetAt = npc.getMemory("lastPetAt") as number | undefined;
  const timeSincePet = lastPetAt ? Date.now() - lastPetAt : Infinity;
  const wasRecentlyPet = timeSincePet < 500;
  
  if (wasRecentlyPet && distToPlayer === 1) {
    // Dog was just pet and is adjacent to player - sidestep or back away
    const moveResult = tryMoveAwayFromPlayer(npc, grid, player, npcs, enemies);
    if (moveResult.moved) {
      return moveResult;
    }
  }
  
  // 75% chance to follow player, 25% chance to stay put
  const shouldFollow = random() < 0.75;
  
  if (shouldFollow && distToPlayer > 1) {
    // Try to move toward player
    const dy = player.y - npc.y;
    const dx = player.x - npc.x;
    
    // Determine primary direction
    const moves: Array<[number, number]> = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Prioritize horizontal movement
      if (dx !== 0) moves.push([0, dx > 0 ? 1 : -1]);
      if (dy !== 0) moves.push([dy > 0 ? 1 : -1, 0]);
    } else {
      // Prioritize vertical movement
      if (dy !== 0) moves.push([dy > 0 ? 1 : -1, 0]);
      if (dx !== 0) moves.push([0, dx > 0 ? 1 : -1]);
    }
    
    // Try each move
    for (const [moveY, moveX] of moves) {
      const targetY = npc.y + moveY;
      const targetX = npc.x + moveX;
      
      // Check if target is valid floor
      if (!isValidPosition(grid, targetY, targetX)) continue;
      
      // Check if target is restricted for dogs
      if (isDogRestrictedTile(targetY, targetX)) continue;
      
      // Check if target has blocking subtypes (torches, town signs, etc.)
      const targetSubtypes = ctx.subtypes?.[targetY]?.[targetX];
      if (targetSubtypes) {
        const hasBlockingSubtype = targetSubtypes.some(subtype => 
          subtype === TileSubtype.WALL_TORCH ||
          subtype === TileSubtype.TOWN_SIGN ||
          subtype === TileSubtype.CHECKPOINT ||
          subtype === TileSubtype.BOOKSHELF
        );
        if (hasBlockingSubtype) continue;
      }
      
      // Check if target is occupied by player
      if (targetY === player.y && targetX === player.x) continue;
      
      // Check if target is occupied by another NPC
      const npcBlocking = npcs.some(
        (other) => other.id !== npc.id && other.y === targetY && other.x === targetX
      );
      if (npcBlocking) continue;
      
      // Check if target is occupied by an enemy
      const enemyBlocking = enemies?.some(
        (e) => e.y === targetY && e.x === targetX
      );
      if (enemyBlocking) continue;
      
      // Move is valid
      npc.y = targetY;
      npc.x = targetX;
      
      // Deterministic sprite by movement direction. The four "front" images
      // are distinct POSES (1 faces right, 2 faces left, 3 sits, 4 faces the
      // camera), so cycling through them made the dog appear to flip around
      // at random. The walk "wiggle" comes from the render layer's step
      // animation, not from swapping poses.
      if (moveY < 0) {
        // Moving up — alternate the two back sprites (both face up; the
        // alternation reads as a tail wag).
        const currentStep = (npc.memory?.dogStep as number) || 0;
        const nextStep = (currentStep + 1) % 2;
        npc.setMemory("dogStep", nextStep);
        npc.sprite = `/images/dog-golden/dog-back-${nextStep + 1}.png`;
      } else if (moveX > 0) {
        npc.sprite = `/images/dog-golden/dog-front-1.png`; // faces right
      } else if (moveX < 0) {
        npc.sprite = `/images/dog-golden/dog-front-2.png`; // faces left
      } else {
        npc.sprite = `/images/dog-golden/dog-front-4.png`; // faces the camera
      }

      return { moved: true };
    }
  }

  // Didn't move — keep the current pose. (Idle used to cycle all four front
  // poses, which made the standing dog spin in place at random.)
  return { moved: false };
}

/**
 * Try to move the dog away from the player after being pet
 * Priority: sidestep > backward (2 spaces if possible)
 */
function tryMoveAwayFromPlayer(
  npc: NPC,
  grid: number[][],
  player: { y: number; x: number },
  npcs: NPC[],
  enemies?: Array<{ y: number; x: number }>
): NPCBehaviorResult {
  const dy = player.y - npc.y;
  const dx = player.x - npc.x;
  
  // Calculate perpendicular directions (sidestep options)
  const sidestepMoves: Array<[number, number]> = [];
  if (dy !== 0) {
    // Player is above/below - sidestep left/right
    sidestepMoves.push([0, -1], [0, 1]);
  }
  if (dx !== 0) {
    // Player is left/right - sidestep up/down
    sidestepMoves.push([-1, 0], [1, 0]);
  }
  
  // Try sidestep moves first
  for (const [moveY, moveX] of sidestepMoves) {
    if (tryMove(npc, grid, player, npcs, enemies, moveY, moveX)) {
      updateDogSprite(npc, moveY, moveX);
      return { moved: true };
    }
  }
  
  // If sidestep not possible, try backing away
  // Move in opposite direction from player
  const backY = dy > 0 ? -1 : dy < 0 ? 1 : 0;
  const backX = dx > 0 ? -1 : dx < 0 ? 1 : 0;
  
  // Try to move 2 spaces back if possible
  if (backY !== 0 || backX !== 0) {
    const canMove2Spaces = 
      tryMove(npc, grid, player, npcs, enemies, backY * 2, backX * 2, true);
    
    if (canMove2Spaces) {
      // Move 2 spaces
      npc.y += backY * 2;
      npc.x += backX * 2;
      updateDogSprite(npc, backY, backX);
      return { moved: true };
    }
    
    // Try 1 space back
    if (tryMove(npc, grid, player, npcs, enemies, backY, backX)) {
      updateDogSprite(npc, backY, backX);
      return { moved: true };
    }
  }
  
  return { moved: false };
}

/**
 * Try to move the NPC to a target position
 * Returns true if move was successful and updates NPC position
 */
function tryMove(
  npc: NPC,
  grid: number[][],
  player: { y: number; x: number },
  npcs: NPC[],
  enemies: Array<{ y: number; x: number }> | undefined,
  moveY: number,
  moveX: number,
  checkOnly = false
): boolean {
  const targetY = npc.y + moveY;
  const targetX = npc.x + moveX;
  
  // Check if target is valid floor
  if (!isValidPosition(grid, targetY, targetX)) return false;
  
  // Check if target is restricted for dogs
  const isDog = npc.tags?.includes("dog") || npc.tags?.includes("pet");
  if (isDog && isDogRestrictedTile(targetY, targetX)) return false;
  
  // Check if target is occupied by player
  if (targetY === player.y && targetX === player.x) return false;
  
  // Check if target is occupied by another NPC
  const npcBlocking = npcs.some(
    (other) => other.id !== npc.id && other.y === targetY && other.x === targetX
  );
  if (npcBlocking) return false;
  
  // Check if target is occupied by an enemy
  const enemyBlocking = enemies?.some(
    (e) => e.y === targetY && e.x === targetX
  );
  if (enemyBlocking) return false;
  
  // Move is valid
  if (!checkOnly) {
    npc.y = targetY;
    npc.x = targetX;
  }
  
  return true;
}

/**
 * Update dog sprite based on movement direction
 */
function updateDogSprite(npc: NPC, moveY: number, _moveX: number): void {
  if (moveY < 0) {
    // Moving up - alternate between back sprites
    const currentStep = (npc.memory?.dogStep as number) || 0;
    const nextStep = (currentStep + 1) % 2;
    npc.setMemory("dogStep", nextStep);
    npc.sprite = `/images/dog-golden/dog-back-${nextStep + 1}.png`;
  } else {
    // Moving down, left, or right - alternate between front sprites
    const currentStep = (npc.memory?.dogStep as number) || 0;
    const nextStep = (currentStep + 1) % 4;
    npc.setMemory("dogStep", nextStep);
    npc.sprite = `/images/dog-golden/dog-front-${nextStep + 1}.png`;
  }
}

/**
 * Check if a position is valid floor tile
 */
function isValidPosition(grid: number[][], y: number, x: number): boolean {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) {
    return false;
  }
  return grid[y][x] === FLOOR;
}

/**
 * Get random dog front sprite
 */
export function getRandomDogFrontSprite(rng?: () => number): string {
  const random = rng ?? Math.random;
  const index = Math.floor(random() * 4) + 1;
  return `/images/dog-golden/dog-front-${index}.png`;
}

/**
 * Get dog back sprite (randomly picks between 2 options)
 */
export function getRandomDogBackSprite(rng?: () => number): string {
  const random = rng ?? Math.random;
  const index = Math.floor(random() * 2) + 1;
  return `/images/dog-golden/dog-back-${index}.png`;
}

/** How close an enemy must be (Manhattan) before a family member reacts to it. */
const COMBAT_AWARENESS = 5;
/**
 * Nerve threshold. An armed member engages when their power (attack x health)
 * is at least this fraction of the enemy's — i.e. they'll take a fair fight or
 * a slightly losing one, but flee a hopeless one. Unarmed members never clear
 * this bar (they always avoid until cornered).
 */
const ENGAGE_RATIO = 0.6;

const facingToward = (
  fromY: number,
  fromX: number,
  toY: number,
  toX: number
): Direction => {
  if (Math.abs(toY - fromY) >= Math.abs(toX - fromX)) {
    return toY < fromY ? Direction.UP : Direction.DOWN;
  }
  return toX < fromX ? Direction.LEFT : Direction.RIGHT;
};

function applyStepFacing(npc: NPC, moveY: number, moveX: number): void {
  if (npc.tags?.includes("dog")) {
    updateDogSprite(npc, moveY, moveX);
  } else if (npc.metadata?.directionalSprites) {
    npc.facing =
      moveY < 0
        ? Direction.UP
        : moveY > 0
        ? Direction.DOWN
        : moveX < 0
        ? Direction.LEFT
        : Direction.RIGHT;
  }
}

/**
 * Combat AI for a party member (Hearth & Home), run only when an enemy is
 * within COMBAT_AWARENESS. Overrides the member's idle/base movement for the
 * tick. Rules:
 *   - Armed AND not badly outmatched -> ENGAGE: close on the nearest enemy,
 *     or hold and face it when already adjacent (the strike lands in
 *     runPartyCombat). `engaging` memory = true.
 *   - Unarmed, or armed-but-outmatched -> AVOID: step to the tile that most
 *     increases distance from nearby enemies. `engaging` = false (no strike).
 *   - No safe retreat (cornered) -> hold and fight desperately. `engaging` = true.
 *
 * Returns { reacted } — true means combat handled movement this tick and the
 * caller should skip the base behavior.
 */
export function updateCombatantBehavior(
  ctx: NPCBehaviorContext,
  opts: { armed: boolean; attack: number }
): { reacted: boolean } {
  const { npc, grid, player, npcs, enemies } = ctx;
  const near = (enemies ?? []).filter(
    (e) => Math.abs(e.y - npc.y) + Math.abs(e.x - npc.x) <= COMBAT_AWARENESS
  );
  if (near.length === 0) {
    npc.setMemory("engaging", null);
    return { reacted: false };
  }

  // Nearest enemy drives targeting and the strength check.
  let nearest = near[0];
  let nearestDist = Infinity;
  for (const e of near) {
    const d = Math.abs(e.y - npc.y) + Math.abs(e.x - npc.x);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }

  const myPower = opts.attack * Math.max(1, npc.health);
  const enemyPower = (nearest.attack ?? 1) * Math.max(1, nearest.health ?? 1);
  const willing = opts.armed && myPower >= enemyPower * ENGAGE_RATIO;

  const canStand = (ty: number, tx: number): boolean => {
    if (!isValidPosition(grid, ty, tx)) return false;
    const subs = ctx.subtypes?.[ty]?.[tx];
    if (
      subs?.some(
        (s) =>
          s === TileSubtype.WALL_TORCH ||
          s === TileSubtype.TOWN_SIGN ||
          s === TileSubtype.CHECKPOINT ||
          s === TileSubtype.BOOKSHELF
      )
    ) {
      return false;
    }
    if (ty === player.y && tx === player.x) return false;
    if (npcs.some((o) => o.id !== npc.id && o.y === ty && o.x === tx)) return false;
    if ((enemies ?? []).some((e) => e.y === ty && e.x === tx)) return false;
    return true;
  };

  const STEPS: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const minDistToEnemies = (y: number, x: number): number =>
    Math.min(...near.map((e) => Math.abs(e.y - y) + Math.abs(e.x - x)));

  if (willing) {
    npc.setMemory("engaging", true);
    if (nearestDist <= 1) {
      // Already in reach — square up and let runPartyCombat swing.
      npc.facing = facingToward(npc.y, npc.x, nearest.y, nearest.x);
      return { reacted: true };
    }
    // Close the larger gap first, fall back to the other axis.
    const dy = Math.sign(nearest.y - npc.y);
    const dx = Math.sign(nearest.x - npc.x);
    const order: Array<[number, number]> =
      Math.abs(nearest.y - npc.y) >= Math.abs(nearest.x - npc.x)
        ? [[dy, 0], [0, dx]]
        : [[0, dx], [dy, 0]];
    for (const [my, mx] of order) {
      if ((my === 0 && mx === 0) || !canStand(npc.y + my, npc.x + mx)) continue;
      npc.y += my;
      npc.x += mx;
      applyStepFacing(npc, my, mx);
      return { reacted: true };
    }
    // Blocked from closing — hold and face the threat.
    npc.facing = facingToward(npc.y, npc.x, nearest.y, nearest.x);
    return { reacted: true };
  }

  // AVOID: find the retreat tile that most increases distance from the pack.
  const current = minDistToEnemies(npc.y, npc.x);
  let best: [number, number] | null = null;
  let bestDist = current;
  for (const [my, mx] of STEPS) {
    const ty = npc.y + my;
    const tx = npc.x + mx;
    if (!canStand(ty, tx)) continue;
    const d = minDistToEnemies(ty, tx);
    if (d > bestDist) {
      bestDist = d;
      best = [my, mx];
    }
  }
  if (best) {
    npc.setMemory("engaging", false);
    npc.y += best[0];
    npc.x += best[1];
    applyStepFacing(npc, best[0], best[1]);
    return { reacted: true };
  }

  // Cornered: nowhere better to run — turn and fight.
  npc.setMemory("engaging", true);
  npc.facing = facingToward(npc.y, npc.x, nearest.y, nearest.x);
  return { reacted: true };
}

/**
 * Follow behavior: the party line. Each follower steps toward its leader —
 * the previous follower in `metadata.followOrder`, or the player for the
 * front of the line — and stops once adjacent, forming a trailing conga.
 * Facing turns with each step for NPCs with directional art; dogs swap their
 * walk frames instead.
 */
export function updateFollowBehavior(ctx: NPCBehaviorContext): NPCBehaviorResult {
  const { npc, player, npcs } = ctx;

  const myOrder = (npc.metadata?.followOrder as number) ?? 0;
  const leader =
    npcs
      .filter(
        (other) =>
          other.id !== npc.id &&
          other.metadata?.behavior === "follow" &&
          ((other.metadata?.followOrder as number) ?? Infinity) < myOrder
      )
      .sort(
        (a, b) =>
          ((b.metadata?.followOrder as number) ?? 0) -
          ((a.metadata?.followOrder as number) ?? 0)
      )[0] ?? player;

  let moved = false;
  const budget = takeMovementBudget(npc);
  for (let step = 0; step < budget; step++) {
    if (Math.abs(leader.y - npc.y) + Math.abs(leader.x - npc.x) <= 1) break;
    if (!stepAlongPath(ctx, leader.y, leader.x)) break;
    moved = true;
  }
  return { moved };
}

/**
 * Turn-based "speed": tiles-per-turn as a fractional budget accumulated in
 * npc.memory.stepAcc. Speed 1.4 takes a second step two turns out of five;
 * speed 0.85 skips a turn now and then. Default (no metadata.speed) is 1.
 */
export function takeMovementBudget(npc: NPC): number {
  const speed = (npc.metadata?.speed as number) ?? 1;
  // Rounded to dodge float drift (0.6 + 1.4 = 1.9999... would eat a step).
  const acc =
    Math.round((((npc.memory?.stepAcc as number) || 0) + speed) * 1e6) / 1e6;
  const steps = Math.floor(acc);
  npc.setMemory("stepAcc", acc - steps);
  return steps;
}

/** Static-passable for pathfinding: floor with nothing solid on it. Dynamic
 * occupants (player/npcs/enemies) are NOT considered here — they'd punch false
 * dead-ends into the plan; the caller waits if the next tile is occupied. */
function pathPassable(ctx: NPCBehaviorContext, y: number, x: number): boolean {
  if (ctx.grid[y]?.[x] !== FLOOR) return false;
  const subs = ctx.subtypes?.[y]?.[x];
  return !subs?.some(
    (s) =>
      s === TileSubtype.WALL_TORCH ||
      s === TileSubtype.TOWN_SIGN ||
      s === TileSubtype.CHECKPOINT ||
      s === TileSubtype.BOOKSHELF ||
      s === TileSubtype.CHEST ||
      s === TileSubtype.BED_EMPTY_1 ||
      s === TileSubtype.BED_EMPTY_2 ||
      s === TileSubtype.BED_EMPTY_3 ||
      s === TileSubtype.BED_EMPTY_4 ||
      s === TileSubtype.BED_FULL_1 ||
      s === TileSubtype.BED_FULL_2 ||
      s === TileSubtype.BED_FULL_3 ||
      s === TileSubtype.BED_FULL_4
  );
}

/**
 * Shortest-path next tile toward a target, navigating AROUND walls (BFS over
 * static-passable tiles). The house is a maze of walled rooms, so greedy
 * axis-stepping gets stuck against the first wall — this doesn't. Returns the
 * next [y,x] to move to, or null when already adjacent to the target or no
 * route exists. Goal is a tile adjacent to the target (chests/rally points are
 * reached by standing next to them).
 */
export function bfsNextStep(
  ctx: NPCBehaviorContext,
  ty: number,
  tx: number
): [number, number] | null {
  const { npc, grid } = ctx;
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const start = npc.y * W + npc.x;
  const goalReached = (y: number, x: number) =>
    Math.abs(y - ty) + Math.abs(x - tx) <= 1;
  if (goalReached(npc.y, npc.x)) return null;

  const prev = new Int32Array(H * W).fill(-2); // -2 unseen, -1 start
  prev[start] = -1;
  const queue = [start];
  let goal = -1;
  for (let i = 0; i < queue.length && goal === -1; i++) {
    const p = queue[i];
    const py = (p / W) | 0;
    const pxx = p % W;
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ny = py + dy;
      const nx = pxx + dx;
      if (ny < 0 || nx < 0 || ny >= H || nx >= W) continue;
      const n = ny * W + nx;
      if (prev[n] !== -2 || !pathPassable(ctx, ny, nx)) continue;
      prev[n] = p;
      if (goalReached(ny, nx)) {
        goal = n;
        break;
      }
      queue.push(n);
    }
  }
  if (goal === -1) return null;
  // Walk the predecessor chain back to the first step out of `start`.
  let cur = goal;
  while (prev[cur] !== start && prev[cur] !== -1) cur = prev[cur];
  return [(cur / W) | 0, cur % W];
}

/**
 * Take one BFS-planned step toward (ty,tx), waiting (no move) if the planned
 * tile is transiently occupied by the player, another NPC, or an enemy.
 * Returns true only when a step was actually taken.
 */
function stepAlongPath(ctx: NPCBehaviorContext, ty: number, tx: number): boolean {
  const { npc, player, npcs, enemies } = ctx;
  const next = bfsNextStep(ctx, ty, tx);
  if (!next) return false;
  const [ny, nx] = next;
  if (ny === player.y && nx === player.x) return false;
  if (npcs.some((o) => o.id !== npc.id && o.y === ny && o.x === nx)) return false;
  if (enemies?.some((e) => e.y === ny && e.x === nx)) return false;
  const my = ny - npc.y;
  const mx = nx - npc.x;
  npc.y = ny;
  npc.x = nx;
  applyStepFacing(npc, my, mx);
  return true;
}

/**
 * Goto behavior: walk to `metadata.gotoTarget` and wait there (scenario
 * direction — Opal leading to the bookshelf, family arming at chests, or a
 * rally point). Speed-weighted, and BFS-routed so it navigates the house's
 * walled rooms instead of jamming against the first wall.
 */
export function updateGotoBehavior(ctx: NPCBehaviorContext): NPCBehaviorResult {
  const { npc } = ctx;
  const target = npc.metadata?.gotoTarget as { y: number; x: number } | undefined;
  if (!target) return { moved: false };

  let moved = false;
  const budget = takeMovementBudget(npc);
  for (let step = 0; step < budget; step++) {
    if (Math.abs(target.y - npc.y) + Math.abs(target.x - npc.x) <= 1) break;
    if (!stepAlongPath(ctx, target.y, target.x)) break;
    moved = true;
  }
  return { moved };
}

/**
 * Wander behavior: NPC randomly moves within specified bounds
 * 50% chance to move each turn, picks a random adjacent direction
 */
export function updateWanderBehavior(ctx: NPCBehaviorContext): NPCBehaviorResult {
  const { npc, grid, player, npcs, enemies, rng } = ctx;
  const random = rng ?? Math.random;
  
  // Get wander bounds from metadata
  const bounds = npc.metadata?.wanderBounds as { minY: number; maxY: number; minX: number; maxX: number } | undefined;
  if (!bounds) {
    return { moved: false };
  }
  
  // 50% chance to move
  const shouldMove = random() < 0.5;
  if (!shouldMove) {
    return { moved: false };
  }
  
  // Pick a random direction: up, down, left, right
  const directions: Array<[number, number]> = [
    [-1, 0], // up
    [1, 0],  // down
    [0, -1], // left
    [0, 1],  // right
  ];
  
  // Shuffle directions
  for (let i = directions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }
  
  // Try each direction
  for (const [moveY, moveX] of directions) {
    const targetY = npc.y + moveY;
    const targetX = npc.x + moveX;
    
    // Check if target is within bounds
    if (targetY < bounds.minY || targetY > bounds.maxY || 
        targetX < bounds.minX || targetX > bounds.maxX) {
      continue;
    }
    
    // Check if target is valid floor
    if (!isValidPosition(grid, targetY, targetX)) continue;
    
    // Check if target has blocking subtypes (torches, town signs, etc.)
    const targetSubtypes = ctx.subtypes?.[targetY]?.[targetX];
    if (targetSubtypes) {
      const hasBlockingSubtype = targetSubtypes.some(subtype => 
        subtype === TileSubtype.WALL_TORCH ||
        subtype === TileSubtype.TOWN_SIGN ||
        subtype === TileSubtype.CHECKPOINT ||
        subtype === TileSubtype.BOOKSHELF
      );
      if (hasBlockingSubtype) continue;
    }
    
    // Check if target is occupied by player
    if (targetY === player.y && targetX === player.x) continue;
    
    // Check if target is occupied by another NPC
    const npcBlocking = npcs.some(
      (other) => other.id !== npc.id && other.y === targetY && other.x === targetX
    );
    if (npcBlocking) continue;
    
    // Check if target is occupied by an enemy
    const enemyBlocking = enemies?.some(
      (e) => e.y === targetY && e.x === targetX
    );
    if (enemyBlocking) continue;
    
    // Move is valid
    npc.y = targetY;
    npc.x = targetX;

    // NPCs with real directional art turn to face where they walk. Everyone
    // else keeps their authored facing — the legacy single-sprite renderer
    // shows a rotated front sprite for UP, which looks wrong mid-stroll.
    if (npc.metadata?.directionalSprites) {
      npc.facing =
        moveY < 0
          ? Direction.UP
          : moveY > 0
          ? Direction.DOWN
          : moveX < 0
          ? Direction.LEFT
          : Direction.RIGHT;
    }

    return { moved: true };
  }

  return { moved: false };
}
