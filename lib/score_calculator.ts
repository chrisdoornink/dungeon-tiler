import type { EnemyKind } from "./enemies/registry";

export interface GameStats {
  damageDealt: number;
  damageTaken: number;
  enemiesDefeated: number;
  steps?: number;
  byKind?: Record<EnemyKind, number>;
}

export interface GameInventory {
  hasKey: boolean;
  hasExitKey: boolean;
  hasSword?: boolean;
  hasShield?: boolean;
  showFullMap?: boolean;
}

export interface ScoreBreakdown {
  baseScore: number;
  combatBonus: number;
  survivalBonus: number;
  efficiencyBonus: number;
  itemBonus: number;
  perfectBonus: number;
  totalScore: number;
  grade: string;
  percentage: number;
}

export class ScoreCalculator {
  // Base scoring weights
  private static readonly WEIGHTS = {
    // Combat scoring
    DAMAGE_DEALT: 10,        // 10 points per damage dealt
    ENEMY_DEFEATED: 25,      // 25 points per enemy defeated
    GHOST_BONUS: 15,         // Extra 15 points for ghosts (harder)
    STONE_EXCITER_BONUS: 20, // Extra 20 points for stone exciters (hardest)
    
    // Survival scoring
    HEALTH_REMAINING: 30,    // 30 points per health point remaining
    DAMAGE_PENALTY: -5,      // -5 points per damage taken
    
    // Efficiency scoring
    STEP_EFFICIENCY: 2,      // Bonus for fewer steps (calculated dynamically)
    
    // Item collection
    KEY_BONUS: 50,           // 50 points for key
    EXIT_KEY_BONUS: 75,      // 75 points for exit key
    SWORD_BONUS: 100,        // 100 points for sword
    SHIELD_BONUS: 100,       // 100 points for shield
    MAP_REVEAL_BONUS: 75,    // 75 points for map reveal
    
    // Perfect game bonuses
    NO_DAMAGE_BONUS: 200,    // 200 points for taking no damage
    ALL_ITEMS_BONUS: 150,    // 150 points for collecting all items
  };

  // Grade thresholds (percentage-based) - more forgiving for winning games
  private static readonly GRADE_THRESHOLDS = [
    { min: 95, grade: 'S+' },
    { min: 88, grade: 'S' },
    { min: 80, grade: 'A+' },
    { min: 72, grade: 'A' },
    { min: 65, grade: 'B+' },
    { min: 58, grade: 'B' },
    { min: 50, grade: 'C+' },
    { min: 42, grade: 'C' },
    { min: 30, grade: 'D' },
    { min: 0, grade: 'F' },
  ];

  /**
   * Calculate the maximum possible score for a given game scenario
   */
  private static calculateMaxScore(stats: GameStats): number {
    const { WEIGHTS } = ScoreCalculator;
    
    // Use more realistic assumptions for max score calculation
    const maxDamageDealt = Math.max(stats.damageDealt, stats.enemiesDefeated * 1.5); // At least 1.5 damage per enemy
    const maxEnemiesDefeated = stats.enemiesDefeated;
    const maxHealthRemaining = 5; // Full health
    const minDamageTaken = Math.max(0, Math.floor(stats.damageTaken * 0.5)); // Allow taking half the damage
    const maxSteps = Math.max(80, (stats.steps || 150) * 0.85); // 15% more efficient, reasonable baseline
    
    let maxScore = 0;
    
    // Combat scoring (base) - use actual enemy composition if available
    maxScore += maxDamageDealt * WEIGHTS.DAMAGE_DEALT;
    maxScore += maxEnemiesDefeated * WEIGHTS.ENEMY_DEFEATED;
    
    // Use actual enemy types if available, otherwise estimate conservatively
    if (stats.byKind) {
      maxScore += (stats.byKind.ghost || 0) * WEIGHTS.GHOST_BONUS;
      maxScore += (stats.byKind['stone-exciter'] || 0) * WEIGHTS.STONE_EXCITER_BONUS;
    } else {
      // Conservative estimates
      const estimatedGhosts = Math.floor(maxEnemiesDefeated * 0.2);
      const estimatedStoneExciters = Math.floor(maxEnemiesDefeated * 0.15);
      maxScore += estimatedGhosts * WEIGHTS.GHOST_BONUS;
      maxScore += estimatedStoneExciters * WEIGHTS.STONE_EXCITER_BONUS;
    }
    
    // Survival scoring (realistic perfect)
    maxScore += maxHealthRemaining * WEIGHTS.HEALTH_REMAINING;
    maxScore += minDamageTaken * WEIGHTS.DAMAGE_PENALTY;
    
    // Efficiency (more achievable bonus)
    const efficiencyBonus = Math.max(0, (maxSteps * 1.5 - (stats.steps || 100)) * WEIGHTS.STEP_EFFICIENCY);
    maxScore += efficiencyBonus;
    
    // Items - only count actually collectible items (3 total: key, sword, shield)
    // Exit key is consumed when used, lightswitch is map reveal (not collectible)
    maxScore += WEIGHTS.KEY_BONUS;
    maxScore += WEIGHTS.SWORD_BONUS;
    maxScore += WEIGHTS.SHIELD_BONUS;
    
    // Perfect bonuses - only no damage bonus for realistic max
    if (minDamageTaken === 0) {
      maxScore += WEIGHTS.NO_DAMAGE_BONUS;
    }
    
    return Math.max(maxScore, 800); // More reasonable minimum max score
  }

