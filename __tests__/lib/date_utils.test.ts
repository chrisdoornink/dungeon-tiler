import { DateUtils } from '../../lib/date_utils';

describe('DateUtils', () => {
  describe('getTodayString', () => {
    it('should return today in YYYY-MM-DD format', () => {
      const today = new Date();
      const expected = today.toISOString().split('T')[0];
      
      expect(DateUtils.getTodayString()).toBe(expected);
    });
  });

  describe('isSameDay', () => {
    it('should return true for same dates', () => {
      expect(DateUtils.isSameDay('2025-08-30', '2025-08-30')).toBe(true);
    });

    it('should return false for different dates', () => {
      expect(DateUtils.isSameDay('2025-08-30', '2025-08-31')).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(DateUtils.isSameDay('', '2025-08-30')).toBe(false);
      expect(DateUtils.isSameDay('2025-08-30', '')).toBe(false);
      expect(DateUtils.isSameDay('', '')).toBe(false);
    });
  });

  describe('isToday', () => {
    it('should return true for today\'s date', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(DateUtils.isToday(today)).toBe(true);
    });

    it('should return false for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];
      
      expect(DateUtils.isToday(yesterdayString)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(DateUtils.isToday('')).toBe(false);
    });
  });

  describe('isConsecutiveDay', () => {
    it('should return true for consecutive days', () => {
      expect(DateUtils.isConsecutiveDay('2025-08-29', '2025-08-30')).toBe(true);
    });

    it('should return false for non-consecutive days', () => {
      expect(DateUtils.isConsecutiveDay('2025-08-28', '2025-08-30')).toBe(false);
    });

    it('should return false for same day', () => {
      expect(DateUtils.isConsecutiveDay('2025-08-30', '2025-08-30')).toBe(false);
    });

    it('should return false for reverse order', () => {
      expect(DateUtils.isConsecutiveDay('2025-08-30', '2025-08-29')).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(DateUtils.isConsecutiveDay('', '2025-08-30')).toBe(false);
      expect(DateUtils.isConsecutiveDay('2025-08-30', '')).toBe(false);
    });

    it('should handle month boundaries', () => {
      expect(DateUtils.isConsecutiveDay('2025-08-31', '2025-09-01')).toBe(true);
    });

    it('should handle year boundaries', () => {
      expect(DateUtils.isConsecutiveDay('2024-12-31', '2025-01-01')).toBe(true);
    });
  });

  describe('getDaysDifference', () => {
    it('should return 0 for same day', () => {
      expect(DateUtils.getDaysDifference('2025-08-30', '2025-08-30')).toBe(0);
    });

    it('should return 1 for consecutive days', () => {
      expect(DateUtils.getDaysDifference('2025-08-29', '2025-08-30')).toBe(1);
    });

    it('should return positive number for future dates', () => {
      expect(DateUtils.getDaysDifference('2025-08-28', '2025-08-30')).toBe(2);
    });

    it('should return negative number for past dates', () => {
      expect(DateUtils.getDaysDifference('2025-08-30', '2025-08-28')).toBe(-2);
    });

    it('should handle month boundaries', () => {
      expect(DateUtils.getDaysDifference('2025-08-31', '2025-09-01')).toBe(1);
    });
  });

  describe('addDays', () => {
    it('should add days correctly', () => {
      expect(DateUtils.addDays('2025-08-30', 1)).toBe('2025-08-31');
      expect(DateUtils.addDays('2025-08-30', 2)).toBe('2025-09-01');
    });

    it('should subtract days for negative values', () => {
      expect(DateUtils.addDays('2025-08-30', -1)).toBe('2025-08-29');
      expect(DateUtils.addDays('2025-09-01', -1)).toBe('2025-08-31');
    });

    it('should handle month boundaries', () => {
      expect(DateUtils.addDays('2025-08-31', 1)).toBe('2025-09-01');
    });

    it('should handle year boundaries', () => {
      expect(DateUtils.addDays('2024-12-31', 1)).toBe('2025-01-01');
    });
  });
});
