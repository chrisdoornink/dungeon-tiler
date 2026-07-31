// The roster of daily bosses: who exists, how each is reported, and which one a given day
// rolls. One module so adding a boss is a single entry rather than a hunt through the
// generator, the analytics payload and the stats page.
//
// Deliberately free of arena imports. `buildShaperArena`/`buildFisherArena` pull in Enemy and
// GameState, and game-state.ts imports this — routing the builders through here would make
// that cycle load-bearing. Arena construction stays in enterBossRoom, which already has both
// builders in scope; this module only answers "which boss, and how is it labelled".

/** Every boss that can hold the daily boss room. */
export type BossKind = "shaper" | "fisher" | "coilwyrm" | "quarrymaster";

export interface BossInfo {
  kind: BossKind;
  /** Name shown in tooltips and stats rows. */
  displayName: string;
  /**
   * Three emoji, used as the run's boss signature on the endgame/stats surfaces. Three
   * because one emoji reads as decoration while a triple reads as a crest, and it gives
   * each boss room enough silhouette to be recognisable at a glance in a scrolling list.
   *
   * Pick glyphs that identify THIS BOSS and nothing else. Avoid anything that already
   * stands for a common enemy or item elsewhere in the game — the Fisher's crest originally
   * used 🐍 for the snakes it throws, which was ambiguous because snakes are an ordinary
   * enemy the player meets constantly, so the crest read as "there were snakes" rather than
   * "this was the Fisher". Bracketing the creature with its weapon (X-🐦-X) is a good
   * pattern when a boss has one signature attack.
   */
  emoji: [string, string, string];
  /** One-line flavour for tooltips — what the fight actually is. */
  tagline: string;
}

export const BOSS_ROSTER: Record<BossKind, BossInfo> = {
  shaper: {
    kind: "shaper",
    displayName: "The Shaper",
    // Its two elements plus the death between them. This triple predates the roster and is
    // kept byte-identical to what the stats page already showed, so historic runs don't
    // appear to change crest.
    emoji: ["❄️", "💀", "🔥"],
    tagline: "Reshapes the ground at you — the crossing is the fight",
  },
  fisher: {
    kind: "fisher",
    displayName: "The Fisher",
    // The bird bracketed by its spears. 🏹 rather than 🔱 because at crest size its thin
    // shaft reads like the Fisher's throwing spear, where a trident reads as three prongs —
    // it is not implying a bow, which it does not have.
    emoji: ["🏹", "🐦", "🏹"],
    tagline: "A heron across a bed of spikes — rocks are your only reach",
  },
  coilwyrm: {
    kind: "coilwyrm",
    displayName: "The Coilwyrm",
    // Follows the Fisher's bracket pattern: the creature between the thing you kill it with.
    // 🪱 rather than 🐍 deliberately — snakes are an ordinary enemy the player meets all the
    // time, so a snake crest would read "there were snakes" instead of naming this boss, the
    // exact ambiguity the Fisher's original crest was changed to avoid.
    emoji: ["🗡️", "🪱", "🗡️"],
    tagline: "A living wall of coil — cut it anywhere and everything behind dies",
  },
  quarrymaster: {
    kind: "quarrymaster",
    displayName: "The Quarrymaster",
    // Same bracket pattern. ⛏️ says quarry and nothing else in the game uses it; 🗿 is a
    // stone figure, which is what he is. Avoided 💀 despite the Shaper using it — one shared
    // skull between two crests starts to make them rhyme at a glance, which is the opposite
    // of the point.
    emoji: ["⛏️", "🗿", "⛏️"],
    tagline: "Caged behind spike beds — throw the switches to reach him",
  },
};

export const BOSS_KINDS = Object.keys(BOSS_ROSTER) as BossKind[];

/** Roster entry for a kind, tolerating unknown/legacy values from stored analytics rows. */
export function bossInfo(kind: string | null | undefined): BossInfo | null {
  if (!kind) return null;
  return BOSS_ROSTER[kind as BossKind] ?? null;
}

/**
 * The boss signature for a stored run. Falls back to the Shaper for rows written before
 * `boss_kind` was ever populated — every boss room was a Shaper then, so that is the
 * historically correct reading, not a guess.
 */
export function bossEmojiFor(kind: string | null | undefined): string {
  const info = bossInfo(kind) ?? BOSS_ROSTER.shaper;
  return info.emoji.join("");
}

export function bossNameFor(kind: string | null | undefined): string {
  const info = bossInfo(kind) ?? BOSS_ROSTER.shaper;
  return info.displayName;
}

/**
 * Which boss the day's boss room holds. Uses bare Math.random() on purpose: every daily
 * generator call is wrapped in withPatchedMathRandom(mulberry32(dateSeed)), so this is
 * deterministic from the date and therefore IDENTICAL for every player that day, while
 * still being a real roll rather than a rotation anyone can predict from the calendar.
 * (Same contract as rollBossEntranceKind — see boss_entrances.ts.)
 *
 * Uniform across the roster, and derived from BOSS_KINDS rather than a hand-written list, so
 * adding an entry to BOSS_ROSTER above is the whole of "put this boss in the rotation" —
 * there is no second place to update and forget. An even split is what makes "which boss did
 * you get?" a real question between players.
 */
export function rollDailyBossKind(): BossKind {
  const i = Math.floor(Math.random() * BOSS_KINDS.length);
  return BOSS_KINDS[Math.min(i, BOSS_KINDS.length - 1)];
}
