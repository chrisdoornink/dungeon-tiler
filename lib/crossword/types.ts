export type Direction = "across" | "down";

export interface CrosswordPlacement {
  word: string;
  clue: string;
  hint?: string;
  row: number;
  col: number;
  direction: Direction;
}

export interface CrosswordPuzzle {
  dateKey: string;
  grid: string[][];
  placements: CrosswordPlacement[];
}
