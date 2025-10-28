"use client";

import { useMemo, useState } from "react";

import type { CrosswordPuzzle, Orientation } from "../../lib/crossword/generator";
import { generateCrosswordForSeed, generateRandomCrossword } from "../../lib/crossword/generator";

interface CrosswordLabProps {
  initialPuzzle: CrosswordPuzzle;
}

interface DisplayWord {
  id: string;
  index: number;
  word: string;
  clue: string;
  orientation: Orientation;
  row: number;
  col: number;
}

function formatPosition(row: number, col: number): string {
  return `${row + 1},${col + 1}`;
}

function prepareWords(puzzle: CrosswordPuzzle): DisplayWord[] {
  return puzzle.words.map((placed, index) => ({
    id: `${placed.orientation}-${placed.row}-${placed.col}-${placed.entry.word}`,
    index: index + 1,
    word: placed.entry.word.toUpperCase(),
    clue: placed.entry.clue,
    orientation: placed.orientation,
    row: placed.row,
    col: placed.col,
  }));
}

export default function CrosswordLab({ initialPuzzle }: CrosswordLabProps) {
  const [currentPuzzle, setCurrentPuzzle] = useState<CrosswordPuzzle>(initialPuzzle);
  const [seed, setSeed] = useState(initialPuzzle.seed);

  const displayWords = useMemo(() => prepareWords(currentPuzzle), [currentPuzzle]);

  const acrossWords = useMemo(
    () => displayWords.filter((word) => word.orientation === "across"),
    [displayWords],
  );

  const downWords = useMemo(
    () => displayWords.filter((word) => word.orientation === "down"),
    [displayWords],
  );

  const handleRandomize = () => {
    const nextPuzzle = generateRandomCrossword();
    setCurrentPuzzle(nextPuzzle);
    setSeed(nextPuzzle.seed);
  };

  const handleLoadSeed = (value: string) => {
    if (!value) {
      return;
    }
    try {
      const seeded = generateCrosswordForSeed(value);
      setCurrentPuzzle(seeded);
      setSeed(value);
    } catch (error) {
      console.error("Failed to generate crossword for seed", error);
    }
  };

  const handleResetToDaily = () => {
    handleLoadSeed(initialPuzzle.seed);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Laboratory</p>
          <h1 className="text-4xl font-bold">Crossword Prototype</h1>
          <p className="max-w-2xl text-base text-slate-300">
            A playground for experimenting with generating a five-word daily crossword inside a ten-by-ten grid. Try the
            generator with different random seeds and inspect how the words intersect.
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Grid</h2>
                <p className="text-sm text-slate-400">Seed: {seed}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRandomize}
                  className="rounded border border-amber-400 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-amber-400 transition hover:bg-amber-400 hover:text-slate-950"
                >
                  Reroll
                </button>
                <button
                  type="button"
                  onClick={handleResetToDaily}
                  className="rounded border border-slate-600 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-slate-200 transition hover:bg-slate-200 hover:text-slate-950"
                >
                  Today's seed
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-lg shadow-black/30">
              <div className="grid grid-cols-10 gap-[3px]">
                {currentPuzzle.grid.map((row, rowIndex) =>
                  row.map((cell, colIndex) => (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      className={`flex h-10 w-10 items-center justify-center rounded-sm text-lg font-semibold ${
                        cell ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-700"
                      }`}
                    >
                      {cell ?? ""}
                    </div>
                  )),
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Across</h2>
              <ul className="space-y-3 text-sm text-slate-200">
                {acrossWords.map((word) => (
                  <li key={word.id} className="rounded border border-slate-700 bg-slate-900/80 p-3">
                    <p className="font-semibold">
                      {word.index}. {word.word} · start {formatPosition(word.row, word.col)}
                    </p>
                    <p className="text-slate-400">{word.clue}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Down</h2>
              <ul className="space-y-3 text-sm text-slate-200">
                {downWords.map((word) => (
                  <li key={word.id} className="rounded border border-slate-700 bg-slate-900/80 p-3">
                    <p className="font-semibold">
                      {word.index}. {word.word} · start {formatPosition(word.row, word.col)}
                    </p>
                    <p className="text-slate-400">{word.clue}</p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Custom seed</h2>
          <p className="text-sm text-slate-400">
            Paste a seed value to recreate a specific crossword layout. The seed uses a deterministic generator, so the same
            value will always produce the same grid.
          </p>
          <form
            className="flex flex-wrap items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const value = String(formData.get("seed") ?? "").trim();
              handleLoadSeed(value);
            }}
          >
            <input
              className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              defaultValue={seed}
              name="seed"
              placeholder="YYYY-MM-DD or any custom value"
              type="text"
            />
            <button
              type="submit"
              className="rounded border border-amber-400 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-amber-400 transition hover:bg-amber-400 hover:text-slate-950"
            >
              Load seed
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
