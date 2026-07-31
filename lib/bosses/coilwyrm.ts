// The Coilwyrm: a segmented pursuit boss. The fight is a live game of Snake where
// YOU are the food. The head hunts you every single turn and never idles; the body
// follows the exact tiles the head walked, so the coil is a moving wall you author
// by choosing where the head chases you.
//
// THE RULEBOOK (what a player can recite after a death or two):
//   1. Chop the coil anywhere and everything BEHIND the cut is severed and dies.
//   2. So the closer to the head you cut, the more of it you kill — and the head bites.
//   3. The body follows exactly where the head went; it is a wall until you cut it.
//   4. It grows from the tail every 8-11 turns, SWALLOWS loose rocks for two lengths each,
//      and surges two tiles whenever you open a gap — you cannot outrun it forever, only
//      trade ground for time. Every cut you land drops a rock, so leaving your drops on the
//      floor is feeding it.
//   5. Two hits kill a head — but a body of 4+ left behind it just grows another one, so
//      headshots only end the fight once the coil is cut down. And the head is only REACHABLE
//      on the turns it bites you: biting costs it its step, so it is still there when your
//      blow lands. Any other turn it steps away and a segment slides into the tile you swung
//      at. So a headshot is bought with a bite, which is why grinding heads cannot win — see
//      the arithmetic in .claude/features/boss-coilwyrm/index.md.
//
// WHY "CUT ANYWHERE" AND NOT "CUT THE TAIL": tail-only was the first design and headless
// simulation killed it. The tail is by definition the far end of the coil while the head
// is the end that comes to you, so the only cuttable part was the one part of the room a
// player could never get to — 30 simulated fights landed 0.6 cuts each and none were
// winnable. Severing turns every tile of the body into a decision with a payoff that
// scales with how close to the teeth you are willing to stand.
//
// WHY IT CAN'T BE MEMORIZED: the boss's body IS the level geometry, and it re-coils every
// turn out of the player's own kiting history. Kiting is self-defeating (your route
// becomes the wall that seals you in) and the surge means running only buys time.
//
// ENGINE NOTES (why the code looks like this):
//   - `ctx.enemies` is a SNAPSHOT: y/x are copies, so the head cannot move the
//     segments directly. Only `behaviorMemory` is shared by reference, so the head
//     publishes a `path` in its own memory and each segment reads its own slot from
//     it (`coilwyrmSegmentUpdate`). Segments must therefore tick AFTER the head —
//     guaranteed by array order (the head is built first, growth appends).
//   - Segment k always steps into the tile segment k-1 just vacated, so the engine's
//     occupancy reservation never reverts a follower.
//   - The head treats every live segment tile as blocked, INCLUDING the tail's:
//     classic Snake lets you enter the vacating tail tile, but the engine reserves
//     start-of-tick positions and would revert that move, desyncing the coil.
//   - Cuts are detected by the head, which spots the GAP a dead segment leaves in the
//     coil's indices — so every kill path (melee, rock, rune, bomb) severs correctly
//     without needing a death hook. Marked segments are reaped centrally by
//     applyEnemyHazardDeaths, which is what gives them death VFX and kill stats.
//
// Pure/testable: type-only imports from the registry (erased), plus TileSubtype.
import { TileSubtype } from "../map/constants";
import type { BehaviorContext, EnemyKind } from "../enemies/registry";

// TWO HITS TO THE HEAD, ALWAYS. The head takes a flat COILWYRM_HEADSHOT_DAMAGE per blow
// regardless of the hero's attack, sword or variance roll (see the gates in the registry), so
// this pair is the whole rule: 2 HP, 1 per hit. Killing a head is cheap on purpose — what it
// costs you is the turns spent inside biting range, and what it BUYS you is nothing at all
// unless the body left behind is too short to promote a replacement (COILWYRM_SPLIT_MIN).
export const COILWYRM_HEAD_HP = 2;
export const COILWYRM_HEADSHOT_DAMAGE = 1;
export const COILWYRM_HEAD_ATTACK = 2;
export const COILWYRM_SEGMENT_HP = 2; // one clean sword blow or one rock = one cut
// Long enough that there is a body to work through and a real choice of where to cut,
// short enough that a deep cut is reachable in the opening turns. The sandbox offers 3/5/7.
export const COILWYRM_START_SEGMENTS = 5;
// It grows until the room is genuinely crowded. A low cap was the difference between
// "the arena is filling up" and "you can run laps forever": at equal speed the head can
// never catch a fleeing hero in open ground, so the ONLY thing that punishes kiting is
// the coil eating the space you were kiting through.
export const COILWYRM_MAX_SEGMENTS = 24;
// Growth cadence is the fight's whole difficulty dial. It must be SLOWER than the rate
// a competent player can sever tails, or the arithmetic is unwinnable no matter how well
// they play; every-3-to-5-turns outpaced cutting about three to one in simulation.
export const COILWYRM_GROW_MIN = 8;
export const COILWYRM_GROW_MAX = 11;
export const COILWYRM_LUNGE_TILES = 2; // head steps per turn while thrashing / surging
// Hunger surge: every Nth turn the head takes two steps instead of one — but ONLY while
// the hero is further away than COILWYRM_SURGE_GAP. That gate is the whole point. Without
// any surge, equal movement speed means a running hero keeps a constant gap forever, a
// stalemate no amount of growth resolves. With an UNGATED surge the head also gains ground
// inside melee range, so it welds itself to the hero and the fight becomes unwinnable
// attrition (simulation: even a 50 HP hero converted 1 win in 30). Gated, running is
// futile and close quarters is an honest one-move-each dance.
export const COILWYRM_SURGE_EVERY = 5;
export const COILWYRM_SURGE_GAP = 3;
// After it bites, the head rears back and cannot bite again the following turn. This is
// what makes the fight playable at all: the payoff cut is the one closest to the head, so
// a head that bites every single adjacent turn charges more HP for a deep cut than the
// hero has to spend. The recoil turns adjacency from a death sentence into a rhythm you
// can time a cut into — and it is legible, because you watch it rear.
export const COILWYRM_BITE_RECOIL = 2;
// Swallowing a loose rock is worth TWO lengths, versus one for its slow natural growth.
// That turns every stone on the floor into contested territory: rocks are the hero's ammo
// AND the wyrm's food, and since each cut you land drops a rock, sloppy play literally
// feeds the thing you just wounded. Pick your drops up or watch it eat them.
export const COILWYRM_ROCK_GROWTH = 2;
// How far off its shortest line to the hero the wyrm will swerve for a stone. Tie-break
// only (0) made rock-eating almost cosmetic — it swallowed so few that denying it rocks
// was not a real decision. One tile is enough to make the floor contested without ever
// letting it lose interest in the hunt (a wyrm that chased stones would stop being a
// threat and hand the player a free stall).
export const COILWYRM_ROCK_DETOUR = 1;
// A severed length this long or longer does NOT die: its cut end grows a head and it becomes
// a SECOND WYRM. This is what stops "cut anywhere, everything behind dies" from collapsing the
// fight into one blow — chopping a long coil in half no longer wins it, it doubles the bosses.
// So the incentive inverts: shave small chunks off, or be aggressive enough that the remainder
// is too short to survive. A shorter severed length just dies as before.
export const COILWYRM_SPLIT_MIN = 4;
// Hard ceiling on simultaneous wyrms, so a player who keeps making bad deep cuts ends up in
// serious trouble rather than in an unbounded cascade. Past this, severed lengths just die.
export const COILWYRM_MAX_WYRMS = 3;

