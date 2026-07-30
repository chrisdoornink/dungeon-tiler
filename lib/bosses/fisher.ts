// The Fisher: a heron the size of a house, standing on the far bank of a pond you
// can never cross. It is a RANGED DUEL boss — the first one you cannot touch.
//
// THE CORE IDEA: the Fisher's spear has EXACTLY the hero's throw range and exactly
// the hero's constraints — a straight cardinal line, 4 tiles, blocked by trees. So
// the bed of spikes between you isn't a stalemate, it's a firing line, and the fight
// is a rook duel across it: whoever commits to a lane first loses.
//
// THE LOOP (this is the whole minigame):
//   1. It only advances into rock range when the hero is out in the open near the
//      bank (FISHER_LURE_RANGE). Aggression IS its vulnerability — it cannot hurt
//      you from the rows where you cannot hurt it.
//   2. Aligned in your column, it COILS (mem.coiled) — a telegraphed wind-up the
//      renderer draws down the lane. One full turn of warning.
//   3. Next turn the spear lands. It resolves against the hero's END-of-turn tile
//      (playerNext), never the tile they're leaving — so stepping out of the lane
//      always dodges. That fairness rule is what makes the dodge real.
//   4. A whiffed spear EMBEDS in the mud: the Fisher is stunned, stationary, and
//      takes rocks normally. That window is your only offense. Whiff it onto a tile
//      where you left a ROCK and the beak shatters on stone — a longer stun. Rocks
//      are therefore both ammo and traps.
//   5. When it is NOT hunting you it fishes: it walks its bank, and any snake it
//      runs into gets seized and HURLED over the spikes to land 2-6 tiles from you.
//      So hiding and stalling is not free — passivity buys you snakes.
//
// It never crosses the spikes and never needs to: see TileSubtype.SPIKES, which is a
// FLOOR overlay precisely so thrown rocks fly over it while the hero cannot pass.
//
// Pure/testable: imports only the erased BehaviorContext type + TileSubtype, so no
// cycle back through the registry (same discipline as shaper.ts).
import { TileSubtype } from "../map/constants";
import type { BehaviorContext } from "../enemies/registry";

export const FISHER_HP = 8; // exactly 4 clean rock hits (a thrown rock deals 2)
export const FISHER_ATTACK = 2;
/**
 * The spear is THROWN from a quiver on its back, and its range is unlimited — it flies down
 * the lane until it hits something, then it's gone. It carries infinite spears and the hero
 * can never pick one up.
 *
 * That range breaks the old symmetry, so something has to keep the Fisher hittable: with
 * unlimited reach it could stand on its back row, outside a 4-tile rock throw, and snipe
 * forever with no counterplay. The replacement is FISHER_BRACE_ROWS — it can only throw
 * while braced at the water's edge, which is exactly the band a rock CAN reach. Attacking
 * still means exposing itself; the spear just made the exchange longer-ranged for the hero
 * to set up, not one-sided.
 *
 * Kept as a large finite number rather than Infinity so lane scans stay bounded.
 */
export const FISHER_SPEAR_RANGE = 64;
/**
 * How far back from its frontmost row it can still plant its feet and throw. A heron needs
 * to brace to hurl a spear; from the deep shallows it can only wade and fish. This is the
 * knob that decides how much of the fight happens inside rock range — raise it and the
 * Fisher gets safer, lower it and it has to commit further forward.
 */
export const FISHER_BRACE_ROWS = 2;
/** Turns it is off balance after over-committing on a MISSED throw. The player's window. */
export const FISHER_EMBED_TURNS = 2;
/** A miss that skewers a rock instead of mud — the shaft shatters, longer stagger. */
export const FISHER_EMBED_TURNS_ON_ROCK = 3;
/**
 * How close (Manhattan) the hero must be before the Fisher leaves its safe rows to
 * hunt. Larger = more aggressive = more openings for the player.
 */
