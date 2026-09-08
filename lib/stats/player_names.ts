// Stable pseudonyms for PostHog distinct_ids on the /stats dashboard.
//
// A distinct_id is an opaque anonymous UUID, which is useless for spotting the same
// player across days at a glance. Hashing it into "Adjective Animal" gives every id a
// memorable, deterministic handle: the same player always gets the same name, on every
// page load and every page of history, without storing anything anywhere. Names are
// pseudonymous only — they carry no information about the person behind the id.

const ADJECTIVES = [
  "Amber", "Brave", "Clever", "Dusty", "Eager", "Fierce", "Gentle", "Hasty",
  "Icy", "Jolly", "Keen", "Lucky", "Merry", "Nimble", "Odd", "Plucky",
  "Quiet", "Rusty", "Sly", "Tidy", "Umber", "Vivid", "Wild", "Zesty",
  "Bold", "Crimson", "Dapper", "Frosty", "Golden", "Humble", "Ivory", "Jade",
  "Lunar", "Misty", "Noble", "Pale", "Quick", "Rowdy", "Silver", "Timid",
  "Velvet", "Witty", "Ashen", "Brisk", "Cosmic", "Dim", "Emerald", "Fabled",
];

const ANIMALS = [
  "Badger", "Crow", "Ferret", "Goblin", "Heron", "Ibex", "Jackal", "Kestrel",
  "Lynx", "Moth", "Newt", "Otter", "Pike", "Quail", "Raven", "Serpent",
  "Toad", "Viper", "Wolf", "Yak", "Beetle", "Coyote", "Drake", "Eel",
  "Falcon", "Gecko", "Hare", "Imp", "Jay", "Kite", "Lemur", "Marten",
  "Owl", "Puffin", "Rook", "Stoat", "Tern", "Urchin", "Vole", "Wren",
  "Adder", "Bison", "Cricket", "Dingo", "Egret", "Finch", "Grouse", "Hound",
];

/** FNV-1a 32-bit — tiny, dependency-free, and stable across runtimes. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic "Adjective Animal" pseudonym for a distinct_id. */
export function playerNameFor(distinctId: string): string {
  const h = fnv1a(distinctId);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  // Use the upper bits for the second pick so adjective and animal aren't correlated.
  const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length];
  return `${adj} ${animal}`;
}

/** A player who completed daily runs on 2+ distinct days inside the lookback window. */
export interface ReturningPlayer {
  name: string;
  /** Number of distinct daily-challenge days they completed a run on. */
  days: number;
}

/**
 * Build the returning-player map from `(distinct_id, day)` pairs. Only players seen on
 * at least `minDays` distinct days are kept, so one-off visitors stay anonymous rows.
 */
export function returningPlayersFrom(
  pairs: { distinctId: string; day: string }[],
  minDays = 2
): Record<string, ReturningPlayer> {
  const daysById = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!p.distinctId || !p.day) continue;
    const set = daysById.get(p.distinctId);
    if (set) set.add(p.day);
    else daysById.set(p.distinctId, new Set([p.day]));
  }
  const out: Record<string, ReturningPlayer> = {};
  for (const [id, set] of daysById) {
    if (set.size >= minDays) out[id] = { name: playerNameFor(id), days: set.size };
  }
  return out;
}
