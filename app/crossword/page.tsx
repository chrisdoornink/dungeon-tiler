import { generateCrosswordForKey } from "@/lib/crossword/generator";
import CrosswordGrid from "@/components/crossword/CrosswordGrid";

export const dynamic = "force-dynamic";

function formatDirection(direction: "across" | "down") {
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

export default function CrosswordPage() {
  const randomSeed = `random-${Math.random()}-${Date.now()}`;
  const puzzle = generateCrosswordForKey(randomSeed);
  const { dateKey } = puzzle;

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-wide text-slate-400">
            Prototype experiment
          </p>
          <h1 className="text-3xl font-bold">Mini Crossword Prototype</h1>
          <p className="max-w-2xl text-slate-300">
            A tiny five-word crossword idea generator. Each refresh generates a
            completely random puzzle. All words are six letters or shorter and the full
            layout fits in a 10 by 10 board.
          </p>
        </header>

        <CrosswordGrid puzzle={puzzle} />
      </div>
    </div>
  );
}