export const FISHER_LURE_RANGE = 7;
/** A hurled snake lands this far from the hero — never adjacent, never off-screen. */
export const FISHER_HURL_MIN = 2;
export const FISHER_HURL_MAX = 6;
/** Turns between hurls, so a bank full of snakes can't bury the hero all at once. */
export const FISHER_HURL_COOLDOWN = 2;
/**
 * At or below this health it PANICS: it breaks off the duel, grabs a few more snakes and
 * throws them at you, and then HAS to come back and fight. Half of FISHER_HP, i.e. after two
 * clean rocks — so the fight has three acts rather than one repeated exchange:
 *   1. the spear duel (bait the whiff, punish the recovery)
 *   2. panic: a short burst of snakes, no spear
 *   3. forced back to the duel, now on a board crawling with them
 */
export const FISHER_PANIC_HP = Math.floor(FISHER_HP / 2);
/** Panicking, it throws as fast as it can grab — the burst should feel frantic. */
export const FISHER_PANIC_HURL_COOLDOWN = 1;
/**
 * How many snakes the panic burst is worth. THE ACT IS BOUNDED BY THIS COUNT, not by
 * emptying the bank — that was a dead end in playtest: with a dozen snakes on its side the
 * act never ended, and because it spends the whole time fetching from its back rows it was
 * simultaneously out of the hero's rock range AND not attacking. Nobody could act. A short
 * burst followed by a forced return to the duel is the whole point: it runs out of ways to
 * avoid you.
 */
export const FISHER_PANIC_HURLS = 3;
/**
 * Hard ceiling on the act's length in turns, in case it cannot reach a snake to finish the
 * burst (they flee, and it can be boxed in). Purely a safety net against the standstill
 * above ever returning by a different route.
 */
export const FISHER_PANIC_MAX_TURNS = 12;
/**
 * Tiles it covers per move turn. It is faster than you ON PURPOSE. At one tile per turn it
 * simply mirrored the hero's sidestep forever and there was no positional play at all —
 * you and it traded lateral steps to no effect. Moving in strides means it wins the
 * repositioning race, so breaking its lane has to come from cover and tempo rather than
 * from out-walking it. (Its spear still resolves against the hero's END tile, so a
 * sidestep dodge is unaffected — speed never makes the telegraph unfair.)
 */
export const FISHER_STRIDE = 2;
/**
 * How far it can snatch a snake from — it has a metre of neck. Requiring it to stand
 * exactly ON a snake is why hurling never once fired in playtest: snakes flee, so the
 * odds of one being in the Fisher's next step tile were negligible.
 */
export const FISHER_NECK_REACH = 2;

const FLOOR = 0;
const FLOWERS = 5;

/** Terrain overlays a thrown/hurled body can come to rest on. */
const SAFE_LANDING = new Set<number>([
  TileSubtype.SHALLOW_WATER,
  TileSubtype.SINGED,
]);

