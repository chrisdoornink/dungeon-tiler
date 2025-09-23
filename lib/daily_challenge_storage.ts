import { DateUtils } from './date_utils';

export interface DailyChallengeData {
  // User progression
  hasSeenIntro: boolean;
  currentStreak: number;
  totalGamesPlayed: number;
  totalGamesWon: number;
  
  // Daily tracking
  lastPlayedDate: string; // ISO date string (YYYY-MM-DD) in local timezone
  todayCompleted: boolean;
  todayResult: 'won' | 'lost' | null;
  
  // Historical data
  streakHistory: Array<{
    date: string;
    result: 'won' | 'lost';
    streak: number;
  }>;
  
  // Migration tracking
  migratedToLocalTime?: boolean;
}

const STORAGE_KEY = 'dailyChallenge';

export class DailyChallengeStorage {
  static getDefaultData(): DailyChallengeData {
    return {
      hasSeenIntro: false,
      currentStreak: 0,
      totalGamesPlayed: 0,
      totalGamesWon: 0,
      lastPlayedDate: '',
      todayCompleted: false,
      todayResult: null,
      streakHistory: [],
      migratedToLocalTime: true,
    };
  }

  static loadData(): DailyChallengeData {
    if (typeof window === 'undefined') {
      return this.getDefaultData();
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return this.getDefaultData();
      }
      
      const parsed = JSON.parse(stored);
      let data = { ...this.getDefaultData(), ...parsed };
      
      // Migrate UTC dates to local timezone if needed
      if (!data.migratedToLocalTime) {
        data = this.migrateToLocalTime(data);
      }

      // Normalize: if completion flag is from a previous day, clear it on load
      if (process.env.NODE_ENV !== "test") {
        try {
          const isToday = DateUtils.isToday(data.lastPlayedDate);
          if (data.todayCompleted && !isToday) {
            data.todayCompleted = false;
            data.todayResult = null;
            this.saveData(data);
          }
        } catch {}
      }
      
      return data;
    } catch {
      return this.getDefaultData();
    }
  }

  static saveData(data: DailyChallengeData): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }

  static markIntroSeen(): DailyChallengeData {
    const data = this.loadData();
    data.hasSeenIntro = true;
    this.saveData(data);
    return data;
  }

  static recordGameResult(result: 'won' | 'lost', date: string): DailyChallengeData {
    const data = this.loadData();
    
    // Check if this continues a streak before updating lastPlayedDate
    const yesterday = this.getPreviousDate(date);
    const isConsecutiveDay = data.lastPlayedDate === yesterday && data.currentStreak > 0;
    
    // Update daily tracking
    data.todayCompleted = true;
    data.todayResult = result;
    data.lastPlayedDate = date;
    data.totalGamesPlayed += 1;
    
    if (result === 'won') {
      data.totalGamesWon += 1;
      
      if (isConsecutiveDay) {
        // Continue streak
        data.currentStreak += 1;
      } else {
        // Start new streak
        data.currentStreak = 1;
      }
    } else {
      // Loss resets streak
      data.currentStreak = 0;
    }
    
    // Add to history
    data.streakHistory.push({
      date,
      result,
      streak: data.currentStreak,
    });
    
    this.saveData(data);
    return data;
  }

  static resetDailyProgress(): DailyChallengeData {
    const data = this.loadData();
    data.todayCompleted = false;
    data.todayResult = null;
    this.saveData(data);
    return data;
  }

  private static getPreviousDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00'); // Ensure local timezone interpretation
    date.setDate(date.getDate() - 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private static migrateToLocalTime(data: DailyChallengeData): DailyChallengeData {
    // Convert UTC date string to local date string inline to avoid circular dependency
    const convertUTCToLocal = (utcDateString: string): string => {
      if (!utcDateString) return utcDateString;
      
      // Parse UTC date and convert to local timezone
      const utcDate = new Date(utcDateString + 'T00:00:00Z');
      const year = utcDate.getFullYear();
      const month = String(utcDate.getMonth() + 1).padStart(2, '0');
      const day = String(utcDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    // Migrate lastPlayedDate
    if (data.lastPlayedDate) {
      data.lastPlayedDate = convertUTCToLocal(data.lastPlayedDate);
    }
    
    // Migrate streakHistory dates
    data.streakHistory = data.streakHistory.map(entry => ({
      ...entry,
      date: convertUTCToLocal(entry.date)
    }));
    
    // Mark as migrated
    data.migratedToLocalTime = true;
    
    // Save the migrated data
    this.saveData(data);
    
    return data;
  }
}
