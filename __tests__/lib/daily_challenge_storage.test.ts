import {
  DailyChallengeStorage,
  DailyChallengeData,
} from "../../lib/daily_challenge_storage";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("DailyChallengeStorage", () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe("getDefaultData", () => {
    it("should return default data structure", () => {
      const defaultData = DailyChallengeStorage.getDefaultData();

      expect(defaultData).toEqual({
        hasSeenIntro: false,
        currentStreak: 0,
        totalGamesPlayed: 0,
        totalGamesWon: 0,
        lastPlayedDate: "",
        todayCompleted: false,
        todayResult: null,
        streakHistory: [],
        migratedToLocalTime: true,
      });
    });
  });

  describe("loadData", () => {
    it("should return default data when localStorage is empty", () => {
      const data = DailyChallengeStorage.loadData();

      expect(data).toEqual(DailyChallengeStorage.getDefaultData());
    });

    it("should return stored data when localStorage has valid data", () => {
      const storedData: DailyChallengeData = {
        hasSeenIntro: true,
        currentStreak: 5,
        totalGamesPlayed: 10,
        totalGamesWon: 7,
        lastPlayedDate: new Date().toISOString().split("T")[0],
        todayCompleted: true,
        todayResult: "won",
        streakHistory: [{ date: "2025-08-30", result: "won", streak: 5 }],
      };

      localStorageMock.setItem("dailyChallenge", JSON.stringify(storedData));

      const data = DailyChallengeStorage.loadData();
      expect(data).toEqual({
        ...storedData,
        migratedToLocalTime: true,
      });
    });

    it("should return stored data with past day's data cleared when localStorage has valid data", () => {
      const storedData: DailyChallengeData = {
        hasSeenIntro: true,
        currentStreak: 5,
        totalGamesPlayed: 10,
        totalGamesWon: 7,
        lastPlayedDate: "2025-08-30",
        todayCompleted: true,
        todayResult: "won",
        streakHistory: [{ date: "2025-08-30", result: "won", streak: 5 }],
      };

      localStorageMock.setItem("dailyChallenge", JSON.stringify(storedData));

      const data = DailyChallengeStorage.loadData();
      expect(data).toEqual({
        ...storedData,
        // These are added by loadData to clear previous day's data
        todayCompleted: false,
        todayResult: null,
        migratedToLocalTime: true,
      });
    });

    it("should return default data when localStorage has invalid JSON", () => {
      localStorageMock.setItem("dailyChallenge", "invalid json");

      const data = DailyChallengeStorage.loadData();
      expect(data).toEqual(DailyChallengeStorage.getDefaultData());
    });
  });

  describe("saveData", () => {
    it("should save data to localStorage", () => {
      const data: DailyChallengeData = {
        hasSeenIntro: true,
        currentStreak: 3,
        totalGamesPlayed: 5,
        totalGamesWon: 3,
        lastPlayedDate: "2025-08-30",
        todayCompleted: true,
        todayResult: "won",
        streakHistory: [],
      };

      DailyChallengeStorage.saveData(data);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "dailyChallenge",
        JSON.stringify(data)
      );
    });
  });

  describe("markIntroSeen", () => {
    it("should set hasSeenIntro to true and save", () => {
      const data = DailyChallengeStorage.markIntroSeen();

      expect(data.hasSeenIntro).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe("recordGameResult", () => {
    it("should record a win and update streak", () => {
      const today = "2025-08-30";
      const data = DailyChallengeStorage.recordGameResult("won", today);

      expect(data.todayCompleted).toBe(true);
      expect(data.todayResult).toBe("won");
      expect(data.lastPlayedDate).toBe(today);
      expect(data.totalGamesPlayed).toBe(1);
      expect(data.totalGamesWon).toBe(1);
      expect(data.currentStreak).toBe(1);
      expect(data.streakHistory).toHaveLength(1);
      expect(data.streakHistory[0]).toEqual({
        date: today,
        result: "won",
        streak: 1,
      });
    });

    it("should record a loss and reset streak", () => {
      // Set up existing streak
      const existingData: DailyChallengeData = {
        ...DailyChallengeStorage.getDefaultData(),
        currentStreak: 3,
        totalGamesPlayed: 3,
        totalGamesWon: 3,
      };
      DailyChallengeStorage.saveData(existingData);

      const today = "2025-08-30";
      const data = DailyChallengeStorage.recordGameResult("lost", today);

      expect(data.todayCompleted).toBe(true);
      expect(data.todayResult).toBe("lost");
      expect(data.currentStreak).toBe(0);
      expect(data.totalGamesPlayed).toBe(4);
      expect(data.totalGamesWon).toBe(3);
    });

    it("should continue streak for consecutive days", () => {
      // Set up yesterday's win
      const yesterday = "2025-08-29";
      const existingData: DailyChallengeData = {
        ...DailyChallengeStorage.getDefaultData(),
        currentStreak: 1,
        lastPlayedDate: yesterday,
        totalGamesPlayed: 1,
        totalGamesWon: 1,
        streakHistory: [{ date: yesterday, result: "won", streak: 1 }],
      };
      DailyChallengeStorage.saveData(existingData);

      const today = "2025-08-30";
      const data = DailyChallengeStorage.recordGameResult("won", today);

      expect(data.currentStreak).toBe(2);
      expect(data.streakHistory).toHaveLength(2);
      expect(data.streakHistory[1].streak).toBe(2);
    });

    it("should reset streak for non-consecutive days", () => {
      // Set up win from 3 days ago
      const threeDaysAgo = "2025-08-27";
      const existingData: DailyChallengeData = {
        ...DailyChallengeStorage.getDefaultData(),
        currentStreak: 1,
        lastPlayedDate: threeDaysAgo,
        totalGamesPlayed: 1,
        totalGamesWon: 1,
      };
      DailyChallengeStorage.saveData(existingData);

      const today = "2025-08-30";
      const data = DailyChallengeStorage.recordGameResult("won", today);

      expect(data.currentStreak).toBe(1); // Reset to 1, not 2
    });
  });

  describe("resetDailyProgress", () => {
    it("should reset daily progress for new day", () => {
      const existingData: DailyChallengeData = {
        ...DailyChallengeStorage.getDefaultData(),
        todayCompleted: true,
        todayResult: "won",
      };
      DailyChallengeStorage.saveData(existingData);

      const data = DailyChallengeStorage.resetDailyProgress();

      expect(data.todayCompleted).toBe(false);
      expect(data.todayResult).toBe(null);
    });
  });
});