export interface FisherMemory {
  turn?: number;
  /** Latched once it has seen the hero on the near bank. */
  alerted?: boolean;
  /** Telegraphed spear: resolves on the NEXT tick against these tiles. */
  coiled?: { nonce: number; tiles: Array<[number, number]> } | null;
  /** Turns remaining with the beak stuck in the ground (helpless). */
  stunTurns?: number;
  /** Where the beak is currently buried, for the render layer. */
  embedded?: { nonce: number; y: number; x: number } | null;
  /** Last resolved spear, for the strike VFX. `hit` distinguishes blood from mud. */
  lastStrike?: {
    nonce: number;
    tiles: Array<[number, number]>;
    hit: boolean;
    onRock: boolean;
  } | null;
  /** Last snake hurl, for the arcing-snake VFX. */
  lastHurl?: { nonce: number; from: [number, number]; to: [number, number] } | null;
  hurlCooldown?: number;
  /**
   * True during the panic burst: it refuses to trade spears and throws snakes instead.
   * Bounded by panicHurls / panicStart, then cleared for good — see hasPanicked.
   */
  panicking?: boolean;
  /** Snakes thrown so far in the current burst. */
  panicHurls?: number;
  /** Turn the burst began, for the FISHER_PANIC_MAX_TURNS safety net. */
  panicStart?: number;
  /**
   * Set once the burst is over. It can never panic again, so from that point it has no way
   * left to avoid the duel — which is the entire reason the act is allowed to exist.
   */
  hasPanicked?: boolean;
  /** Roam box: the far bank. Written by the arena so it can never wander off it. */
  bankMinY?: number;
  bankMaxY?: number;
  bankMinX?: number;
  bankMaxX?: number;
  /**
   * First row of the HERO's side of the spikes. Hurled snakes land at or beyond it,
   * and the Fisher measures "is the hero near the bank?" from it. Set by the arena so
   * the behavior never has to infer the geography.
   */
  heroSideMinY?: number;
  /** The row it retreats to when not hunting — deliberately OUT of rock range. */
  fishRow?: number;
}

function inBounds(grid: number[][], y: number, x: number): boolean {
  return y >= 0 && x >= 0 && y < grid.length && x < (grid[0]?.length ?? 0);
}

/**
 * Can a spear (or a sightline) pass THROUGH this tile? Spikes deliberately pass —
 * the barrier stops feet, not reach — but trees and walls stop it dead, which is why
 * the near bank's treeline is what defines the safe firing positions.
 */
function passesThrough(grid: number[][], y: number, x: number): boolean {
  if (!inBounds(grid, y, x)) return false;
  const t = grid[y][x];
  return t === FLOOR || t === FLOWERS;
}

/**
 * The tiles a thrown spear would cover from `boss` toward `aim`, or null if the hero is not
 * on a clean cardinal lane. The spear flies until something stops it — a tree, a wall, the
 * map edge — so the lane runs the whole way to that blocker, not just as far as the hero.
 * Spikes pass: the barrier stops feet, not projectiles.
 *
 * Running the lane past the hero rather than stopping at them is what keeps the rock-trap
 * alive. A miss plants the spear at the far END of the lane, which is a tile the hero is not
 * standing on — and since the hero can never stand on a rock (they'd pick it up),
 * truncating at the hero would make "leave a rock where it will land" impossible to set up.
 */
export function spearLane(
  grid: number[][],
  boss: { y: number; x: number },
  aim: { y: number; x: number },
  range: number = FISHER_SPEAR_RANGE
): Array<[number, number]> | null {
  const dy = aim.y - boss.y;
  const dx = aim.x - boss.x;
  if (dy !== 0 && dx !== 0) return null; // not on a lane
  if (dy === 0 && dx === 0) return null;
  const stepY = Math.sign(dy);
  const stepX = Math.sign(dx);
  const dist = Math.abs(dy) + Math.abs(dx);
  if (dist > range) return null;
  const tiles: Array<[number, number]> = [];
  let reachedAim = false;
  for (let i = 1; i <= range; i++) {
    const ty = boss.y + stepY * i;
    const tx = boss.x + stepX * i;
    if (!passesThrough(grid, ty, tx)) break;
    tiles.push([ty, tx]);
    if (ty === aim.y && tx === aim.x) reachedAim = true;
  }
  return reachedAim ? tiles : null; // null = blocked before it could reach them
}

