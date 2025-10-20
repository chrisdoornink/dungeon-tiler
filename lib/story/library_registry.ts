import type { StoryFlags } from "./event_registry";

/**
 * Represents a single book/excerpt that can be read
 */
export interface BookExcerpt {
  id: string;
  title: string;
  content: string;
  /** Optional conditions that must be met for this excerpt to be visible */
  conditions?: Array<{
    flag?: keyof StoryFlags;
    value?: boolean | string | number;
    timeOfDay?: "day" | "night";
  }>;
  /** Optional story event ID to trigger when this excerpt is read */
  onReadEventId?: string;
}

/**
 * Represents a bookshelf location with its available excerpts
 */
export interface BookshelfData {
  /** Unique identifier for this bookshelf (e.g., "library-shelf-1-1") */
  id: string;
  /** Room ID where this bookshelf is located */
  roomId: string;
  /** Y coordinate of the bookshelf */
  y: number;
  /** X coordinate of the bookshelf */
  x: number;
  /** List of book excerpts available on this shelf */
  excerpts: BookExcerpt[];
}

/**
 * Registry of all bookshelves and their contents
 */
const bookshelfRegistry: Map<string, BookshelfData> = new Map();

/**
 * Register a bookshelf with its contents
 */
export function registerBookshelf(data: BookshelfData): void {
  bookshelfRegistry.set(data.id, data);
}

/**
 * Get bookshelf data by ID
 */
export function getBookshelf(id: string): BookshelfData | undefined {
  return bookshelfRegistry.get(id);
}

/**
 * Get bookshelf at a specific location
 */
export function getBookshelfAtPosition(
  roomId: string,
  y: number,
  x: number
): BookshelfData | undefined {
  for (const shelf of bookshelfRegistry.values()) {
    if (shelf.roomId === roomId && shelf.y === y && shelf.x === x) {
      return shelf;
    }
  }
  return undefined;
}

/**
 * Get available excerpts for a bookshelf based on current story flags
 */
export function getAvailableExcerpts(
  bookshelfId: string,
  storyFlags: StoryFlags
): BookExcerpt[] {
  const shelf = getBookshelf(bookshelfId);
  if (!shelf) return [];

  return shelf.excerpts.filter((excerpt) => {
    if (!excerpt.conditions || excerpt.conditions.length === 0) return true;

    return excerpt.conditions.every((condition) => {
      if (condition.flag !== undefined) {
        const flagValue = storyFlags[condition.flag];
        if (condition.value !== undefined) {
          return flagValue === condition.value;
        }
        return !!flagValue;
      }
      // Add other condition types as needed
      return true;
    });
  });
}

/**
 * Clear all registered bookshelves (useful for testing)
 */
export function clearBookshelfRegistry(): void {
  bookshelfRegistry.clear();
}
