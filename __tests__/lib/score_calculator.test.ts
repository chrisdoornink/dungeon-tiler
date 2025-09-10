import { ScoreCalculator, type GameStats, type GameInventory } from '../../lib/score_calculator';

describe('ScoreCalculator', () => {
  const mockStats: GameStats = {
    damageDealt: 10,
    damageTaken: 2,
    enemiesDefeated: 5,
    steps: 150,
    byKind: {
      goblin: 3,
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

    it('should reward perfect games with no damage', () => {
      const perfectStats = { ...mockStats, damageTaken: 0 };
      const perfectScore = ScoreCalculator.calculateScore('win', 5, perfectStats, mockInventory);
      const normalScore = ScoreCalculator.calculateScore('win', 4, mockStats, mockInventory);
      
      expect(perfectScore.totalScore).toBeGreaterThan(normalScore.totalScore);
      expect(perfectScore.perfectBonus).toBeGreaterThan(0);
    });

    it('should give bonus for collecting all items', () => {
      const allItemsInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: true,
        showFullMap: true,
      };
      
      const allItemsScore = ScoreCalculator.calculateScore('win', 4, mockStats, allItemsInventory);
      const partialItemsScore = ScoreCalculator.calculateScore('win', 4, mockStats, mockInventory);
      
      expect(allItemsScore.totalScore).toBeGreaterThan(partialItemsScore.totalScore);
    });

    it('should give higher scores for defeating harder enemies', () => {
      const easyStats = {
        ...mockStats,
        byKind: { goblin: 5, ghost: 0, 'stone-exciter': 0 },
      };
      
      const hardStats = {
        ...mockStats,
        byKind: { goblin: 2, ghost: 2, 'stone-exciter': 1 },
      };
      
      const easyScore = ScoreCalculator.calculateScore('win', 4, easyStats, mockInventory);
      const hardScore = ScoreCalculator.calculateScore('win', 4, hardStats, mockInventory);
      
      expect(hardScore.combatBonus).toBeGreaterThan(easyScore.combatBonus);
    });

    it('should assign appropriate grades', () => {
      // Test perfect game
      const perfectStats = { ...mockStats, damageTaken: 0, steps: 50 };
      const perfectInventory: GameInventory = {
        hasKey: true,
        hasExitKey: true,
        hasSword: true,
        hasShield: true,
        showFullMap: true,
      };
      
      const perfectScore = ScoreCalculator.calculateScore('win', 5, perfectStats, perfectInventory);
      expect(['S+', 'S', 'A+', 'A']).toContain(perfectScore.grade);
      
      // Test poor performance
      const poorStats = { ...mockStats, damageTaken: 10, steps: 300, enemiesDefeated: 1 };
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
});