/** Could the Fisher stand here? Its own bank only, dry-ish ground, nothing on it. */
function bankStandable(
  ctx: BehaviorContext,
  mem: FisherMemory,
  y: number,
  x: number
): boolean {
  const grid = ctx.grid;
  if (!inBounds(grid, y, x)) return false;
  if (grid[y][x] !== FLOOR && grid[y][x] !== FLOWERS) return false;
  if (mem.bankMinY != null) {
    if (
      y < mem.bankMinY ||
      y > (mem.bankMaxY ?? y) ||
      x < (mem.bankMinX ?? x) ||
      x > (mem.bankMaxX ?? x)
    ) {
      return false;
    }
  }
  const subs = ctx.subtypes?.[y]?.[x] ?? [];
  // It wades shallow water happily (it is a wading bird) but won't stand in deep
  // water, on spikes, or on furniture.
  for (const s of subs) {
    if (s === TileSubtype.PLAYER) return false;
    if (SAFE_LANDING.has(s)) continue;
    return false;
  }
  return true;
}

/** Index of the nearest live snake, or -1. `maxDist` bounds the search (Manhattan). */
function nearestSnake(
  ctx: BehaviorContext,
  from: { y: number; x: number },
  maxDist = Infinity
): number {
  let best = -1;
  let bestD = Infinity;
  const roster = ctx.enemies ?? [];
  for (let i = 0; i < roster.length; i++) {
    const e = roster[i];
    if (e.kind !== "snake" || (e.health ?? 0) <= 0) continue;
    const d = Math.abs(e.y - from.y) + Math.abs(e.x - from.x);
    if (d <= maxDist && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Pick a tile on the HERO's side of the spikes, FISHER_HURL_MIN..MAX from them, for a
 * hurled snake to land on. Never the hero's own tile and never adjacent (that would be
 * a free bite with no chance to react). Returns null if nothing suitable is open.
 */
export function pickHurlLanding(
  ctx: BehaviorContext,
  mem: FisherMemory,
  hero: { y: number; x: number },
  rng: () => number
): [number, number] | null {
  const grid = ctx.grid;
  const minY = mem.heroSideMinY ?? 0;
  const candidates: Array<[number, number]> = [];
  for (let d = FISHER_HURL_MIN; d <= FISHER_HURL_MAX; d++) {
    for (let dy = -d; dy <= d; dy++) {
      const dx = d - Math.abs(dy);
      for (const sx of dx === 0 ? [0] : [-dx, dx]) {
        const y = hero.y + dy;
        const x = hero.x + sx;
        if (y < minY) continue; // must land on the hero's side of the barrier
        if (!inBounds(grid, y, x)) continue;
        if (grid[y][x] !== FLOOR && grid[y][x] !== FLOWERS) continue;
        if (y === hero.y && x === hero.x) continue;
        const subs = ctx.subtypes?.[y]?.[x] ?? [];
        if (subs.some((s) => s !== TileSubtype.PLAYER && !SAFE_LANDING.has(s))) continue;
        if (subs.includes(TileSubtype.PLAYER)) continue;
        if ((ctx.enemies ?? []).some((e) => e.y === y && e.x === x)) continue;
        candidates.push([y, x]);
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
}

/**
 * Seize a snake and throw it across the spikes. The Fisher cannot move another enemy
 * directly (customUpdate only gets a positional COPY of the enemy list), but
 * behaviorMemory is shared by reference — so it stamps the snake with a flight order
 * and the snake's own behavior carries it out on its next tick. That one-tick delay is
 * a feature: the snake reads as airborne for a beat before it lands.
 */
function hurlSnake(
  ctx: BehaviorContext,
  mem: FisherMemory,
  snakeIdx: number,
  hero: { y: number; x: number },
  rng: () => number
): boolean {
  const snake = (ctx.enemies ?? [])[snakeIdx];
  // The shared-reference trick only works when the snake already HAS a memory bag
  // (Enemy always creates one). Without it there is no channel to the real entity, so
  // fail the hurl rather than writing into a throwaway object.
  if (!snake?.behaviorMemory) return false;
  const landing = pickHurlLanding(ctx, mem, hero, rng);
  if (!landing) return false;
  const smem = snake.behaviorMemory as Record<string, unknown>;
  smem.fisherHurl = { y: landing[0], x: landing[1] };
  mem.lastHurl = {
    nonce: mem.turn ?? 0,
    from: [snake.y, snake.x],
    to: landing,
  };
  if (mem.panicking) {
    mem.panicHurls = (mem.panicHurls ?? 0) + 1; // counts down the burst
    mem.hurlCooldown = FISHER_PANIC_HURL_COOLDOWN;
  } else {
    mem.hurlCooldown = FISHER_HURL_COOLDOWN;
  }
  // It pivots to face the throw, which sells the wind-up.
  ctx.enemy.facing = landing[1] > ctx.enemy.x ? "RIGHT" : "LEFT";
  return true;
}

/** Step one tile, preferring the given deltas in order. True if it moved. */
function tryStep(
  ctx: BehaviorContext,
  mem: FisherMemory,
  candidates: Array<[number, number]>
): boolean {
  for (const [dy, dx] of candidates) {
    if (dy === 0 && dx === 0) continue;
    const ny = ctx.enemy.y + dy;
    const nx = ctx.enemy.x + dx;
    if (!bankStandable(ctx, mem, ny, nx)) continue;
    if ((ctx.enemies ?? []).some((e, i) => i !== ctx.enemyIndex && e.y === ny && e.x === nx)) {
      continue;
    }
    ctx.enemy.y = ny;
    ctx.enemy.x = nx;
    ctx.enemy.facing =
      dy !== 0 ? (dy < 0 ? "UP" : "DOWN") : dx < 0 ? "LEFT" : "RIGHT";
    return true;
  }
  return false;
}

/**
 * Walk up to `steps` tiles toward (ty,tx), greedily closing the wider gap first. Returns
 * how many tiles it actually covered. The render layer animates the whole stride as one
 * glide (see the `fisher` case in TilemapGrid's smoothEntitySteps).
 */
function strideToward(
  ctx: BehaviorContext,
  mem: FisherMemory,
  ty: number,
  tx: number,
  steps: number = FISHER_STRIDE
): number {
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const dy = Math.sign(ty - ctx.enemy.y);
    const dx = Math.sign(tx - ctx.enemy.x);
    if (dy === 0 && dx === 0) break;
    // Close the larger gap first so it doesn't zig-zag across the bank.
    const yFirst = Math.abs(ty - ctx.enemy.y) >= Math.abs(tx - ctx.enemy.x);
    const order: Array<[number, number]> = yFirst
      ? [[dy, 0], [0, dx]]
      : [[0, dx], [dy, 0]];
    if (!tryStep(ctx, mem, order)) break; // boxed in; don't burn the rest of the stride
    moved++;
  }
  return moved;
}

export function fisherUpdate(ctx: BehaviorContext): number {
  const mem = ctx.enemy.memory as FisherMemory;
  const rng = ctx.rng ?? (() => 0.5);
  mem.turn = (mem.turn ?? 0) + 1;
  if (mem.hurlCooldown && mem.hurlCooldown > 0) mem.hurlCooldown -= 1;

  const boss = { y: ctx.enemy.y, x: ctx.enemy.x };
  const hero = { y: ctx.player.y, x: ctx.player.x };
  // Telegraphed attacks resolve against where the hero ENDS this turn, so stepping
  // off the lane genuinely dodges. Untelegraphed decisions use it too, so the Fisher
  // never aims at a tile the hero has already left.
  const aim = ctx.playerNext ?? hero;

  // --- Beak buried: helpless. This is the player's whole offensive window, so it
  // must be completely inert — no facing change, no repositioning, no attack.
  if ((mem.stunTurns ?? 0) > 0) {
    mem.stunTurns = (mem.stunTurns ?? 0) - 1;
    if ((mem.stunTurns ?? 0) === 0) mem.embedded = null;
    return 0;
  }

  // --- A coiled spear lands NOW, against the tiles telegraphed last turn.
  if (mem.coiled && mem.coiled.tiles.length > 0) {
    const tiles = mem.coiled.tiles;
    const struck = tiles.some(([ty, tx]) => ty === aim.y && tx === aim.x);
    mem.coiled = null;
    if (struck) {
      ctx.enemy.facing =
        aim.y !== boss.y ? (aim.y < boss.y ? "UP" : "DOWN") : aim.x < boss.x ? "LEFT" : "RIGHT";
      mem.lastStrike = { nonce: mem.turn, tiles, hit: true, onRock: false };
      return ctx.enemy.attack; // engine applies variance/defense
    }
    // WHIFF: it over-committed on the throw and is left off balance — the only window in
    // which you can safely put a rock into it. The spear itself plants in the ground at the
    // far end of the lane and is gone (the hero can never pick one up; it has infinite
    // spears, so the ammo is not the resource — its balance is). A rock left lying on that
    // tile shatters the shaft and staggers it a turn longer, which is the reason to salt
    // the firing line.
    const [ey, ex] = tiles[tiles.length - 1];
    const subs = ctx.subtypes?.[ey]?.[ex] ?? [];
    const onRock = subs.includes(TileSubtype.ROCK);
    if (onRock && ctx.subtypes) {
      ctx.subtypes[ey][ex] = subs.filter((s) => s !== TileSubtype.ROCK);
    }
    mem.stunTurns = onRock ? FISHER_EMBED_TURNS_ON_ROCK : FISHER_EMBED_TURNS;
    mem.embedded = { nonce: mem.turn, y: ey, x: ex };
    mem.lastStrike = { nonce: mem.turn, tiles, hit: false, onRock };
    return 0;
  }

  // --- Is the hero out in the open near the bank? Measured from the BARRIER, not
  // from the Fisher: it starts well out of rock range, so a boss-relative check would
  // mean it never came forward at all. Distance-to-the-water is the honest read of
  // "this one is fishable", and it makes approaching the firing line the thing that
  // summons it — the player chooses when the duel starts.
  const heroSideMinY = mem.heroSideMinY ?? 0;
  const heroDistFromBank = aim.y - heroSideMinY;
  // A snuffed torch hides the hero from it, exactly as it does from other enemies —
  // so deep water on the near bank is a real stealth option.
  const heroVisible = ctx.player.torchLit !== false;
  const inLureRange =
    heroVisible && heroDistFromBank >= 0 && heroDistFromBank <= FISHER_LURE_RANGE;
  if (inLureRange) mem.alerted = true;

  // --- PANIC. Wounded past halfway it breaks off, grabs a few more snakes, and then has to
  // come back and fight. Entered ONCE and bounded three ways — the burst count, an empty
  // bank, or the turn ceiling — because an unbounded version deadlocked the fight: fetching
  // snakes keeps it on its back rows, out of the hero's rock range, while it also refuses to
  // attack, so neither side could do anything. hasPanicked then locks the exit permanently.
  const myHealth = (ctx.enemies ?? [])[ctx.enemyIndex]?.health ?? Infinity;
  if (!mem.hasPanicked && !mem.panicking && myHealth <= FISHER_PANIC_HP) {
    mem.panicking = true;
    mem.panicHurls = 0;
    mem.panicStart = mem.turn;
  }
  if (mem.panicking) {
    const thrownEnough = (mem.panicHurls ?? 0) >= FISHER_PANIC_HURLS;
    const bankDry = nearestSnake(ctx, boss) === -1;
    const outOfTime = mem.turn - (mem.panicStart ?? mem.turn) >= FISHER_PANIC_MAX_TURNS;
    if (thrownEnough || bankDry || outOfTime) {
      mem.panicking = false;
      mem.hasPanicked = true; // no second burst: it is out of ways to stall
    }
  }
  const panicking = mem.panicking === true;

  // ===========================================================================
  // ONE PRIORITY LADDER, and every rung does something. The Fisher wants two things —
  // to be in your lane, and to have a snake in its beak — and it takes whichever it
  // can get, preferring the spear. That single ordering is what makes your position
  // matter, because it decides which of the two you're handing it:
  //
  //   stand in the open on a clear lane  -> it spears you (but you can hit it back)
  //   hide behind a tree / off every lane -> it can't spear you, so it spends EVERY
  //                                          turn fishing snakes out and throwing them
  //
  // Below half health the top two rungs switch off entirely (see PANIC above) and the
  // ladder collapses to nothing but snakes until the bank is dry.
  //
  // Cover is therefore no longer free, which is the tradeoff the fight was missing. It
  // also removes the old stall outright: there is no state where it stands and does
  // nothing, so no patience counter is needed.
  // ===========================================================================

  // Braced? It can only plant its feet and throw from the water's edge — the band a thrown
  // rock can reach. Without this gate the spear's unlimited range would let it snipe from
  // its back row with no counterplay at all. See FISHER_BRACE_ROWS.
  const braced = boss.y >= (mem.bankMaxY ?? boss.y) - FISHER_BRACE_ROWS + 1;

  // 1. Can it strike right now? Cock the spear — the wind-up. Resolves next tick.
  //    Skipped entirely while panicking: that phase is defined by it refusing to fight.
  const lane =
    inLureRange && !panicking && braced ? spearLane(ctx.grid, boss, aim) : null;
  if (lane) {
    mem.coiled = { nonce: mem.turn, tiles: lane };
    ctx.enemy.facing =
      aim.y !== boss.y ? (aim.y < boss.y ? "UP" : "DOWN") : aim.x < boss.x ? "LEFT" : "RIGHT";
    return 0;
  }

  // 2. Snake within neck reach and off cooldown? Snatch it and throw it over.
  if ((mem.hurlCooldown ?? 0) <= 0) {
    const reachable = nearestSnake(ctx, boss, FISHER_NECK_REACH);
    if (reachable !== -1 && hurlSnake(ctx, mem, reachable, aim, rng)) return 0;
  }

  // 3. Is there a tile on its bank that WOULD give it a shot? Walk to that exact tile.
  //    Crucially this is a fixed destination known to yield a lane, so the approach is
  //    monotone — see findStrikePosition for the ping-pong this replaced. If it comes
  //    back null (hero too far, or every lane treed off) the Fisher stops trying to line
  //    up at all and commits to snakes instead, which is the tradeoff cover buys you.
  //    Strides mean it wins this positioning race, so you cannot out-walk it sideways.
  //    Also skipped while panicking — it has no interest in lining up a shot it won't take.
  if (inLureRange && !panicking) {
    const spot = findStrikePosition(ctx, mem, aim);
    if (spot && strideToward(ctx, mem, spot[0], spot[1]) > 0) return 0;
  }

  // 4. Can't shoot: go arm itself. Walking to the snakes is the whole reason hurling
  //    now happens at all — snakes flee, so it has to come to them.
  const target = nearestSnake(ctx, boss);
  if (target !== -1) {
    const snake = (ctx.enemies ?? [])[target];
    if (strideToward(ctx, mem, snake.y, snake.x) > 0) return 0;
  }

  // 5. No snakes left on its bank. Fall back to its fishing row — deliberately out of
  //    rock range, so a hero who has cleared the shallows can't snipe it for free.
  const fishRow = mem.fishRow ?? mem.bankMinY ?? boss.y;
  if (strideToward(ctx, mem, fishRow, boss.x) > 0) return 0;
  const dir: Array<[number, number]> = rng() < 0.5 ? [[0, 1], [0, -1]] : [[0, -1], [0, 1]];
  tryStep(ctx, mem, dir);
  return 0;
}

/**
 * The nearest tile on its bank from which it could actually land a spear on `aim`, or
 * null if no such tile exists (the hero is out of reach from anywhere, or every lane is
 * treed off). Only tiles sharing the hero's row or column can ever qualify, so this is a
 * cheap cross-shaped scan, not a full sweep.
 *
 * This exists to kill an oscillation that made snake-hurling never fire in practice: the
 * Fisher used to walk toward the hero's column, then — finding no shot — walk toward a
 * snake, which took it OFF the column, so the next turn it walked back. It ping-ponged
 * two tiles apart forever, permanently one tile outside neck reach. Aiming at a FIXED
 * target tile that is known to yield a shot makes the approach monotone, and returning
 * null makes "go fish instead" an unambiguous, stable decision.
 */
export function findStrikePosition(
  ctx: BehaviorContext,
  mem: FisherMemory,
  aim: { y: number; x: number }
): [number, number] | null {
  const rows = ctx.grid.length;
  const cols = ctx.grid[0]?.length ?? 0;
  const maxY = Math.min(rows - 1, mem.bankMaxY ?? rows - 1);
  // Only BRACED rows count as strike positions. Without this it would happily target a
  // back-row tile that lines up on the hero, walk there, and then never throw — the brace
  // gate in fisherUpdate would refuse, and it would stand in its own way forever.
  const minY = Math.max(0, Math.max(mem.bankMinY ?? 0, maxY - FISHER_BRACE_ROWS + 1));
  const minX = Math.max(0, mem.bankMinX ?? 0);
  const maxX = Math.min(cols - 1, mem.bankMaxX ?? cols - 1);
  let best: [number, number] | null = null;
  let bestD = Infinity;
  const consider = (y: number, x: number) => {
    if (y < minY || y > maxY || x < minX || x > maxX) return;
    const here = y === ctx.enemy.y && x === ctx.enemy.x;
    if (!here && !bankStandable(ctx, mem, y, x)) return;
    if (!spearLane(ctx.grid, { y, x }, aim)) return;
    const d = Math.abs(y - ctx.enemy.y) + Math.abs(x - ctx.enemy.x);
    if (d < bestD) {
      bestD = d;
      best = [y, x];
    }
  };
  // Down the hero's column...
  for (let y = minY; y <= maxY; y++) consider(y, aim.x);
  // ...and along the hero's row, if it crosses the bank at all.
  if (aim.y >= minY && aim.y <= maxY) {
    for (let x = minX; x <= maxX; x++) consider(aim.y, x);
  }
  return best;
}

// --- Render hooks (mirrors the shaper* hooks consumed by TilemapGrid) ---

/** Tiles a spear will cover NEXT turn — draw the wind-up down the lane. */
export function fisherCoiledLane(
  mem: FisherMemory | undefined
): Array<[number, number]> | null {
  if (!mem?.coiled || !mem.coiled.tiles.length) return null;
  return mem.coiled.tiles;
}

/** The spear that just resolved (for the lunge streak + impact). */
export function fisherStrike(
  mem: FisherMemory | undefined
): { nonce: number; tiles: Array<[number, number]>; hit: boolean; onRock: boolean } | null {
  if (!mem?.lastStrike || !mem.lastStrike.tiles.length) return null;
  return mem.lastStrike;
}

/** Where the beak is currently stuck — the "hit me now" tell. */
export function fisherEmbedded(
  mem: FisherMemory | undefined
): { nonce: number; y: number; x: number } | null {
  return mem?.embedded ?? null;
}

/** A snake in flight this turn (for the arc VFX). */
export function fisherHurl(
  mem: FisherMemory | undefined
): { nonce: number; from: [number, number]; to: [number, number] } | null {
  return mem?.lastHurl ?? null;
}

/** True during the wounded snake-barrage act, for HUD/VFX that want to signal the shift. */
export function fisherIsPanicking(mem: FisherMemory | undefined): boolean {
  return mem?.panicking === true;
}

/** True while the Fisher is helpless — the renderer dims/slumps it. */
export function fisherIsStunned(mem: FisherMemory | undefined): boolean {
  return (mem?.stunTurns ?? 0) > 0;
}
