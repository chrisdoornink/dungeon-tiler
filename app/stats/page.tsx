import type { Metadata } from "next";
import EndgameStats from "../../components/stats/EndgameStats";

// Internal analytics view — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Endgame Stats",
  robots: { index: false, follow: false },
};

export default function StatsPage() {
  return <EndgameStats />;
}
