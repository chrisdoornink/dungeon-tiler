import { WORD_BANK, type CrosswordEntry } from "./wordBank";

export type Orientation = "across" | "down";

export interface PlacedWord {
  entry: CrosswordEntry;
  row: number;
  col: number;
  orientation: Orientation;
}

export interface CrosswordPuzzle {
  size: number;
  grid: (string | null)[][];
  words: PlacedWord[];
  seed: string;
}

const GRID_SIZE = 10;
const MAX_WORDS = 5;
const MAX_ATTEMPTS = 60;

function hashStringToSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededRng(seedValue: string): () => number {
  let numericSeed = hashStringToSeed(seedValue);
  if (numericSeed === 0) {
    numericSeed = 1;
  }
  return mulberry32(numericSeed);
}

function shuffle<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function createEmptyGrid(size: number): (string | null)[][] {
  return Array.from({ length: size }, () => Array<string | null>(size).fill(null));
}

function canPlace(
  word: string,
  row: number,
  col: number,
  orientation: Orientation,
  grid: (string | null)[][],
): boolean {
  const size = grid.length;
  const length = word.length;
  const letters = word.toUpperCase();
  if (orientation === "across") {
    if (row < 0 || row >= size || col < 0 || col + length > size) {
      return false;
    }
    if (col > 0 && grid[row][col - 1]) {
      return false;
    }
    if (col + length < size && grid[row][col + length]) {
      return false;
    }
    for (let i = 0; i < length; i += 1) {
      const currentCol = col + i;
      const cell = grid[row][currentCol];
      const char = letters[i];
      if (cell && cell !== char) {
        return false;
      }
      if (!cell) {
        if (row > 0 && grid[row - 1][currentCol]) {
          return false;
        }
        if (row + 1 < size && grid[row + 1][currentCol]) {
          return false;
        }
      }
    }
    return true;
  }

  if (row < 0 || col < 0 || col >= size || row + length > size) {
    return false;
  }
  if (row > 0 && grid[row - 1][col]) {
    return false;
  }
  if (row + length < size && grid[row + length][col]) {
    return false;
  }
  for (let i = 0; i < length; i += 1) {
    const currentRow = row + i;
    const cell = grid[currentRow][col];
    const char = letters[i];
    if (cell && cell !== char) {
      return false;
    }
    if (!cell) {
      if (col > 0 && grid[currentRow][col - 1]) {
        return false;
      }
      if (col + 1 < size && grid[currentRow][col + 1]) {
        return false;
      }
    }
  }
  return true;
}

function placeWord(
  word: string,
  row: number,
  col: number,
  orientation: Orientation,
  grid: (string | null)[][],
): void {
  const letters = word.toUpperCase();
  if (orientation === "across") {
    for (let i = 0; i < letters.length; i += 1) {
      grid[row][col + i] = letters[i];
    }
  } else {
    for (let i = 0; i < letters.length; i += 1) {
      grid[row + i][col] = letters[i];
    }
  }
}

function tryPlaceFirstWord(
  entry: CrosswordEntry,
  grid: (string | null)[][],
  rng: () => number,
): PlacedWord | null {
  const orientation: Orientation = rng() < 0.5 ? "across" : "down";
  const length = entry.word.length;
  const size = grid.length;
  const maxRow = orientation === "across" ? size - 1 : size - length;
  const maxCol = orientation === "across" ? size - length : size - 1;
  if (maxRow < 0 || maxCol < 0) {
    return null;
  }

  for (let attempts = 0; attempts < 20; attempts += 1) {
    const row = Math.floor(rng() * (maxRow + 1));
    const col = Math.floor(rng() * (maxCol + 1));
    if (canPlace(entry.word, row, col, orientation, grid)) {
      placeWord(entry.word, row, col, orientation, grid);
      return { entry, row, col, orientation };
    }
  }
  return null;
}

