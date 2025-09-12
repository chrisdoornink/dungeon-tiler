export class DateUtils {
  /**
   * Get today's date as YYYY-MM-DD string in local timezone
   */
  static getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Convert UTC date string to local date string
   * Used for migrating existing UTC-based localStorage data
   */
  static convertUTCToLocal(utcDateString: string): string {
    if (!utcDateString) return utcDateString;
    
    // Parse UTC date and convert to local timezone
    const utcDate = new Date(utcDateString + 'T00:00:00Z');
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Check if two date strings represent the same day
   */
  static isSameDay(date1: string, date2: string): boolean {
    if (!date1 || !date2) return false;
    return date1 === date2;
  }

  /**
   * Check if a date string is today
   */
  static isToday(dateString: string): boolean {
    if (!dateString) return false;
    return this.isSameDay(dateString, this.getTodayString());
  }

  /**
   * Check if date2 is the day after date1
   */
  static isConsecutiveDay(date1: string, date2: string): boolean {
    if (!date1 || !date2) return false;
    
    const nextDay = this.addDays(date1, 1);
    return nextDay === date2;
  }

  /**
   * Get the difference in days between two dates
   * Returns positive if date2 is after date1, negative if before
   */
  static getDaysDifference(date1: string, date2: string): number {
    const d1 = new Date(date1 + 'T00:00:00'); // Ensure local timezone interpretation
    const d2 = new Date(date2 + 'T00:00:00'); // Ensure local timezone interpretation
    
    const timeDiff = d2.getTime() - d1.getTime();
    return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  }

  /**
   * Add days to a date string and return new date string in local timezone
   */
  static addDays(dateString: string, days: number): string {
    const date = new Date(dateString + 'T00:00:00'); // Ensure local timezone interpretation
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