export type CoilRole = "head" | "body" | "tail";

/**
 * The encounter's dials, carried on EVERY part of the coil rather than just the head.
 *
 * That looks redundant — a body segment has no use for a surge cadence — but it is load-bearing:
 * a severed or decapitated length promotes one of its segments into a head by rewriting that
 * segment's memory bag (`promoteToNewWyrm`), so whatever the bag does not carry is lost. It used
 * to carry none of this, which meant a wyrm born from a split silently reverted to the module
 * constants: with the encounter set to one tile per turn, the second wyrm still double-moved and
 * surged. Almost certainly why cutting the coil in half and running felt so much harder than it
 * should have.
 *
 * `surgeEvery: 0` never surges. `lungeTiles: 1` removes double-moves ENTIRELY, including the
 * post-cut thrash. growMin/growMax bound the growth cadence roll.
 */
export interface CoilTuningMemory {
  surgeEvery?: number;
  lungeTiles?: number;
  growMin?: number;
  growMax?: number;
}

export interface CoilHeadMemory extends CoilTuningMemory {
  coilId?: string;
  coilRole?: "head";
  /** path[0] = the head's tile, path[k] = segment k's tile. Published for segments. */
  path?: Array<[number, number]>;
  /** Live segment count as of this tick (drives the head's armor gate). */
  segments?: number;
  /**
   * How many new bodies are owed. Raised by the head — one for its growth cadence, TWO when
   * it swallows a rock — and paid off by the TAIL, one per turn, which sprouts each segment
   * into its own slot in the published path (the tile the coil is flowing out of). The tail
   * has to be the one to do it: at the instant the head ticks, the tail is still standing on
   * that tile (segments move after the head), so a head-side spawn is always refused, and
   * spawning anywhere else leaves a hole in the coil. Raising the debt before the head moves
   * is also what keeps the shift from popping those slots off the path.
   */
  growDebt?: number;
  /** Bumped each time it swallows a rock (render hook: gorge/swallow flash). */
  gorgeNonce?: number;
  growEvery?: number;
  growCountdown?: number;
  /** Turns of thrash owed: while >0 the head lunges COILWYRM_LUNGE_TILES tiles. */
  thrash?: number;
  /** Countdown to the next hunger surge (see COILWYRM_SURGE_EVERY). */
  surgeCountdown?: number;
  /** True on a turn the head is taking two steps — a render tell (rearing up). */
  surging?: boolean;
  /** Turns left before it can bite again (render tell: reared back, mouth open). */
  biteRecoil?: number;
  turn?: number;
  /** Bumped whenever a segment is severed (render hook: shake/flash). */
  cutNonce?: number;
  /**
   * A body-less head has ONE bite in it, ever. Set the moment it spends it, so a stranded head
   * cannot chip a hero down while being uncatchable (see coilwyrmHeadUpdate).
   */
  lastBiteSpent?: boolean;
  moved?: boolean;
}

export interface CoilSegmentMemory extends CoilTuningMemory {
  coilId?: string;
  coilRole?: "body" | "tail";
  /** 1-based position behind the head; renumbered by the head every tick. */
  coilIndex?: number;
  /**
   * Cut off from the head. Set by the head the moment it sees a gap in the coil, and
   * reaped by applyEnemyHazardDeaths on the same turn. A severed segment stops following
   * and no longer counts as part of the coil (so it cannot keep the head armored).
   */
  severed?: boolean;
  moved?: boolean;
}