function buildCandidatePlacements(
  entry: CrosswordEntry,
  placedWords: PlacedWord[],
  grid: (string | null)[][],
): Array<{ row: number; col: number; orientation: Orientation }> {
  const candidates: Array<{ row: number; col: number; orientation: Orientation }> = [];
  const upperWord = entry.word.toUpperCase();

  for (const placed of placedWords) {
    const targetOrientation: Orientation = placed.orientation === "across" ? "down" : "across";
    const baseWord = placed.entry.word.toUpperCase();
    for (let i = 0; i < baseWord.length; i += 1) {
      const baseLetter = baseWord[i];
      for (let j = 0; j < upperWord.length; j += 1) {
        if (upperWord[j] !== baseLetter) {
          continue;
        }
        if (targetOrientation === "down") {
          const crossRow = placed.row;
          const crossCol = placed.col + i;
          const startRow = crossRow - j;
          const startCol = crossCol;
          candidates.push({ row: startRow, col: startCol, orientation: "down" });
        } else {
          const crossRow = placed.row + i;
          const crossCol = placed.col;
          const startRow = crossRow;
          const startCol = crossCol - j;
          candidates.push({ row: startRow, col: startCol, orientation: "across" });
        }
      }
    }
  }

  return candidates;
}

function tryPlaceWithCrossing(
  entry: CrosswordEntry,
  placedWords: PlacedWord[],
  grid: (string | null)[][],
  rng: () => number,
): PlacedWord | null {
  const candidates = buildCandidatePlacements(entry, placedWords, grid);
  if (candidates.length === 0) {
    return null;
  }
  shuffle(candidates, rng);
  for (const candidate of candidates) {
    if (canPlace(entry.word, candidate.row, candidate.col, candidate.orientation, grid)) {
      placeWord(entry.word, candidate.row, candidate.col, candidate.orientation, grid);
      return { entry, ...candidate };
    }
  }
  return null;
}

function attemptBuildPuzzle(entries: CrosswordEntry[], rng: () => number): CrosswordPuzzle | null {
  const grid = createEmptyGrid(GRID_SIZE);
  const placed: PlacedWord[] = [];

  for (const entry of entries) {
    if (entry.word.length > GRID_SIZE) {
      continue;
    }

    if (placed.length === 0) {
      const firstPlacement = tryPlaceFirstWord(entry, grid, rng);
      if (firstPlacement) {
        placed.push(firstPlacement);
      }
      continue;
    }

    const placement = tryPlaceWithCrossing(entry, placed, grid, rng);
    if (placement) {
      placed.push(placement);
    }

    if (placed.length >= MAX_WORDS) {
      return {
        size: GRID_SIZE,
        grid,
        words: placed,
        seed: "",
      };
    }
  }

  if (placed.length >= MAX_WORDS) {
    return {
      size: GRID_SIZE,
      grid,
      words: placed,
      seed: "",
    };
  }

  return null;
}

export function generateCrosswordForSeed(seed: string): CrosswordPuzzle {
  const rng = createSeededRng(seed);
  const entries = WORD_BANK.filter((entry) => entry.word.length <= GRID_SIZE);

  if (entries.length < MAX_WORDS) {
    throw new Error("Insufficient words in the bank to build a crossword.");
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const shuffled = [...entries];
    shuffle(shuffled, rng);
    const puzzle = attemptBuildPuzzle(shuffled, rng);
    if (puzzle) {
      return { ...puzzle, seed };
    }
  }

  throw new Error("Failed to generate crossword after multiple attempts.");
}

export function generateDailyCrossword(date: Date = new Date()): CrosswordPuzzle {
  const seed = date.toISOString().slice(0, 10);
  return generateCrosswordForSeed(seed);
}

export function generateRandomCrossword(): CrosswordPuzzle {
  const seed = `${Date.now()}-${Math.random()}`;
  return generateCrosswordForSeed(seed);
}
