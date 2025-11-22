import { generateCrosswordForSeed } from "../lib/crossword/generator";

function countLetters(grid: (string | null)[][]): number {
  return grid.reduce(
    (total, row) =>
      total + row.reduce((rowTotal, cell) => rowTotal + (cell ? 1 : 0), 0),
    0,
  );
}

describe("crossword generator", () => {
  it("creates five words for a deterministic seed", () => {
    const puzzle = generateCrosswordForSeed("2025-01-15");

    expect(puzzle.words).toHaveLength(5);
    expect(countLetters(puzzle.grid)).toBeGreaterThan(0);

    for (const placed of puzzle.words) {
      const letters = placed.entry.word.length;
      if (placed.orientation === "across") {
        expect(placed.col + letters).toBeLessThanOrEqual(puzzle.size);
      } else {
        expect(placed.row + letters).toBeLessThanOrEqual(puzzle.size);
      }
    }
  });

  it("replays the same layout for the same seed", () => {
    const first = generateCrosswordForSeed("2025-01-16");
    const second = generateCrosswordForSeed("2025-01-16");

    expect(second.grid).toEqual(first.grid);
    expect(second.words).toEqual(first.words);
  });
});
