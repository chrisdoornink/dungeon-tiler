// Shared monster grouping for end-of-run summaries (share text + on-screen displays).
//
// Collapses the many goblin variants into a single "Goblin" bucket and gives the
// distinctive enemies their own identity, so the daily share reads as
//   ⚔️ 14: 👹×10 🔮×1 🗿×1 🐍×2
// instead of a wall of unintuitive colored dots. Used by both the daily completed
// screen and the non-daily /end screen so the two stay in lockstep.
import { EnemyKind, getEnemyIcon } from "./registry";

export interface MonsterGroup {
  /** Stable identifier for the group (not user-facing). */
  key: string;
  /** Human-readable singular label, e.g. "Goblin". */
  label: string;
  /** Emoji used in shareable text. */
  emoji: string;
  /** Number of kills falling into this group. */
  count: number;
  /** Representative sprite path for on-screen rendering. */
  spriteSrc: string;
}

export interface MonsterSummary {
  /** Total monsters defeated across all groups. */
  total: number;
  /** Non-empty groups in canonical display order. */
  groups: MonsterGroup[];
}

interface GroupDef {
  key: string;
  label: string;
  emoji: string;
  rep: EnemyKind;
  kinds: EnemyKind[];
}

// Canonical display order: the common goblins first, then the distinctive enemies.
// Every goblin variant (color + weapon, and the white swarm) collapses into one
// "Goblin" group; the pink goblin is the Magician, the stone goblin gets 🗿, and
// snakes and wisps keep their own identity.
const GROUP_DEFS: GroupDef[] = [
  {
    key: "goblin",
    label: "Goblin",
    emoji: "👹",
    rep: "fire-goblin",
    kinds: [
      "fire-goblin",
      "water-goblin",
      "water-goblin-spear",
      "earth-goblin",
      "earth-goblin-knives",
      "white-goblin",
    ],
  },
  {
    key: "magician",
    label: "Magician",
    emoji: "🔮",
    rep: "pink-goblin",
    kinds: ["pink-goblin"],
  },
  {
    key: "stone",
    label: "Stone Goblin",
    emoji: "🗿",
    rep: "stone-goblin",
    kinds: ["stone-goblin"],
  },
  { key: "snake", label: "Snake", emoji: "🐍", rep: "snake", kinds: ["snake"] },
  { key: "wisp", label: "Wisp", emoji: "👻", rep: "ghost", kinds: ["ghost"] },
];

// Reverse lookup: enemy kind -> its group definition.
const KIND_TO_GROUP: Partial<Record<EnemyKind, GroupDef>> = {};
for (const def of GROUP_DEFS) {
  for (const k of def.kinds) KIND_TO_GROUP[k] = def;
}

/** Group emoji for a single enemy kind (used for "slain by …" death lines). */
export function shareEmojiForKind(kind: EnemyKind): string {
  return KIND_TO_GROUP[kind]?.emoji ?? "👹";
}

/**
 * Collapse a per-kind kill tally into display groups.
 *
 * @param byKind kills keyed by EnemyKind (any subset; missing kinds count as 0)
 * @param fallbackTotal used only when byKind is absent/empty — rendered as generic goblins
 */
export function summarizeMonsters(
  byKind?: Partial<Record<EnemyKind, number>> | null,
  fallbackTotal?: number
): MonsterSummary {
  const groups: MonsterGroup[] = [];
  let total = 0;

  if (byKind) {
    for (const def of GROUP_DEFS) {
      let count = 0;
      for (const k of def.kinds) {
        const n = byKind[k];
        if (typeof n === "number" && n > 0) count += n;
      }
      if (count > 0) {
        groups.push({
          key: def.key,
          label: def.label,
          emoji: def.emoji,
          count,
          spriteSrc: getEnemyIcon(def.rep, "front"),
        });
        total += count;
      }
    }
  }

  // Older saves (or non-daily runs) may only carry an aggregate count. Show those
  // as generic goblins rather than dropping the kill tally entirely.
  if (total === 0 && typeof fallbackTotal === "number" && fallbackTotal > 0) {
    const def = GROUP_DEFS[0];
    groups.push({
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      count: fallbackTotal,
      spriteSrc: getEnemyIcon(def.rep, "front"),
    });
    total = fallbackTotal;
  }

  return { total, groups };
}

/**
 * Share-text line for the monster summary, e.g.:
 *   ⚔️ 14: 👹×10 🔮×1 🗿×1 🐍×2
 * Returns [] when nothing was defeated.
 */
export function monsterShareLines(summary: MonsterSummary): string[] {
  if (summary.total <= 0) return [];
  const breakdown = summary.groups
    .map((g) => `${g.emoji}×${g.count}`)
    .join(" ");
  return [breakdown ? `⚔️ ${summary.total}: ${breakdown}` : `⚔️ ${summary.total}`];
}
