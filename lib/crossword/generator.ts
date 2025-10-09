import { WORD_BANK, WordEntry } from "./word-bank";
import { createSeededRandom, randomChoice, shuffleInPlace } from "./random";
import { CrosswordPlacement, CrosswordPuzzle, Direction } from "./types";

const GRID_SIZE = 10;
const MAX_WORDS = 8;

const directionVectors: Record<Direction, { dr: number; dc: number }> = {
  across: { dr: 0, dc: 1 },
  down: { dr: 1, dc: 0 },
};

type Grid = string[][];

type CandidatePlacement = CrosswordPlacement;

function createEmptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(""));
}

function isWithinBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

function canPlaceWord(
  grid: Grid,
  word: string,
  row: number,
  col: number,
  direction: Direction,
): boolean {
  const { dr, dc } = directionVectors[direction];
  const length = word.length;
  const beforeRow = row - dr;
  const beforeCol = col - dc;
  const afterRow = row + dr * length;
  const afterCol = col + dc * length;

  if (isWithinBounds(beforeRow, beforeCol) && grid[beforeRow][beforeCol]) {
    return false;
  }

  if (isWithinBounds(afterRow, afterCol) && grid[afterRow][afterCol]) {
    return false;
  }

  const perpendicular = direction === "across" ? { dr: 1, dc: 0 } : { dr: 0, dc: 1 };

  for (let i = 0; i < length; i += 1) {
    const r = row + dr * i;
    const c = col + dc * i;

    if (!isWithinBounds(r, c)) {
      return false;
    }

    const existing = grid[r][c];
    const letter = word[i];

    if (existing && existing !== letter) {
      return false;
    }

    if (!existing) {
      const neighbors = [
        [r + perpendicular.dr, c + perpendicular.dc],
        [r - perpendicular.dr, c - perpendicular.dc],
      ];

      for (const [nr, nc] of neighbors) {
        if (isWithinBounds(nr, nc) && grid[nr][nc]) {
          return false;
        }
      }
    }
  }

  return true;
}

function placeWord(
  grid: Grid,
  word: string,
  row: number,
  col: number,
  direction: Direction,
): void {
  const { dr, dc } = directionVectors[direction];

  for (let i = 0; i < word.length; i += 1) {
    const r = row + dr * i;
    const c = col + dc * i;
    grid[r][c] = word[i];
  }
}

function getLetterPosition(placement: CrosswordPlacement, index: number) {
  const { dr, dc } = directionVectors[placement.direction];
  return {
    row: placement.row + dr * index,
    col: placement.col + dc * index,
  };
}

function findMatchingIndices(word: string, letter: string): number[] {
  const matches: number[] = [];

  for (let i = 0; i < word.length; i += 1) {
    if (word[i] === letter) {
      matches.push(i);
    }
  }

  return matches;
}

function collectCandidatePlacements(
  grid: Grid,
  word: string,
  clue: string,
  placements: CrosswordPlacement[],
): CandidatePlacement[] {
  const candidates: CandidatePlacement[] = [];

  for (const existing of placements) {
    const opposite: Direction = existing.direction === "across" ? "down" : "across";

    for (let i = 0; i < existing.word.length; i += 1) {
      const { row, col } = getLetterPosition(existing, i);
      const letter = existing.word[i];

      const matchingIndices = findMatchingIndices(word, letter);

      for (const index of matchingIndices) {
        const { dr, dc } = directionVectors[opposite];
        const startRow = row - dr * index;
        const startCol = col - dc * index;

        if (canPlaceWord(grid, word, startRow, startCol, opposite)) {
          candidates.push({
            word,
            clue,
            row: startRow,
            col: startCol,
            direction: opposite,
          });
        }
      }
    }
  }

  return candidates;
}

function tryPlaceWord(
  grid: Grid,
  entry: WordEntry,
  placements: CrosswordPlacement[],
  random: () => number,
): CrosswordPlacement | null {
  const word = entry.word.toUpperCase();

  if (placements.length === 0) {
    const row = Math.floor(GRID_SIZE / 2);
    const col = Math.floor((GRID_SIZE - word.length) / 2);

    if (!canPlaceWord(grid, word, row, col, "across")) {
      return null;
    }

    placeWord(grid, word, row, col, "across");

    const placement: CrosswordPlacement = {
      word,
      clue: entry.clue,
      hint: entry.hint,
      row,
      col,
      direction: "across",
    };

    return placement;
  }

  const candidates = collectCandidatePlacements(grid, word, entry.clue, placements);
  
  // Add hint to the selected candidate
  if (candidates.length > 0) {
    candidates.forEach(c => c.hint = entry.hint);
  }
  const candidate = randomChoice(candidates, random);

  if (!candidate) {
    return null;
  }

  placeWord(grid, word, candidate.row, candidate.col, candidate.direction);

  return candidate;
}

function buildPuzzle(
  entries: WordEntry[],
  random: () => number,
): CrosswordPuzzle | null {
  const grid = createEmptyGrid();
  const placements: CrosswordPlacement[] = [];
  const usedWords = new Set<string>();

  for (const entry of entries) {
    const word = entry.word.toUpperCase();

    if (word.length > GRID_SIZE || usedWords.has(word)) {
      continue;
    }

    const placement = tryPlaceWord(grid, entry, placements, random);

    if (placement) {
      placements.push(placement);
      usedWords.add(word);
    }

    if (placements.length >= MAX_WORDS) {
      return {
        dateKey: "",
        grid,
        placements,
      };
    }
  }

  if (placements.length === 0) {
    return null;
  }

  return {
    dateKey: "",
    grid,
    placements,
  };
}

function filterWordBank(): WordEntry[] {
  return WORD_BANK.filter((entry) => entry.word.length <= 6);
}

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function generateCrosswordForKey(dateKey: string): CrosswordPuzzle {
  const filtered = filterWordBank();
  let bestPuzzle: CrosswordPuzzle | null = null;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const orderSeed = `${dateKey}-order-${attempt}`;
    const placementSeed = `${dateKey}-placement-${attempt}`;
    const orderRandom = createSeededRandom(orderSeed);
    const placementRandom = createSeededRandom(placementSeed);
    const shuffledEntries = [...filtered];
    shuffleInPlace(shuffledEntries, orderRandom);
    const puzzle = buildPuzzle(shuffledEntries, placementRandom);

    if (!puzzle) {
      continue;
    }

    puzzle.dateKey = dateKey;

    if (puzzle.placements.length >= MAX_WORDS) {
      return puzzle;
    }

    if (!bestPuzzle || puzzle.placements.length > bestPuzzle.placements.length) {
      bestPuzzle = puzzle;
    }
  }

  if (!bestPuzzle) {
    const fallbackGrid = createEmptyGrid();
    return {
      dateKey,
      grid: fallbackGrid,
      placements: [],
    };
  }

  return bestPuzzle;
}

export function getDailyCrossword(date = new Date()): CrosswordPuzzle {
  const dateKey = getDateKey(date);
  return generateCrosswordForKey(dateKey);
}
