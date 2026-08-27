// The roster of daily bosses: who exists, how each is reported, and which one a given day
// rolls. One module so adding a boss is a single entry rather than a hunt through the
// generator, the analytics payload and the stats page.
//
// Deliberately free of arena imports. `buildShaperArena`/`buildFisherArena` pull in Enemy and
// GameState, and game-state.ts imports this — routing the builders through here would make
// that cycle load-bearing. Arena construction stays in enterBossRoom, which already has both
// builders in scope; this module only answers "which boss, and how is it labelled".
// (`../rng` is pure arithmetic with no imports of its own, so it can't reintroduce a cycle.)
import { mulberry32 } from "../rng";

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

/**
 * The Fisher can dead-end: once every snake on its bank is dead, its only rungs left are
 * "walk to a snake" (none) and "retreat to the fishing row, deliberately out of rock range"
 * — and if the arena geometry doesn't hand it a lane back into brace range, it just retreats
 * forever with nothing left to do and no way for the hero to reach it. Same failure shape as
 * the Coilwyrm's stranded-head bug (a boss that drops its own offense must stay reachable),
 * but this path wasn't covered. Pulled from rotation rather than deleted, so the code/art/
 * tests survive if it's ever fixed. Kept withOUT touching BOSS_ROSTER/BOSS_KINDS so `bossInfo`
 * still resolves historic rows that recorded it.
 */
export const FISHER_RETIRED_START_DATE = "2026-08-27";

/** Whether the Fisher has been pulled from the daily roll as of this date string. */
export function fisherRetiredForDate(dateStr: string): boolean {
  return dateStr >= FISHER_RETIRED_START_DATE;
}

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
 *
 * `excludeFisher` drops it from the pool (see FISHER_RETIRED_START_DATE) without touching
 * BOSS_KINDS itself, so a replay of a PRE-cutover date can still pass `false` and draw from
 * the full historical roster — the same "the table must stay the size it was on that date"
 * discipline BOSS_KINDS itself exists for.
 */
export function rollDailyBossKind(opts: { excludeFisher?: boolean } = {}): BossKind {
  const pool = opts.excludeFisher ? BOSS_KINDS.filter((k) => k !== "fisher") : BOSS_KINDS;
  const i = Math.floor(Math.random() * pool.length);
  return pool[Math.min(i, pool.length - 1)];
}

/**
 * Salt for the endless boss-order stream. Endless derives its streams from the run seed
 * ADDITIVELY (`seed` for the item plan, `seed + N` for floor N), so this one XORs instead —
 * no additive offset could be guaranteed clear of a floor's stream however deep a run runs.
 */
const ENDLESS_BOSS_ORDER_SALT = 0xb055;

/**
 * The order an endless run meets its bosses: every kind exactly once, shuffled, and then
 * the same sequence recycled from the top.
 *
 * A shuffle rather than an independent roll per boss floor because a run deep enough to
 * reach four boss floors should meet four DIFFERENT bosses — independent rolls would repeat
 * one before showing all four more often than not, and "which one is left?" is a better
 * question at floor 18 than "this one again?".
 *
 * Derived from the run seed rather than stored on the GameState: a resumed run re-derives
 * the identical order, so there is no new field to persist, serialize or migrate.
 */
export function rollEndlessBossOrder(seed: number): BossKind[] {
  const rng = mulberry32((seed ^ ENDLESS_BOSS_ORDER_SALT) >>> 0);
  const order = BOSS_KINDS.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Filter AFTER shuffling, not before: the Fisher-Yates pass still walks all of BOSS_KINDS
  // and consumes exactly as many rng draws as it always has, so this stays stable for a run
  // already in progress rather than reshuffling the surviving three relative to each other.
  // See FISHER_RETIRED_START_DATE.
  return order.filter((k) => k !== "fisher");
}
