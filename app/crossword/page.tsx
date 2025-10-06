import { getDailyCrossword } from "@/lib/crossword/generator";

export const dynamic = "force-dynamic";

function formatDirection(direction: "across" | "down") {
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

export default function CrosswordPage() {
  const puzzle = getDailyCrossword();
  const { grid, placements, dateKey } = puzzle;

  const numberedClues = placements.map((placement, index) => ({
    number: index + 1,
    ...placement,
  }));

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-wide text-slate-400">
            Daily experiment
          </p>
          <h1 className="text-3xl font-bold">Mini Crossword Prototype</h1>
          <p className="max-w-2xl text-slate-300">
            A tiny five-word crossword idea generator. Each puzzle is seeded by the
            current day ({dateKey}) so you can revisit a grid later and share it with
            friends. All words are six letters or shorter and the full layout fits in a
            10 by 10 board.
          </p>
        </header>

        <div className="flex flex-col gap-10 lg:flex-row">
          <section className="mx-auto w-full max-w-sm">
            <div className="grid grid-cols-10 gap-px rounded-lg bg-slate-700 p-px shadow-lg shadow-slate-900/40">
              {grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => {
                  const key = `${rowIndex}-${colIndex}`;
                  const isActive = Boolean(cell);
                  return (
                    <div
                      key={key}
                      className={`flex h-10 w-10 items-center justify-center text-lg font-semibold transition-colors ${
                        isActive ? "bg-slate-900" : "bg-slate-800 text-slate-700"
                      }`}
                    >
                      {cell}
                    </div>
                  );
                }),
              )}
            </div>
          </section>

          <section className="flex-1 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Clues</h2>
              <p className="text-sm text-slate-400">
                Words are listed in the order they were placed into the grid. Coordinates
                are one-indexed.
              </p>
            </div>

            {numberedClues.length === 0 ? (
              <p className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                No crossword could be generated for this date. Try again tomorrow!
              </p>
            ) : (
              <ol className="space-y-3 text-slate-200">
                {numberedClues.map((clue) => (
                  <li
                    key={`${clue.number}-${clue.word}`}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow shadow-slate-950/50"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-3">
                        <span className="text-lg font-semibold text-slate-100">
                          {clue.number}.
                        </span>
                        <span className="font-semibold text-sky-300">
                          {formatDirection(clue.direction)}
                        </span>
                      </div>
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        Row {clue.row + 1}, Col {clue.col + 1}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{clue.clue}</p>
                    <p className="mt-2 text-base font-semibold tracking-widest text-slate-100">
                      {clue.word}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
