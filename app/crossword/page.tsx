import { generateCrosswordForKey } from "@/lib/crossword/generator";
import CrosswordGrid from "@/components/crossword/CrosswordGrid";

export const dynamic = "force-dynamic";

export default function CrosswordPage() {
  const randomSeed = `random-${Math.random()}-${Date.now()}`;
  const puzzle = generateCrosswordForKey(randomSeed);

  return (
    <div className="min-h-screen bg-white px-6 py-10 text-black" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif' }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <CrosswordGrid puzzle={puzzle} />
      </div>
    </div>
  );
}
