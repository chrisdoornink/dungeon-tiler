export class DateUtils {
  /**
   * Get today's date as YYYY-MM-DD string
   */
  static getTodayString(): string {
    return new Date().toISOString().split('T')[0];
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
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    const timeDiff = d2.getTime() - d1.getTime();
    return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  }

  /**
   * Add days to a date string and return new date string
   */
  static addDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }
}
