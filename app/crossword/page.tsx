import CrosswordLab from "./CrosswordLab";
import { generateDailyCrossword } from "../../lib/crossword/generator";

export const dynamic = "force-dynamic";

export default function CrosswordPage() {
  const puzzle = generateDailyCrossword();
  return <CrosswordLab initialPuzzle={puzzle} />;
}