  /**
   * Calculate comprehensive score for a completed game
   */
  static calculateScore(
    outcome: 'win' | 'dead',
    heroHealth: number,
    stats: GameStats,
    inventory: GameInventory
  ): ScoreBreakdown {
    const { WEIGHTS } = ScoreCalculator;
    
    // If player died, reduce scoring potential but not too harshly
    const deathPenalty = outcome === 'dead' ? 0.6 : 1.0;
    
    // Base combat scoring
    let combatBonus = 0;
    combatBonus += stats.damageDealt * WEIGHTS.DAMAGE_DEALT;
    combatBonus += stats.enemiesDefeated * WEIGHTS.ENEMY_DEFEATED;
    
    // Enemy type bonuses
    if (stats.byKind) {
      combatBonus += (stats.byKind.ghost || 0) * WEIGHTS.GHOST_BONUS;
      combatBonus += (stats.byKind['stone-exciter'] || 0) * WEIGHTS.STONE_EXCITER_BONUS;
    }
    
    // Survival scoring
    let survivalBonus = 0;
    const healthRemaining = outcome === 'win' ? heroHealth : 0;
    survivalBonus += healthRemaining * WEIGHTS.HEALTH_REMAINING;
    survivalBonus += stats.damageTaken * WEIGHTS.DAMAGE_PENALTY;
    
    // Efficiency scoring (fewer steps = higher bonus)
    let efficiencyBonus = 0;
    if (stats.steps) {
      // Bonus for completing in fewer steps (diminishing returns after 150 steps)
      const stepEfficiency = Math.max(0, (200 - stats.steps) * WEIGHTS.STEP_EFFICIENCY);
      efficiencyBonus += stepEfficiency;
    }
    
    // Item collection scoring
    let itemBonus = 0;
    if (inventory.hasKey) itemBonus += WEIGHTS.KEY_BONUS;
    if (inventory.hasExitKey) itemBonus += WEIGHTS.EXIT_KEY_BONUS;
    if (inventory.hasSword) itemBonus += WEIGHTS.SWORD_BONUS;
    if (inventory.hasShield) itemBonus += WEIGHTS.SHIELD_BONUS;
    if (inventory.showFullMap) itemBonus += WEIGHTS.MAP_REVEAL_BONUS;
    
    // Perfect game bonuses
    let perfectBonus = 0;
    if (stats.damageTaken === 0 && outcome === 'win') {
      perfectBonus += WEIGHTS.NO_DAMAGE_BONUS;
    }
    
    // Check if all collectible items obtained (key, sword, shield)
    // Exit key is consumed when used, showFullMap is from lightswitch activation
    const allItemsCollected = inventory.hasKey && inventory.hasSword && inventory.hasShield;
    if (allItemsCollected) {
      perfectBonus += WEIGHTS.ALL_ITEMS_BONUS;
    }
    
    // Base score is combat + survival
    const baseScore = Math.round((combatBonus + survivalBonus) * deathPenalty);
    
    // Apply death penalty to bonuses as well
    const adjustedEfficiencyBonus = Math.round(efficiencyBonus * deathPenalty);
    const adjustedItemBonus = Math.round(itemBonus * deathPenalty);
    const adjustedPerfectBonus = Math.round(perfectBonus * deathPenalty);
    
    // Calculate total score
    const totalScore = Math.max(0, baseScore + adjustedEfficiencyBonus + adjustedItemBonus + adjustedPerfectBonus);
    
    // Calculate percentage based on theoretical maximum
    const maxPossibleScore = ScoreCalculator.calculateMaxScore(stats);
    const percentage = Math.min(100, Math.round((totalScore / maxPossibleScore) * 100));
    
    // Determine grade
    const grade = ScoreCalculator.GRADE_THRESHOLDS.find(t => percentage >= t.min)?.grade || 'F';
    
    return {
      baseScore,
      combatBonus: Math.round(combatBonus * deathPenalty),
      survivalBonus: Math.round(survivalBonus * deathPenalty),
      efficiencyBonus: adjustedEfficiencyBonus,
      itemBonus: adjustedItemBonus,
      perfectBonus: adjustedPerfectBonus,
      totalScore,
      grade,
      percentage,
    };
  }

  /**
   * Format score for display
   */
  static formatScore(score: ScoreBreakdown): string {
    return `${score.grade} (${score.percentage}%) - ${score.totalScore.toLocaleString()} pts`;
  }

  /**
   * Get score emoji based on grade
   */
  static getScoreEmoji(grade: string): string {
    switch (grade) {
      case 'S+': return '🏆';
      case 'S': return '🥇';
      case 'A+': case 'A': return '🥈';
      case 'B+': case 'B': return '🥉';
      case 'C+': case 'C': return '⭐';
      case 'D': return '📈';
      default: return '💪';
    }
  }
}
