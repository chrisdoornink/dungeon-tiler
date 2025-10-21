import { NPC } from "./npc";
import { FLOOR } from "./map/constants";

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
 */
export function updateDogBehavior(ctx: NPCBehaviorContext): NPCBehaviorResult {
  const { npc, grid, player, npcs, enemies, rng } = ctx;
  const random = rng ?? Math.random;
  
  // Check if player is adjacent (for potential petting)
  const distToPlayer = Math.abs(npc.y - player.y) + Math.abs(npc.x - player.x);
  
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
