import { NPC } from "./npc";
import { FLOOR } from "./map/constants";

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
  enemies?: Array<{ y: number; x: number }>;
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
      
      // Update sprite based on movement direction
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
      
      return { moved: true };
    }
  }
  
  // Didn't move - alternate front sprite anyway to show idle animation
  const currentStep = (npc.memory?.dogStep as number) || 0;
  const nextStep = (currentStep + 1) % 4;
  npc.setMemory("dogStep", nextStep);
  const newSprite = `/images/dog-golden/dog-front-${nextStep + 1}.png`;
  
  if (npc.sprite !== newSprite) {
    npc.sprite = newSprite;
    return { moved: false, spriteChanged: true };
  }
  
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
    
    return { moved: true };
  }
  
  return { moved: false };
}
