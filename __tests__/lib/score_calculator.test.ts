import { ScoreCalculator, type GameStats, type GameInventory } from '../../lib/score_calculator';

describe('ScoreCalculator', () => {
  const mockStats: GameStats = {
    damageDealt: 10,
    damageTaken: 2,
    enemiesDefeated: 5,
    steps: 80, // Updated for new step penalty threshold
    byKind: {
      'fire-goblin': 3,
      ghost: 1,
      'stone-exciter': 1,
    },
  };

  const mockInventory: GameInventory = {
    hasKey: true,
    hasExitKey: true,
    hasSword: true,
    hasShield: false,
    showFullMap: false,
  };

  describe('calculateScore', () => {
    it('should calculate score for a winning game', () => {
      const score = ScoreCalculator.calculateScore('win', 4, mockStats, mockInventory);
      
      expect(score.totalScore).toBeGreaterThan(0);
      expect(score.grade).toBeDefined();
      expect(score.percentage).toBeGreaterThan(0);
      expect(score.percentage).toBeLessThanOrEqual(100);
    });

    it('should penalize death outcomes', () => {
      const winScore = ScoreCalculator.calculateScore('win', 4, mockStats, mockInventory);
      const deathScore = ScoreCalculator.calculateScore('dead', 0, mockStats, mockInventory);
      
      expect(deathScore.totalScore).toBeLessThan(winScore.totalScore);
    });

    it('should reward better health preservation', () => {
      const perfectStats = { ...mockStats, damageTaken: 0 };
      const perfectScore = ScoreCalculator.calculateScore('win', 5, perfectStats, mockInventory);
      const normalScore = ScoreCalculator.calculateScore('win', 4, mockStats, mockInventory);
      
      expect(perfectScore.totalScore).toBeGreaterThan(normalScore.totalScore);
      expect(perfectScore.perfectBonus).toBe(0); // No perfect bonuses in new system
    });

    it('should give bonus for collecting more items', () => {
      const allItemsInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: true,
        showFullMap: false, // No map reveal bonus in new system
      };
      
      const allItemsScore = ScoreCalculator.calculateScore('win', 4, mockStats, allItemsInventory);
      const partialItemsScore = ScoreCalculator.calculateScore('win', 4, mockStats, mockInventory);
      
      expect(allItemsScore.totalScore).toBeGreaterThan(partialItemsScore.totalScore);
    });

    it('should treat all enemy types equally', () => {
      const goblinStats = {
        ...mockStats,
        byKind: { 'fire-goblin': 5, ghost: 0, 'stone-exciter': 0 },
      };
      
      const mixedStats = {
        ...mockStats,
        byKind: { 'fire-goblin': 2, ghost: 2, 'stone-exciter': 1 },
      };
      
      const goblinScore = ScoreCalculator.calculateScore('win', 4, goblinStats, mockInventory);
      const mixedScore = ScoreCalculator.calculateScore('win', 4, mixedStats, mockInventory);
      
      // Same number of enemies and damage should give same combat bonus
      expect(goblinScore.combatBonus).toBe(mixedScore.combatBonus);
    });

    it('should assign appropriate grades', () => {
      // Test good game (under 50 steps)
      const goodStats = { ...mockStats, damageTaken: 0, steps: 45 };
      const goodInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: true,
        showFullMap: false,
      };
      
      const goodScore = ScoreCalculator.calculateScore('win', 5, goodStats, goodInventory);
      expect(['S+', 'S', 'A+', 'A']).toContain(goodScore.grade);
      
      // Test poor performance
      const poorStats = { ...mockStats, damageTaken: 10, steps: 150, enemiesDefeated: 1 };
      const poorInventory: GameInventory = {
        hasKey: false,
        hasExitKey: false,
        hasSword: false,
        hasShield: false,
        showFullMap: false,
      };
      
      const poorScore = ScoreCalculator.calculateScore('dead', 1, poorStats, poorInventory);
      expect(['D', 'F']).toContain(poorScore.grade);
    });
  });

  describe('formatScore', () => {
    it('should format score correctly', () => {
      const score = ScoreCalculator.calculateScore('win', 4, mockStats, mockInventory);
      const formatted = ScoreCalculator.formatScore(score);
      
      expect(formatted).toMatch(/^[A-S+F]+ \(\d+%\) - [\d,]+ pts$/);
    });
  });

  describe('getScoreEmoji', () => {
    it('should return appropriate emojis for grades', () => {
      expect(ScoreCalculator.getScoreEmoji('S+')).toBe('🏆');
      expect(ScoreCalculator.getScoreEmoji('S')).toBe('🥇');
      expect(ScoreCalculator.getScoreEmoji('A')).toBe('🥈');
      expect(ScoreCalculator.getScoreEmoji('B')).toBe('🥉');
      expect(ScoreCalculator.getScoreEmoji('F')).toBe('💪');
    });
  });

  describe('Speed Run vs Combat Strategy', () => {
    it('should reward speed runs with minimal combat', () => {
      // Speed run: Kill 2 enemies, get keys, exit in 40 steps
      const speedRunStats: GameStats = {
        damageDealt: 4,
        damageTaken: 0,
        enemiesDefeated: 2,
        steps: 40,
        byKind: { 'fire-goblin': 2, ghost: 0, 'stone-exciter': 0 },
      };
      
      const speedRunInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: false,
        hasShield: false,
        showFullMap: false,
      };
      
      const speedScore = ScoreCalculator.calculateScore('win', 5, speedRunStats, speedRunInventory);
      
      // Should get good score despite minimal combat
      expect(speedScore.percentage).toBeGreaterThan(70);
      expect(speedScore.efficiencyBonus).toBe(0); // No step penalty
    });

    it('should allow combat runs to compete despite step penalty', () => {
      // Combat run: Kill 6 enemies, get all items, 90 steps
      const combatStats: GameStats = {
        damageDealt: 12,
        damageTaken: 1,
        enemiesDefeated: 6,
        steps: 90,
        byKind: { 'fire-goblin': 4, ghost: 1, 'stone-exciter': 1 },
      };
      
      const combatInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: true,
        showFullMap: false,
      };
      
      const combatScore = ScoreCalculator.calculateScore('win', 4, combatStats, combatInventory);
      
      // Should get good score despite step penalty
      expect(combatScore.percentage).toBeGreaterThan(70);
      expect(combatScore.efficiencyBonus).toBeLessThan(0); // Step penalty applied
    });

    it('should compare speed run vs combat strategies fairly', () => {
      // Speed run scenario
      const speedStats: GameStats = {
        damageDealt: 4,
        damageTaken: 0,
        enemiesDefeated: 2,
        steps: 35,
        byKind: { 'fire-goblin': 2, ghost: 0, 'stone-exciter': 0 },
      };
      
      const speedInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: false,
        hasShield: false,
        showFullMap: false,
      };
      
      // Combat scenario
      const combatStats: GameStats = {
        damageDealt: 14,
        damageTaken: 1,
        enemiesDefeated: 7,
        steps: 85,
        byKind: { 'fire-goblin': 5, ghost: 1, 'stone-exciter': 1 },
      };
      
      const combatInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: true,
        showFullMap: false,
      };
      
      const speedScore = ScoreCalculator.calculateScore('win', 5, speedStats, speedInventory);
      const combatScore = ScoreCalculator.calculateScore('win', 4, combatStats, combatInventory);
      
      // Both strategies should be viable (within 15% of each other)
      const scoreDiff = Math.abs(speedScore.percentage - combatScore.percentage);
      expect(scoreDiff).toBeLessThan(15);
      
      // Both should achieve decent grades
      expect(['S+', 'S', 'A+', 'A', 'A-', 'B+', 'B', 'C+']).toContain(speedScore.grade);
      expect(['S+', 'S', 'A+', 'A', 'A-', 'B+', 'B', 'C+']).toContain(combatScore.grade);
    });

    it('should heavily penalize excessive steps', () => {
      const slowStats: GameStats = {
        damageDealt: 10,
        damageTaken: 2,
        enemiesDefeated: 5,
        steps: 200, // Way too many steps
        byKind: { 'fire-goblin': 5, ghost: 0, 'stone-exciter': 0 },
      };
      
      const fastStats: GameStats = {
        ...slowStats,
        steps: 60, // Reasonable step count
      };
      
      const inventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: false,
        showFullMap: false,
      };
      
      const slowScore = ScoreCalculator.calculateScore('win', 3, slowStats, inventory);
      const fastScore = ScoreCalculator.calculateScore('win', 3, fastStats, inventory);
      
      // Slow run should be significantly penalized
      expect(slowScore.efficiencyBonus).toBeLessThan(-20); // Heavy penalty (-30 points for 150 extra steps)
      expect(fastScore.efficiencyBonus).toBeLessThan(0); // Light penalty (-2 points for 10 extra steps)
      expect(fastScore.totalScore).toBeGreaterThan(slowScore.totalScore + 20);
    });
  });
});
