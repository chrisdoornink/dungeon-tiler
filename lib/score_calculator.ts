import type { EnemyKind } from "./enemies/registry";

export interface GameStats {
  damageDealt: number;
  damageTaken: number;
  enemiesDefeated: number;
  steps?: number;
  byKind?: Partial<Record<EnemyKind, number>>;
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
    
    // Survival scoring
    HEALTH_REMAINING: 30,    // 30 points per health point remaining
    DAMAGE_PENALTY: -5,      // -5 points per damage taken
    
    // Efficiency scoring (penalty only)
    STEP_PENALTY: -0.2,      // -0.2 points per step over 50
    
    // Item collection
    KEY_BONUS: 50,           // 50 points for key
    EXIT_KEY_BONUS: 75,      // 75 points for exit key
    SWORD_BONUS: 50,         // 50 points for sword
    SHIELD_BONUS: 50,        // 50 points for shield
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
   * Calculate the maximum possible score based on actual enemy count
   * Accounts for speed run strategy vs combat strategy
   */
  private static calculateMaxScore(enemyCount: number): number {
    const { WEIGHTS } = ScoreCalculator;
    
    // Calculate two scenarios and take the higher one
    
    // Scenario 1: Speed run (minimal combat, under 50 steps)
    let speedRunScore = 0;
    // Assume killing 1-2 enemies max for keys/exit access
    const speedRunEnemies = Math.min(2, enemyCount);
    const speedRunDamage = speedRunEnemies * 2;
    speedRunScore += speedRunDamage * WEIGHTS.DAMAGE_DEALT;
    speedRunScore += speedRunEnemies * WEIGHTS.ENEMY_DEFEATED;
    speedRunScore += 5 * WEIGHTS.HEALTH_REMAINING;  // Full health
    speedRunScore += WEIGHTS.KEY_BONUS + WEIGHTS.EXIT_KEY_BONUS; // Essential items only
    // No step penalty (under 50 steps)
    
    // Scenario 2: Combat run (kill most enemies, accept step penalty)
    let combatScore = 0;
    const averageDamagePerEnemy = 2;
    const maxDamage = enemyCount * averageDamagePerEnemy;
    combatScore += maxDamage * WEIGHTS.DAMAGE_DEALT;
    combatScore += enemyCount * WEIGHTS.ENEMY_DEFEATED;
    combatScore += 4 * WEIGHTS.HEALTH_REMAINING;  // Slightly damaged from combat
    combatScore += WEIGHTS.KEY_BONUS + WEIGHTS.EXIT_KEY_BONUS + WEIGHTS.SWORD_BONUS + WEIGHTS.SHIELD_BONUS;
    // Assume ~80 steps for thorough exploration (30 step penalty)
    combatScore += 30 * WEIGHTS.STEP_PENALTY;
    
    // Return the higher of the two strategies
    return Math.max(speedRunScore, combatScore);
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
    
    // PATCH: Fix stone-exciter double counting bug
    // If stone-exciter count seems doubled compared to other enemies, halve it
    let adjustedEnemiesDefeated = stats.enemiesDefeated;
    if (stats.byKind) {
      const stoneCount = (stats.byKind['stone-exciter'] ?? 0);
      const otherCount =
        (stats.byKind.goblin ?? 0) +
        (stats.byKind.ghost ?? 0) +
        (stats.byKind.snake ?? 0) +
        (stats.byKind.mimic ?? 0);
      
      // If stone-exciter count is suspiciously high compared to others, likely doubled
      if (stoneCount > 0 && (stoneCount >= otherCount * 2 || stoneCount > 4)) {
        const correctedStoneCount = Math.ceil(stoneCount / 2);
        const reduction = stoneCount - correctedStoneCount;
        adjustedEnemiesDefeated = Math.max(0, stats.enemiesDefeated - reduction);
        
        // Log the correction for debugging
        try {
          console.log(`Stone-exciter double count detected: ${stoneCount} -> ${correctedStoneCount}, total enemies: ${stats.enemiesDefeated} -> ${adjustedEnemiesDefeated}`);
        } catch {}
      }
    }
    
    // Base combat scoring
    let combatBonus = 0;
    combatBonus += stats.damageDealt * WEIGHTS.DAMAGE_DEALT;
    combatBonus += adjustedEnemiesDefeated * WEIGHTS.ENEMY_DEFEATED;
    
    // No enemy type bonuses - all enemies worth same base amount
    
    // Survival scoring
    let survivalBonus = 0;
    const healthRemaining = outcome === 'win' ? heroHealth : 0;
    survivalBonus += healthRemaining * WEIGHTS.HEALTH_REMAINING;
    survivalBonus += stats.damageTaken * WEIGHTS.DAMAGE_PENALTY;
    
    // Efficiency scoring (penalty only for excessive steps)
    let efficiencyBonus = 0;
    if (stats.steps && stats.steps > 50) {
      // Penalty for taking more than 50 steps
      efficiencyBonus += (stats.steps - 50) * WEIGHTS.STEP_PENALTY;
    }
    
    // Item collection scoring
    let itemBonus = 0;
    if (inventory.hasKey) itemBonus += WEIGHTS.KEY_BONUS;
    if (inventory.hasExitKey) itemBonus += WEIGHTS.EXIT_KEY_BONUS;
    if (inventory.hasSword) itemBonus += WEIGHTS.SWORD_BONUS;
    if (inventory.hasShield) itemBonus += WEIGHTS.SHIELD_BONUS;
    
    // No perfect bonuses - keep scoring simple
    const perfectBonus = 0;
    
    // Base score is combat + survival
    const baseScore = Math.round((combatBonus + survivalBonus) * deathPenalty);
    
    // Apply death penalty to bonuses as well
    const adjustedEfficiencyBonus = Math.round(efficiencyBonus * deathPenalty);
    const adjustedItemBonus = Math.round(itemBonus * deathPenalty);
    const adjustedPerfectBonus = Math.round(perfectBonus * deathPenalty);
    
    // Calculate total score
    const totalScore = Math.max(0, baseScore + adjustedEfficiencyBonus + adjustedItemBonus + adjustedPerfectBonus);
    
    // Calculate percentage based on actual enemy count (use adjusted count)
    const maxPossibleScore = ScoreCalculator.calculateMaxScore(adjustedEnemiesDefeated);
    const percentage = Math.min(100, Math.round((totalScore / maxPossibleScore) * 100));
    
    // Determine grade
    const grade = ScoreCalculator.GRADE_THRESHOLDS.find(t => percentage >= t.min)?.grade || 'F';
    
    return {
      baseScore,
      combatBonus: Math.round(combatBonus * deathPenalty),
      survivalBonus: Math.round(survivalBonus * deathPenalty),
      efficiencyBonus: adjustedEfficiencyBonus,
      itemBonus: adjustedItemBonus,
      perfectBonus: 0, // No perfect bonuses
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