/**
 * Roll a fresh growth cadence, honouring the encounter's range. Both roll sites go through this
 * so a wyrm born from a split cannot quietly revert to the module defaults — which is exactly
 * what used to happen to `lungeTiles` and `surgeEvery` (see CoilTuningMemory).
 */
function rollGrowEvery(tuning: CoilTuningMemory, rng: () => number): number {
  const lo = tuning.growMin ?? COILWYRM_GROW_MIN;
  const hi = Math.max(lo, tuning.growMax ?? COILWYRM_GROW_MAX);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

const FLOOR = 0;
const FLOWERS = 5;

// Overlays a body the size of a wyrm still won't cross: lethal terrain and
// furniture that physically occupies the tile. Loose ROCKs are deliberately absent
// — cuts drop rocks on the floor and the coil must be able to slither over them,
// or a long fight would fence itself in with its own drops.
const BLOCKED_OVERLAYS = new Set<number>([
  TileSubtype.LAVA,
  TileSubtype.DEEP_WATER,
  TileSubtype.OPEN_ABYSS,
  TileSubtype.FAULTY_FLOOR,
  TileSubtype.WALL_TORCH,
  TileSubtype.CHECKPOINT,
  TileSubtype.BOOKSHELF,
  TileSubtype.TOWN_SIGN,
  TileSubtype.POT,
  TileSubtype.CHEST,
  TileSubtype.LOCK,
]);

type Pos = [number, number];

function inBounds(grid: number[][], y: number, x: number): boolean {
  return y >= 0 && x >= 0 && y < grid.length && x < (grid[0]?.length ?? 0);
}

/** Terrain the coil can occupy (ignores entity occupancy — callers layer that on). */
function isCoilFloor(ctx: BehaviorContext, y: number, x: number): boolean {
  if (!inBounds(ctx.grid, y, x)) return false;
  const t = ctx.grid[y][x];
  if (t !== FLOOR && t !== FLOWERS) return false;
  const subs = ctx.subtypes?.[y]?.[x] ?? [];
  return !subs.some((s) => BLOCKED_OVERLAYS.has(s));
}

const ORTHO: Pos[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const key = (y: number, x: number) => `${y},${x}`;

function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function facingFor(dy: number, dx: number): "UP" | "RIGHT" | "DOWN" | "LEFT" {
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "UP" : "DOWN";
  return dx < 0 ? "LEFT" : "RIGHT";
}

/** Every living segment of `coilId`, ordered from the head backwards. */
function censusSegments(
  ctx: BehaviorContext,
  coilId: string
): Array<{ y: number; x: number; mem: CoilSegmentMemory }> {
  const segs: Array<{ y: number; x: number; mem: CoilSegmentMemory }> = [];
  for (const e of ctx.enemies) {
    if (e.kind !== "coilwyrm-coil") continue;
    const mem = e.behaviorMemory as CoilSegmentMemory | undefined;
    if (!mem || mem.coilId !== coilId) continue;
    if (e.health <= 0 || mem.severed) continue;
    segs.push({ y: e.y, x: e.x, mem });
  }
  segs.sort((a, b) => (a.mem.coilIndex ?? 0) - (b.mem.coilIndex ?? 0));
  return segs;
}

/**
 * A head with no body left — stranded, and finished as a threat: it cannot move, it has one last
 * bite, and a single blow kills it. `coilwyrmHeadUpdate` enforces the first two; the registry's
 * damage gates call this for the third, so all three read one predicate.
 *
 * Prefers the LIVE roster so it can never lag a tick behind a kill, and falls back to the head's
 * own published count. Knowing nothing at all it reports NOT stranded — a stray call must never
 * hand out a one-hit boss kill.
 */
export function coilwyrmHeadStranded(
  memory: Record<string, unknown> | undefined,
  enemies?: ReadonlyArray<{
    kind: EnemyKind;
    health: number;
    behaviorMemory?: Record<string, unknown>;
  }>
): boolean {
  const mem = memory as CoilHeadMemory | undefined;
  const coilId = mem?.coilId;
  if (enemies && coilId) {
    for (const e of enemies) {
      if (e.kind !== "coilwyrm-coil" || e.health <= 0) continue;
      const m = e.behaviorMemory as CoilSegmentMemory | undefined;
      if (m?.coilId !== coilId || m.severed) continue;
      return false; // a live, still-attached segment: the body is up
    }
    return true;
  }
  return (mem?.segments ?? 1) <= 0;
}

/** Role marker for the hindmost segment (render/flavour; every segment is cuttable). */
export function coilwyrmSegmentIsTail(memory: Record<string, unknown> | undefined): boolean {
  return (memory as CoilSegmentMemory | undefined)?.coilRole === "tail";
}


/**
 * Breadth-first step toward `target`, routing around walls and the coil's own body.
 * A greedy chaser gets stuck behind its own coil and behind pillars, which makes
 * kiting free; BFS keeps the head relentless so the player has to out-GEOMETRY it,
 * not just out-walk it. Ties are broken randomly so the approach can't be read
 * tile-perfectly. Returns null when no route exists.
 */
function bfsStep(
  ctx: BehaviorContext,
  from: Pos,
  target: Pos,
  blocked: Set<string>,
  rng: () => number
): Pos | null {
  const startKey = key(from[0], from[1]);
  const targetKey = key(target[0], target[1]);
  // Distance field grown from the target so we can pick a first step by gradient.
  const dist = new Map<string, number>([[targetKey, 0]]);
  const queue: Pos[] = [target];
  let head = 0;
  let reached = false;
  while (head < queue.length) {
    const [cy, cx] = queue[head++];
    const d = dist.get(key(cy, cx)) ?? 0;
    if (key(cy, cx) === startKey) {
      reached = true;
      break;
    }
    for (const [dy, dx] of ORTHO) {
      const ny = cy + dy;
      const nx = cx + dx;
      const k = key(ny, nx);
      if (dist.has(k)) continue;
      // The start tile is always enterable (we are standing on it) — otherwise the
      // head's own tile would end the search before it began.
      if (k !== startKey) {
        if (!isCoilFloor(ctx, ny, nx)) continue;
        if (blocked.has(k)) continue;
      }
      dist.set(k, d + 1);
      queue.push([ny, nx]);
    }
  }
  if (!reached) return null;
  // Collect every legal first step with its distance-to-target, then let hunger bend the
  // choice: the wyrm takes a rock that costs it at most COILWYRM_ROCK_DETOUR extra tiles.
  // It grazes greedily but never abandons the hunt.
  const options: Array<{ pos: Pos; d: number; rock: boolean }> = [];
  for (const [dy, dx] of shuffled(ORTHO, rng)) {
    const ny = from[0] + dy;
    const nx = from[1] + dx;
    const k = key(ny, nx);
    if (!isCoilFloor(ctx, ny, nx) || blocked.has(k)) continue;
    const d = dist.get(k);
    if (d === undefined) continue;
    options.push({ pos: [ny, nx], d, rock: rockAt(ctx, ny, nx) });
  }
  if (options.length === 0) return null;
  const minD = Math.min(...options.map((o) => o.d));
  const graze = options
    .filter((o) => o.rock && o.d <= minD + COILWYRM_ROCK_DETOUR)
    .sort((a, b) => a.d - b.d)[0];
  if (graze) return graze.pos;
  return options.filter((o) => o.d === minD)[0].pos;
}

/** Is there a loose rock on this tile for the wyrm to swallow? */
function rockAt(ctx: BehaviorContext, y: number, x: number): boolean {
  return (ctx.subtypes?.[y]?.[x] ?? []).includes(TileSubtype.ROCK);
}

/**
 * Swallow a rock the head just stepped onto: the stone leaves the floor (the hero can no
 * longer pick it up) and the wyrm owes itself two extra lengths.
 */
function eatRock(
  ctx: BehaviorContext,
  mem: CoilHeadMemory,
  y: number,
  x: number
): void {
  const subs = ctx.subtypes?.[y]?.[x];
  if (!subs || !subs.includes(TileSubtype.ROCK)) return;
  const idx = subs.indexOf(TileSubtype.ROCK);
  subs.splice(idx, 1);
  mem.growDebt = (mem.growDebt ?? 0) + COILWYRM_ROCK_GROWTH;
  mem.gorgeNonce = (mem.gorgeNonce ?? 0) + 1;
}

/** How many wyrm heads are alive right now (all coils, not just this one). */
function countWyrms(ctx: BehaviorContext): number {
  let n = 0;
  for (const e of ctx.enemies) if (e.kind === "coilwyrm" && e.health > 0) n += 1;
  return n;
}

/**
 * Turn a severed length into a second wyrm. The piece nearest the old head — the cut end —
 * grows the new skull (`becomeKind`, applied by the engine's write-back, which also gives it
 * head HP and a bite); the rest become its body, renumbered behind it under a fresh coilId so
 * the two wyrms never read each other's path or protect each other's head.
 *
 * The newborn head starts reared back: a length that has just been hacked off should not get
 * to bite on the same turn it sprouts a mouth. That applies to a head REGROWN after
 * decapitation too — the hero just acted there as well. (Denying the regrow its grace was tried
 * as a way to punish head-camping and measured as pure noise, so it is not worth the parameter.)
 */
function promoteToNewWyrm(
  cutOff: Array<{ y: number; x: number; mem: CoilSegmentMemory }>,
  rng: () => number
): void {
  const [front, ...rest] = cutOff;
  const newId = `coil-${Math.floor(rng() * 1e9).toString(36)}`;
  // This memory bag is being rewritten from a segment's shape into a head's shape, and the
  // two disagree on `coilRole`, so it goes through an untyped view for the changeover.
  const bag = front.mem as unknown as Record<string, unknown>;
  delete bag.coilIndex;
  delete bag.severed;
  const headMem = bag as CoilHeadMemory & { becomeKind?: EnemyKind };
  headMem.becomeKind = "coilwyrm";
  headMem.coilId = newId;
  headMem.coilRole = "head";
  headMem.path = [[front.y, front.x], ...rest.map((r) => [r.y, r.x] as Pos)];
  headMem.segments = rest.length;
  // The tuning fields ride along in the bag (CoilTuningMemory is on segment memory too), so the
  // new wyrm inherits the encounter's cadence instead of reverting to the module constants.
  headMem.growEvery = rollGrowEvery(headMem, rng);
  headMem.growCountdown = headMem.growEvery;
  headMem.growDebt = 0;
  headMem.thrash = 0;
  headMem.turn = 0;
  headMem.surgeCountdown = headMem.surgeEvery ?? COILWYRM_SURGE_EVERY;
  headMem.biteRecoil = COILWYRM_BITE_RECOIL; // freshly headed: no free bite
  rest.forEach((r, i) => {
    r.mem.coilId = newId;
    r.mem.coilIndex = i + 1;
    r.mem.coilRole = i === rest.length - 1 ? "tail" : "body";
    delete r.mem.severed;
  });
}

/** Drop a spent segment's body as a loose rock, so cutting feeds your ammo. */
function dropRock(ctx: BehaviorContext, y: number, x: number): void {
  const subs = ctx.subtypes?.[y]?.[x];
  if (!subs) return;
  if (!isCoilFloor(ctx, y, x)) return;
  if (subs.length > 0) return; // never bury an item, the exit, or the player marker
  subs.push(TileSubtype.ROCK);
}

export function coilwyrmHeadUpdate(ctx: BehaviorContext): number {
  const mem = ctx.enemy.memory as CoilHeadMemory;
  const rng = ctx.rng ?? Math.random;
  if (!mem.coilId) mem.coilId = "coil";
  mem.coilRole = "head";
  mem.turn = (mem.turn ?? 0) + 1;
  mem.moved = false;
  if (mem.growEvery == null) mem.growEvery = rollGrowEvery(mem, rng);
  if (mem.growCountdown == null) mem.growCountdown = mem.growEvery;

  const headPos: Pos = [ctx.enemy.y, ctx.enemy.x];
  const path: Pos[] = (mem.path ?? [headPos]).map(([y, x]) => [y, x] as Pos);
  path[0] = headPos; // trust the live position over the stored one

  // --- 1. Census, then sever everything behind a cut ------------------------------
  // A dead segment leaves a HOLE in the coil's indices. Everything past that hole is no
  // longer attached to the head, so it is cut off and dies — the deeper the cut, the more
  // of the wyrm goes with it. Whatever remains connected to the head keeps fighting.
  const living = censusSegments(ctx, mem.coilId);
  const attached: typeof living = [];
  const cutOff: typeof living = [];
  let expected = 1;
  let broken = false;
  for (const s of living) {
    if (!broken && (s.mem.coilIndex ?? 0) === expected) {
      attached.push(s);
      expected += 1;
    } else {
      broken = true; // this segment (and every one behind it) lost its connection
      cutOff.push(s);
    }
  }
  const prevCount = mem.segments ?? attached.length;
  // A long enough severed length survives as a NEW WYRM: its cut end grows a head. Short
  // remainders just die. This is the whole risk/reward of where you cut — a greedy chop
  // through a long coil hands you a second boss instead of a kill.
  const wyrmCount = countWyrms(ctx);
  const splits =
    cutOff.length >= COILWYRM_SPLIT_MIN && wyrmCount < COILWYRM_MAX_WYRMS;
  if (splits) {
    promoteToNewWyrm(cutOff, rng);
  } else {
    for (const s of cutOff) {
      s.mem.severed = true; // reaped centrally this turn, with death VFX and kill stats
      dropRock(ctx, s.y, s.x); // every severed length of body leaves a throwable stone
    }
  }
  const segs = attached;
  if (segs.length < prevCount) {
    // Something was cut this turn: the wyrm thrashes (a two-tile lunge next step) and
    // any growth it was owed is forfeit — out-cutting the growth is the win condition.
    mem.growDebt = 0; // a cut cancels growth still owed
    mem.thrash = 1;
    mem.cutNonce = (mem.cutNonce ?? 0) + 1;
  }
  mem.segments = segs.length;

  // Renumber the survivors so indices stay dense (1..n); the hindmost is the tail (kept
  // as a render/role marker — every segment is cuttable).
  segs.forEach((s, i) => {
    s.mem.coilId = mem.coilId;
    s.mem.coilIndex = i + 1;
    s.mem.coilRole = i === segs.length - 1 ? "tail" : "body";
  });

  // --- 2. Growth decision, BEFORE moving -----------------------------------------
  // Raising the flag now is what keeps the coming shift from popping the hindmost tile
  // off the path: that slot has to exist for the body the tail is about to sprout.
  mem.growCountdown = (mem.growCountdown ?? mem.growEvery) - 1;
  if (mem.growCountdown <= 0) {
    mem.growCountdown = mem.growEvery;
    if (segs.length < COILWYRM_MAX_SEGMENTS) mem.growDebt = (mem.growDebt ?? 0) + 1;
  }
  const debt = Math.max(0, mem.growDebt ?? 0);
  const pathLimit = 1 + segs.length + debt;

  // Re-anchor the path to where the parts actually are, keeping any trailing slot a
  // pending growth still needs. (Re-anchoring is what heals the path if the engine ever
  // reverts a follower's move.)
  const rebuilt: Pos[] = [headPos];
  for (const s of segs) rebuilt.push([s.y, s.x]);
  for (let i = rebuilt.length; i < Math.min(path.length, pathLimit); i++) {
    rebuilt.push(path[i]);
  }
  path.length = 0;
  path.push(...rebuilt);

  // --- 4. Move (or bite) ---------------------------------------------------------
  // Solid to its own body AND to every other wyrm's. Once a severed length can grow its own
  // head there are two coils sharing the room, and a head that only knew about its own body
  // would walk into the other one — the engine reverts that move, but the path it published
  // still claims the tile, and the follower reading that slot desyncs.
  const bodyTiles = new Set<string>();
  for (const other of ctx.enemies) {
    if (other.kind !== "coilwyrm" && other.kind !== "coilwyrm-coil") continue;
    if (other.y === ctx.enemy.y && other.x === ctx.enemy.x) continue; // itself
    if (other.health <= 0) continue;
    bodyTiles.add(key(other.y, other.x));
  }
  const heroNow: Pos = [ctx.player.y, ctx.player.x];
  const heroAim: Pos = ctx.playerNext ? [ctx.playerNext.y, ctx.playerNext.x] : heroNow;

  // A HEAD WITH NO BODY LEFT IS FINISHED. It cannot move, it gets one final bite and never
  // another, and a single blow kills it (see the damage gates, which read the same predicate).
  //
  // It used to keep full speed and its bite while still being reachable only on the turns it
  // chose to bite — and at equal movement speed that combination makes a lone head literally
  // uncatchable. The endgame degenerated into one or two stranded heads chipping the hero
  // forever with no way to finish them: "you end up with two heads next to you (or even just
  // one) and you can't actually kill the thing. It just drains all your stuff." A wyrm's threat
  // is its body; once that is gone there is nothing left to fight, and the fight should end.
  if ((mem.segments ?? 0) <= 0) {
    path.length = 0;
    path.push([ctx.enemy.y, ctx.enemy.x]);
    mem.path = path.map(([y, x]) => [y, x] as Pos);
    mem.surging = false;
    mem.thrash = 0;
    const adjacent =
      Math.abs(ctx.enemy.y - heroNow[0]) + Math.abs(ctx.enemy.x - heroNow[1]) === 1 ||
      Math.abs(ctx.enemy.y - heroAim[0]) + Math.abs(ctx.enemy.x - heroAim[1]) === 1;
    if (adjacent && !mem.lastBiteSpent) {
      mem.lastBiteSpent = true;
      ctx.enemy.facing = facingFor(
        heroNow[0] - ctx.enemy.y,
        heroNow[1] - ctx.enemy.x
      );
      return COILWYRM_HEAD_ATTACK;
    }
    return 0;
  }

  // Two steps this turn if it is thrashing from a cut, or on its hunger surge. Both are capped
  // by lungeTiles, so a single knob (lungeTiles = 1) gives a wyrm that only ever moves one tile.
  const lungeTiles = mem.lungeTiles ?? COILWYRM_LUNGE_TILES;
  const surgeEvery = mem.surgeEvery ?? COILWYRM_SURGE_EVERY;
  const thrashing = (mem.thrash ?? 0) > 0;
  if (thrashing) mem.thrash = (mem.thrash ?? 0) - 1;
  const gapToHero =
    Math.abs(ctx.enemy.y - ctx.player.y) + Math.abs(ctx.enemy.x - ctx.player.x);
  let surging = false;
  if (surgeEvery > 0) {
    if (mem.surgeCountdown == null) mem.surgeCountdown = surgeEvery;
    mem.surgeCountdown -= 1;
    surging = mem.surgeCountdown <= 0 && gapToHero > COILWYRM_SURGE_GAP;
    if (mem.surgeCountdown <= 0) mem.surgeCountdown = surgeEvery;
  }
  const steps = (thrashing || surging) && lungeTiles > 1 ? lungeTiles : 1;
  mem.surging = steps > 1;

  // Recoil ticks down whether or not it is adjacent, so the rhythm keeps running while
  // the player repositions.
  const canBite = (mem.biteRecoil ?? 0) <= 0;
  if (!canBite) mem.biteRecoil = (mem.biteRecoil ?? 0) - 1;

  // The head can never END on the hero's tile (the engine reserves it), so treat the hero
  // as blocked for pathing while still aiming at them: a head pressed against the hero
  // then shuffles around them at distance 1 rather than standing still.
  const blockedForHead = new Set<string>(bodyTiles);
  blockedForHead.add(key(heroNow[0], heroNow[1]));
  blockedForHead.add(key(heroAim[0], heroAim[1]));

  let bite = 0;
  for (let step = 0; step < steps; step++) {
    const from: Pos = [ctx.enemy.y, ctx.enemy.x];
    // Adjacent to the hero (their current tile, or the one they are stepping into): bite.
    // CRUCIALLY it does not stop moving to do it. An earlier version broke out of the
    // step loop here, which froze the ENTIRE coil for as long as the hero stood beside
    // the head — the body never advanced, the geometry never changed, and the fight
    // became an unwinnable, un-loseable stalemate the player could farm forever. A wyrm
    // that has you cornered still writhes.
    const adjacentToHero =
      Math.abs(from[0] - heroNow[0]) + Math.abs(from[1] - heroNow[1]) === 1 ||
      Math.abs(from[0] - heroAim[0]) + Math.abs(from[1] - heroAim[1]) === 1;
    if (adjacentToHero && canBite) {
      ctx.enemy.facing = facingFor(heroNow[0] - from[0], heroNow[1] - from[1]);
      bite = COILWYRM_HEAD_ATTACK;
      mem.biteRecoil = COILWYRM_BITE_RECOIL;
      // The strike costs it the step. This is the hero's only way to break contact: at
      // equal speed a head that bit for free stayed welded to them for the whole fight
      // and the bleed was unpayable (a 50 HP hero still lost 29 of 30 simulated runs).
      // Spending the move means every bite buys the player a tile of slack, and the coil
      // still flows on its other turns, so this is a beat in a rhythm and NOT the old
      // hold-forever freeze that made the fight a farmable stalemate.
      break;
    }
    if (adjacentToHero) {
      // Reared back mid-recoil: it cannot bite, so it keeps circling the hero instead.
      ctx.enemy.facing = facingFor(heroNow[0] - from[0], heroNow[1] - from[1]);
    }

    let next = bfsStep(ctx, from, heroAim, blockedForHead, rng);
    if (!next) {
      // Boxed in by its own coil: take ANY legal step so the fight can never freeze
      // into a stalemate the player could farm.
      for (const [dy, dx] of shuffled(ORTHO, rng)) {
        const ny = from[0] + dy;
        const nx = from[1] + dx;
        if (!isCoilFloor(ctx, ny, nx)) continue;
        if (blockedForHead.has(key(ny, nx))) continue;
        next = [ny, nx];
        break;
      }
    }
    if (!next) break; // truly entombed — nothing legal to do this tick

    // Face the hero while biting; otherwise face the way it is travelling.
    if (!adjacentToHero) {
      ctx.enemy.facing = facingFor(next[0] - from[0], next[1] - from[1]);
    }
    ctx.enemy.y = next[0];
    ctx.enemy.x = next[1];
    mem.moved = true;
    eatRock(ctx, mem, next[0], next[1]);
    // On a two-step turn it must not double back into the tile it just left: the body is
    // about to flow into that tile, so a reversal put the same tile in the path twice and
    // the segment reading the duplicate slot collided with the head and fell out of step.
    // (This is just the Snake rule — you cannot turn back into your own neck.)
    blockedForHead.add(key(from[0], from[1]));
    // Shift the coil: the head's new tile goes on the front and the hindmost tile falls
    // off the back — unless a pending growth has already claimed that slot.
    path.unshift([next[0], next[1]]);
    // Recomputed from the LIVE debt rather than the pre-move pathLimit: swallowing a rock
    // mid-move raises the debt, and on a two-step turn a stale limit would pop the very
    // slots the new lengths need — leaving the tail to sprout them two tiles adrift.
    while (path.length > 1 + segs.length + Math.max(0, mem.growDebt ?? 0)) path.pop();
  }

  mem.path = path.map(([y, x]) => [y, x] as Pos);
  return bite;
}

/**
 * The coil has been DECAPITATED — regrow a head, or die trying.
 *
 * Governed by exactly the same rule as a severed length: COILWYRM_SPLIT_MIN or more parts and
 * the frontmost one grows a new skull; anything shorter dies. That symmetry is the lesson the
 * fight is trying to teach. A headshot on a long wyrm accomplishes nothing — the body hands up a
 * replacement head at full HP — so the way to win is to cut the coil into lengths too short to
 * promote, and only then take the head. It also leaves a second, slower line open: each regrow
 * spends a segment, so chipping head after head does eventually work if you can survive the
 * teeth that long.
 */
function regrowHead(
  ctx: BehaviorContext,
  mem: CoilSegmentMemory,
  idx: number
): number {
  const coilId = mem.coilId;
  if (!coilId) return 0;
  // Someone already claimed the job on this tick. `becomeKind` is applied by the engine's
  // write-back AFTER customUpdate returns, so the claimant is still a segment right now and an
  // unguarded check would let every part behind it promote a head of its own.
  for (const e of ctx.enemies) {
    if (e.kind !== "coilwyrm-coil" || e.health <= 0) continue;
    const m = e.behaviorMemory as (CoilSegmentMemory & { becomeKind?: EnemyKind }) | undefined;
    if (m?.becomeKind === "coilwyrm") return 0; // fall in behind it next tick
  }
  const chain = censusSegments(ctx, coilId);
  // Only the frontmost survivor promotes; the rest become its body when it does.
  if (chain.length === 0 || (chain[0].mem.coilIndex ?? 0) !== idx) return 0;
  if (chain.length >= COILWYRM_SPLIT_MIN && countWyrms(ctx) < COILWYRM_MAX_WYRMS) {
    // Costs the wyrm a length: the frontmost segment IS the new skull. Making the regrow
    // length-neutral (sprouting a replacement at the tail) was tried, to force the player to
    // cut rather than grind heads, and measured as pure noise — so the simpler, more intuitive
    // rule stands, and killing a head keeps its small honest payoff.
    promoteToNewWyrm(chain, ctx.rng ?? Math.random);
  } else {
    // Too short to carry a head. Reaped centrally this turn with death VFX and kill credit,
    // and each length leaves its rock behind exactly as a severed one does.
    for (const s of chain) {
      s.mem.severed = true;
      dropRock(ctx, s.y, s.x);
    }
  }
  return 0;
}

export function coilwyrmSegmentUpdate(ctx: BehaviorContext): number {
  const mem = ctx.enemy.memory as CoilSegmentMemory;
  mem.moved = false;
  const idx = mem.coilIndex ?? 0;
  if (idx <= 0 || !mem.coilId) return 0;
  if (mem.severed) return 0; // cut off from the head: it stops dead, then is reaped
  // The head publishes the coil's shape; find it and read this segment's slot.
  let headMem: CoilHeadMemory | undefined;
  for (const e of ctx.enemies) {
    if (e.kind !== "coilwyrm") continue;
    const hm = e.behaviorMemory as CoilHeadMemory | undefined;
    if (hm?.coilId === mem.coilId) {
      headMem = hm;
      break;
    }
  }
  if (!headMem) return regrowHead(ctx, mem, idx);
  const target = headMem.path?.[idx];
  if (!target) return 0; // path not published yet: hold position
  const [ty, tx] = target;
  if (ty === ctx.enemy.y && tx === ctx.enemy.x) return 0;
  const vacated: Pos = [ctx.enemy.y, ctx.enemy.x];
  ctx.enemy.facing = facingFor(ty - ctx.enemy.y, tx - ctx.enemy.x);
  ctx.enemy.y = ty;
  ctx.enemy.x = tx;
  mem.moved = true;

  // The tail sprouts the growth the head asked for. Its slot in the published path is the
  // authority for WHERE — not "the tile I just left". Those are the same tile on an
  // ordinary turn, but on a two-step turn (a surge, or the thrash after a cut) the tail
  // moves two tiles and the tile it vacated is one further back than the coil now reaches,
  // which sprouted the new segment with a one-tile hole in front of it.
  if (headMem && (headMem.growDebt ?? 0) > 0 && mem.coilRole === "tail" && ctx.spawnEnemy) {
    const slot = headMem.path?.[idx + 1];
    const at: Pos = slot ? [slot[0], slot[1]] : vacated;
    const born = ctx.spawnEnemy({
      y: at[0],
      x: at[1],
      kind: "coilwyrm-coil",
      health: COILWYRM_SEGMENT_HP,
      attack: 0,
      memory: {
        coilId: mem.coilId,
        coilIndex: idx + 1,
        coilRole: "tail",
        // Inherit the encounter's dials: a newborn tail can end up promoted to a head later,
        // and whatever its bag lacks reverts to the module constants (see CoilTuningMemory).
        surgeEvery: headMem.surgeEvery,
        lungeTiles: headMem.lungeTiles,
        growMin: headMem.growMin,
        growMax: headMem.growMax,
      } as Record<string, unknown>,
    });
    if (born) {
      headMem.growDebt = Math.max(0, (headMem.growDebt ?? 1) - 1);
      headMem.segments = idx + 1;
      mem.coilRole = "body"; // the newborn is the hindmost end now
      // Publish where it actually landed so it has a slot to hold next tick. (The head's
      // own shift already left room for the extra slot.)
      if (headMem.path) headMem.path[idx + 1] = [at[0], at[1]];
    }
  }
  return 0; // the body is a wall, not a weapon
}

/**
 * Which sprite a body segment should draw. A snake only reads as one creature if each piece
 * knows its NEIGHBOURS — the part ahead of it (toward the head) and behind it (toward the
 * tail) — and picks the straight, corner or tail-cap that connects those two edges. All the
 * art is cut so the tube leaves the tile edge-to-edge at a single diameter, so as long as the
 * right piece is chosen the body joins up seamlessly.
 *
 * `ahead` / `behind` are tile coordinates of the adjacent parts, or null where there is none
 * (the hindmost segment has no `behind`, so it draws a tail).
 */
export type CoilPiece =
  | "body-h"
  | "body-v"
  | "body-corner-ne"
  | "body-corner-nw"
  | "body-corner-se"
  | "body-corner-sw"
  | "tail-up"
  | "tail-down"
  | "tail-left"
  | "tail-right";

/** Compass direction from `from` to the adjacent tile `to`. */
function sideToward(from: Pos, to: Pos): "n" | "s" | "e" | "w" | null {
  const dy = to[0] - from[0];
  const dx = to[1] - from[1];
  if (dy === -1 && dx === 0) return "n";
  if (dy === 1 && dx === 0) return "s";
  if (dy === 0 && dx === -1) return "w";
  if (dy === 0 && dx === 1) return "e";
  return null; // not orthogonally adjacent (mid-cut, or a desync healing itself)
}

export function coilPieceFor(
  self: Pos,
  ahead: Pos | null,
  behind: Pos | null
): CoilPiece {
  const a = ahead ? sideToward(self, ahead) : null;
  const b = behind ? sideToward(self, behind) : null;

  if (a && b) {
    if ((a === "n" && b === "s") || (a === "s" && b === "n")) return "body-v";
    if ((a === "e" && b === "w") || (a === "w" && b === "e")) return "body-h";
    const vert = a === "n" || b === "n" ? "n" : "s";
    const horiz = a === "e" || b === "e" ? "e" : "w";
    return `body-corner-${vert}${horiz}` as CoilPiece;
  }
  // Hindmost segment: the tail's open end faces its only neighbour, so the tip points away.
  const open = a ?? b;
  if (open === "n") return "tail-down";
  if (open === "s") return "tail-up";
  if (open === "w") return "tail-right";
  if (open === "e") return "tail-left";
  return "body-h"; // nothing to connect to: draw a plain section rather than nothing
}

/**
 * Which head sprite to draw, and whether to mirror it.
 *
 * NOT derived from `enemy.facing`. The head faces the HERO while it is adjacent (it is looking at
 * you, which is the right gameplay read), but each head sprite is cut with its neck leaving a
 * specific edge — so choosing the sprite from `facing` drew a head whose neck pointed somewhere
 * the body wasn't, and the skull appeared to be screwed on sideways. Like the body pieces, the
 * head sprite is a function of the TOPOLOGY: it is decided by where its neck actually is.
 *
 *   neck above -> head-front (looking down/at the viewer)   neck left  -> head-side
 *   neck below -> head-back  (looking away)                 neck right -> head-side mirrored
 *
 * Returns null when the coil is fully severed and there is no neck to align to; the caller then
 * falls back to plain facing, which is all that is left to go on.
 */
export type CoilHeadPose = {
  sprite: "head-front" | "head-back" | "head-side";
  mirror: boolean;
};

export function coilHeadPoseFor(self: Pos, neck: Pos | null): CoilHeadPose | null {
  const side = neck ? sideToward(self, neck) : null;
  if (side === "n") return { sprite: "head-front", mirror: false };
  if (side === "s") return { sprite: "head-back", mirror: false };
  if (side === "w") return { sprite: "head-side", mirror: false };
  if (side === "e") return { sprite: "head-side", mirror: true };
  return null;
}

/** Render hook: bumped on every severed segment (screen shake / flash). */
export function coilwyrmCutNonce(memory: Record<string, unknown> | undefined): number | null {
  const n = (memory as CoilHeadMemory | undefined)?.cutNonce;
  return typeof n === "number" ? n : null;
}
