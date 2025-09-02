import { DailyChallengeFlow, DailyChallengeState } from '../../lib/daily_challenge_flow';
import { DailyChallengeStorage } from '../../lib/daily_challenge_storage';
import { DateUtils } from '../../lib/date_utils';

// Mock dependencies
jest.mock('../../lib/daily_challenge_storage');
jest.mock('../../lib/date_utils');

const mockStorage = DailyChallengeStorage as jest.Mocked<typeof DailyChallengeStorage>;
const mockDateUtils = DateUtils as jest.Mocked<typeof DateUtils>;

describe('DailyChallengeFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentState', () => {
    it('should return FIRST_TIME for new users', () => {
      mockStorage.loadData.mockReturnValue({
        hasSeenIntro: false,
        currentStreak: 0,
        totalGamesPlayed: 0,
        totalGamesWon: 0,
        lastPlayedDate: '',
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
      });
      mockDateUtils.getTodayString.mockReturnValue('2025-08-30');

      const state = DailyChallengeFlow.getCurrentState();
      
      expect(state).toBe(DailyChallengeState.FIRST_TIME);
    });

    it('should return DAILY_AVAILABLE for users who can play today', () => {
      mockStorage.loadData.mockReturnValue({
        hasSeenIntro: true,
        currentStreak: 2,
        totalGamesPlayed: 5,
        totalGamesWon: 3,
        lastPlayedDate: '2025-08-29',
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
      });
      mockDateUtils.getTodayString.mockReturnValue('2025-08-30');
      mockDateUtils.isToday.mockReturnValue(false);

      const state = DailyChallengeFlow.getCurrentState();
      
      expect(state).toBe(DailyChallengeState.DAILY_AVAILABLE);
    });

    it('should return DAILY_COMPLETED for users who completed today', () => {
      mockStorage.loadData.mockReturnValue({
        hasSeenIntro: true,
        currentStreak: 3,
        totalGamesPlayed: 6,
        totalGamesWon: 4,
        lastPlayedDate: '2025-08-30',
        todayCompleted: true,
        todayResult: 'won',
        streakHistory: [],
      });
      mockDateUtils.getTodayString.mockReturnValue('2025-08-30');
      mockDateUtils.isToday.mockReturnValue(true);

      const state = DailyChallengeFlow.getCurrentState();
      
      expect(state).toBe(DailyChallengeState.DAILY_COMPLETED);
    });

    it('should return DAILY_AVAILABLE for users who played yesterday but not today', () => {
      mockStorage.loadData.mockReturnValue({
        hasSeenIntro: true,
        currentStreak: 1,
        totalGamesPlayed: 1,
        totalGamesWon: 1,
        lastPlayedDate: '2025-08-29',
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
      });
      mockDateUtils.getTodayString.mockReturnValue('2025-08-30');
      mockDateUtils.isToday.mockReturnValue(false);

      const state = DailyChallengeFlow.getCurrentState();
      
      expect(state).toBe(DailyChallengeState.DAILY_AVAILABLE);
    });
  });

  describe('getStateData', () => {
    it('should return current data and today string', () => {
      const mockData = {
        hasSeenIntro: true,
        currentStreak: 5,
        totalGamesPlayed: 10,
        totalGamesWon: 7,
        lastPlayedDate: '2025-08-29',
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
      };
      
      mockStorage.loadData.mockReturnValue(mockData);
      mockDateUtils.getTodayString.mockReturnValue('2025-08-30');

      const stateData = DailyChallengeFlow.getStateData();
      
      expect(stateData.data).toEqual(mockData);
      expect(stateData.today).toBe('2025-08-30');
    });
  });

  describe('handleIntroComplete', () => {
    it('should mark intro as seen and return updated data', () => {
      const updatedData = {
        hasSeenIntro: true,
        currentStreak: 0,
        totalGamesPlayed: 0,
        totalGamesWon: 0,
        lastPlayedDate: '',
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
      };

      mockStorage.markIntroSeen.mockReturnValue(updatedData);

      const result = DailyChallengeFlow.handleIntroComplete();
      
      expect(mockStorage.markIntroSeen).toHaveBeenCalled();
      expect(result).toEqual(updatedData);
    });
  });

  describe('handleGameComplete', () => {
    it('should record game result and return updated data', () => {
      const updatedData = {
        hasSeenIntro: true,
        currentStreak: 1,
        totalGamesPlayed: 1,
        totalGamesWon: 1,
        lastPlayedDate: '2025-08-30',
        todayCompleted: true,
        todayResult: 'won' as const,
        streakHistory: [
          { date: '2025-08-30', result: 'won' as const, streak: 1 },
        ],
      };

      mockDateUtils.getTodayString.mockReturnValue('2025-08-30');
      mockStorage.recordGameResult.mockReturnValue(updatedData);

      const result = DailyChallengeFlow.handleGameComplete('won');
      
      expect(mockStorage.recordGameResult).toHaveBeenCalledWith('won', '2025-08-30');
      expect(result).toEqual(updatedData);
    });
  });

  describe('canPlayToday', () => {
    it('should return true if user has not completed today', () => {
      mockStorage.loadData.mockReturnValue({
        hasSeenIntro: true,
        currentStreak: 0,
        totalGamesPlayed: 0,
        totalGamesWon: 0,
        lastPlayedDate: '',
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
      });

      expect(DailyChallengeFlow.canPlayToday()).toBe(true);
    });

    it('should return false if user has completed today', () => {
      mockStorage.loadData.mockReturnValue({
        hasSeenIntro: true,
        currentStreak: 1,
        totalGamesPlayed: 1,
        totalGamesWon: 1,
        lastPlayedDate: '2025-08-30',
        todayCompleted: true,
        todayResult: 'won',
        streakHistory: [],
      });

      expect(DailyChallengeFlow.canPlayToday()).toBe(false);
    });
  });

  describe('resetForNewDay', () => {
    it('should reset daily progress when called', () => {
      const resetData = {
        hasSeenIntro: true,
        currentStreak: 5,
        totalGamesPlayed: 10,
        totalGamesWon: 7,
        lastPlayedDate: '2025-08-29',
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
      };

      mockStorage.resetDailyProgress.mockReturnValue(resetData);

      const result = DailyChallengeFlow.resetForNewDay();
      
      expect(mockStorage.resetDailyProgress).toHaveBeenCalled();
      expect(result).toEqual(resetData);
    });
  });
});
