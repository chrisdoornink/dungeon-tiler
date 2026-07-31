// Headless playtest for the Coilwyrm. Unit tests prove the coil MOVES correctly; only a
// simulated fight can tell you whether it is a fight. Two facts need holding, and earlier
// versions of this boss violated both:
//
//   1. WINNABLE — a player who actually attacks the thing can kill it. The first design
//      (only the tail is cuttable) failed outright: 30 simulated fights, zero wins, because
//      the tail is the far end of the coil and the head is the end that comes to you. That
//      result is what turned the rule into "cut anywhere and everything behind it dies".
//   2. AVOIDANCE LOSES — a player who only runs must die. This is the Mirror Shade failure
//      ("not hard and not dangerous"), and chasing it caught a real bug: the head used to
//      stop moving on the turn it bit, which froze the entire coil for as long as the hero
//      stood beside it — an un-winnable, un-loseable stalemate you could farm forever.
//
// These bots are crude stand-ins for a human: they never eat, cannot plan a route, and read
// none of the fight's tells. Their absolute win rate calibrates NOTHING and is deliberately
// not asserted. What is asserted is direction: attacking beats running, and a healthier hero
// converts more often (i.e. the wall is the HP economy, not the geometry).
import { Enemy } from "../../lib/enemy";
import { movePlayer, Direction, TileSubtype } from "../../lib/map";
import { performThrowRock } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import {
  buildCoilwyrmArena,
  COILWYRM_LAYOUTS,
  type CoilwyrmTuning,
} from "../../lib/bosses/coilwyrm_arena";
import { COILWYRM_SPLIT_MIN } from "../../lib/bosses/coilwyrm";

type Pos = [number, number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function heroAt(s: GameState): Pos {
  const subs = s.mapData.subtypes;
  for (let y = 0; y < subs.length; y++)
    for (let x = 0; x < subs[y].length; x++)
      if (subs[y][x].includes(TileSubtype.PLAYER)) return [y, x];
  throw new Error("hero missing");
}

const heads = (s: GameState) => (s.enemies ?? []).filter((e) => e.kind === "coilwyrm");
const head = (s: GameState) => heads(s)[0];
const coil = (s: GameState) =>
  (s.enemies ?? []).filter((e) => e.kind === "coilwyrm-coil");
const coilIdOf = (e: Enemy) =>
  (e.behaviorMemory as { coilId?: string }).coilId ?? "";

const DIRS: Array<[Direction, number, number]> = [
  [Direction.UP, -1, 0],
  [Direction.DOWN, 1, 0],
  [Direction.LEFT, 0, -1],
  [Direction.RIGHT, 0, 1],
];

/** Walkable for the hero: open floor with nothing standing on it. */
function heroCanStand(s: GameState, y: number, x: number): boolean {
  if (s.mapData.tiles[y]?.[x] !== 0) return false;
  if (s.mapData.subtypes[y][x].includes(TileSubtype.WALL_TORCH)) return false;
  return !(s.enemies ?? []).some((e) => e.y === y && e.x === x);
}

/** First step of a shortest hero route to `goal`. */
function stepToward(s: GameState, from: Pos, goal: Pos): Direction | null {
  const k = (y: number, x: number) => `${y},${x}`;
  const dist = new Map<string, number>([[k(goal[0], goal[1]), 0]]);
  const q: Pos[] = [goal];
  for (let i = 0; i < q.length; i++) {
    const [cy, cx] = q[i];
    const d = dist.get(k(cy, cx))!;
    for (const [, dy, dx] of DIRS) {
      const ny = cy + dy;
      const nx = cx + dx;
      if (dist.has(k(ny, nx))) continue;
      if (k(ny, nx) !== k(from[0], from[1]) && !heroCanStand(s, ny, nx)) continue;
      dist.set(k(ny, nx), d + 1);
      q.push([ny, nx]);
    }
  }
  let best: Direction | null = null;
  let bestD = Infinity;
  for (const [dir, dy, dx] of DIRS) {
    const ny = from[0] + dy;
    const nx = from[1] + dx;
    if (!heroCanStand(s, ny, nx)) continue;
    const d = dist.get(k(ny, nx));
    if (d !== undefined && d < bestD) {
      bestD = d;
      best = dir;
    }
  }
  return best;
}

/** Is a coil segment the first thing in a clear line `dir`, inside a rock's 4-tile range? */
function segmentInThrowLine(s: GameState, dir: Direction): boolean {
  const h = heroAt(s);
  const [, dy, dx] = DIRS.find(([d]) => d === dir)!;
  let y = h[0];
  let x = h[1];
  for (let step = 1; step <= 4; step++) {
    y += dy;
    x += dx;
    if (s.mapData.tiles[y]?.[x] !== 0) return false;
    const occupant = (s.enemies ?? []).find((e) => e.y === y && e.x === x);
    if (occupant) return occupant.kind === "coilwyrm-coil";
  }
  return false;
}

const depthOf = (e: Enemy) =>
  (e.behaviorMemory as { coilIndex?: number }).coilIndex ?? 99;

type Action = { throw: true } | { move: Direction };

/**
 * THE CUTTER — a player who attacks. Hacks whatever piece of coil is nearest, breaking ties
 * toward the deeper one (everything behind a cut dies with it), spends rocks when a clear
 * line offers itself, and goes for the head once the body is gone. Notably it does NOT dive
 * for the neck: simulation says the big-payoff cut costs a bite per tile of the approach,
 * and steady hacking converts better.
 *
 * `leadTarget` is the fight's skill gate, and it is the whole reason this file exists.
 * Enemies resolve BEFORE the hero's blow, so a swing at the tile a segment occupies right
 * now lands on the tile it just flowed out of. A player who has not worked that out cuts
 * the coil down to its last segment and then can never finish it (0 wins in 30); a player
 * who leads the target converts most of the same fights.
 */
function makeCutter(leadTarget: boolean) {
  return function cutterAction(s: GameState): Action | null {
  const h = heroAt(s);
  const allHeads = heads(s);
  if (allHeads.length === 0) return null;
  const segs = coil(s);
  const adj = (p: { y: number; x: number }) =>
    Math.abs(p.y - h[0]) + Math.abs(p.x - h[1]) === 1;
  const dTo = (p: { y: number; x: number }, y: number, x: number) =>
    Math.abs(p.y - y) + Math.abs(p.x - x);
  const depth = (e: Enemy) =>
    (e.behaviorMemory as { coilIndex?: number }).coilIndex ?? 99;

  // Nothing left but heads: go finish the nearest one.
  if (segs.length === 0) {
    const hd = [...allHeads].sort(
      (a, b) => dTo(a, h[0], h[1]) - dTo(b, h[0], h[1])
    )[0];
    for (const [dir, dy, dx] of DIRS)
      if (h[0] + dy === hd.y && h[1] + dx === hd.x) return { move: dir };
    const step = stepToward(s, h, [hd.y, hd.x]);
    return step === null ? null : { move: step };
  }

  // How many segments a cut at this one would sever, and whether that remainder is short
  // enough to die rather than grow its own head. Cutting "safely" means leaving <= 3 behind.
  const lenOf = new Map<string, number>();
  for (const sg of segs) {
    const id = coilIdOf(sg);
    lenOf.set(id, Math.max(lenOf.get(id) ?? 0, depth(sg)));
  }
  const severs = (sg: Enemy) => (lenOf.get(coilIdOf(sg)) ?? 0) - depth(sg);
  const safeToCut = (sg: Enemy) => severs(sg) < COILWYRM_SPLIT_MIN;

  // Strike where the body WILL be. Each segment steps into the tile of the part ahead of
  // it, so the tile in FRONT of a segment is the one to hit — including the head's own
  // tile once the coil is short, which is exactly what the last segment demands.
  if (leadTarget) {
  // Per COIL: a segment steps into the tile of the part ahead of it in its OWN wyrm.
  const byCoil = new Map<string, Map<number, Enemy>>();
  for (const sg of segs) {
    const id = coilIdOf(sg);
    if (!byCoil.has(id)) byCoil.set(id, new Map());
    byCoil.get(id)!.set(depth(sg), sg);
  }
  const headByCoil = new Map(allHeads.map((hh) => [coilIdOf(hh), hh]));
  const predicted = new Map<string, Enemy>();
  for (const sg of segs) {
    const id = coilIdOf(sg);
    const ahead =
      depth(sg) === 1 ? headByCoil.get(id) : byCoil.get(id)!.get(depth(sg) - 1);
    if (ahead) predicted.set(`${ahead.y},${ahead.x}`, sg);
  }
  // Only take cuts whose remainder is too short to survive — a greedy deep cut would hand
  // the player a second wyrm. Among the safe ones, take the shallowest (biggest payoff).
  const strikes = DIRS.map(([dir, dy, dx]) => ({
    dir,
    seg: predicted.get(`${h[0] + dy},${h[1] + dx}`),
  }))
    .filter((c) => c.seg && (!leadTarget || safeToCut(c.seg)))
    .sort((a, b) => depth(a.seg!) - depth(b.seg!));
  if (strikes.length > 0) return { move: strikes[0].dir };
  }

  // Swing at a segment standing still beside us (blocked, or the unskilled read).
  const reachable = segs.filter(adj).sort((a, b) => depth(a) - depth(b));
  if (reachable.length > 0) {
    const t = reachable[0];
    for (const [dir, dy, dx] of DIRS)
      if (h[0] + dy === t.y && h[1] + dx === t.x) return { move: dir };
  }

  // A rock already lined up is a free cut (and cuts drop rocks, so it pays for itself).
  if ((s.rockCount ?? 0) > 0 && segmentInThrowLine(s, s.playerDirection)) {
    return { throw: true };
  }

  // Head for the shallowest SAFE cut — that is the biggest chunk you can take without
  // spawning a second boss. Fall back to anything if no safe cut exists.
  const wanted = leadTarget ? segs.filter(safeToCut) : segs;
  const pool = wanted.length > 0 ? wanted : segs;
  const target = [...pool].sort(
    (a, b) => dTo(a, h[0], h[1]) - dTo(b, h[0], h[1]) || depth(a) - depth(b)
  )[0];
  const step = stepToward(s, h, [target.y, target.x]);
  return step === null ? null : { move: step };
  };
}

const skilledCutter = makeCutter(true);
const unskilledCutter = makeCutter(false);

/** THE RUNNER — never fights, only maximises distance from the head. Must lose. */
function runnerAction(s: GameState): Action | null {
  const h = heroAt(s);
  const hd = head(s);
  if (!hd) return null;
  const legal = DIRS.filter(([, dy, dx]) => heroCanStand(s, h[0] + dy, h[1] + dx));
  if (legal.length === 0) return null;
  let best: Direction | null = null;
  let bestD = -Infinity;
  for (const [dir, dy, dx] of legal) {
    const d = Math.abs(hd.y - (h[0] + dy)) + Math.abs(hd.x - (h[1] + dx));
    if (d > bestD) {
      bestD = d;
      best = dir;
    }
  }
  return best === null ? null : { move: best };
}

type Outcome = "killed-boss" | "died" | "survived";

function playOut(
  seed: number,
  layoutIndex: number,
  policy: (s: GameState) => Action | null,
  heroHp: number,
  maxTurns = 400,
  tuning?: CoilwyrmTuning
): Outcome {
  const rng = mulberry32(seed);
  let state = buildCoilwyrmArena(
    COILWYRM_LAYOUTS[layoutIndex],
    rng,
    undefined,
    tuning
  );
  state = { ...state, combatRng: rng, heroHealth: heroHp, heroMaxHealth: heroHp };
  for (let turn = 0; turn < maxTurns; turn++) {
    if (state.heroHealth <= 0) return "died";
    if (heads(state).length === 0) return "killed-boss";
    const act = policy(state);
    if (act === null) return "survived"; // nothing legal left to do
    state = "throw" in act ? performThrowRock(state) : movePlayer(state, act.move);
  }
  return "survived";
}

const RUNS = 30;

function tally(
  policy: (s: GameState) => Action | null,
  heroHp: number,
  tuning?: CoilwyrmTuning
): Record<Outcome, number> {
  const out: Record<Outcome, number> = { "killed-boss": 0, died: 0, survived: 0 };
  for (let i = 0; i < RUNS; i++) {
    out[
      playOut(1000 + i * 7, i % COILWYRM_LAYOUTS.length, policy, heroHp, 400, tuning)
    ] += 1;
  }
  return out;
}

describe("Coilwyrm plays as a fight", () => {
  it("is winnable by a player who spends their consumables", () => {
    // The arena hands the hero 6 HP + 3 food + 1 potion, which is ~11 effective HP if they
    // actually eat. These bots never do, so 11 is the honest proxy for a player who does.
    // Around half at 11 and most of them at 20; the point is the band, not the digits.
    const spent = tally(skilledCutter, 11);
    const healthy = tally(skilledCutter, 20);
    expect(spent["killed-boss"]).toBeGreaterThanOrEqual(Math.round(RUNS * 0.3));
    expect(healthy["killed-boss"]).toBeGreaterThan(spent["killed-boss"]);
  });

  it("is a real encounter, not a two-hit exploit", () => {
    // Before severed lengths could grow their own head, a player who led the target chopped
    // the whole coil in one blow and the fight was over in ~4 turns of contact. Splitting
    // made a greedy deep cut cost you a second boss, and fights roughly doubled in length.
    let turns = 0;
    let fights = 0;
    for (let i = 0; i < RUNS; i++) {
      const rng = mulberry32(1000 + i * 7);
      let st = buildCoilwyrmArena(COILWYRM_LAYOUTS[i % COILWYRM_LAYOUTS.length], rng);
      st = { ...st, combatRng: rng, heroHealth: 11, heroMaxHealth: 11 };
      let t = 0;
      for (; t < 400; t++) {
        if (st.heroHealth <= 0 || heads(st).length === 0) break;
        const a = skilledCutter(st);
        if (a === null) break;
        st = "throw" in a ? performThrowRock(st) : movePlayer(st, a.move);
      }
      turns += t;
      fights += 1;
    }
    expect(turns / fights).toBeGreaterThan(18);
  });

  it("gates the kill behind reading the fight, not behind HP", () => {
    // THE skill gradient. The unskilled bot swings where the body IS (so it mostly misses)
    // and takes whatever cut is nearest (so it hands itself second wyrms). Even with a huge
    // HP pool that converts far worse than a skilled player on a normal budget.
    const unskilled = tally(unskilledCutter, 50);
    const skilled = tally(skilledCutter, 11);
    expect(skilled["killed-boss"]).toBeGreaterThan(unskilled["killed-boss"]);
  });

  it("never lets a player who only runs away win", () => {
    // THE guarantee, and it holds at every tuning: kiting is not a win path. The wyrm must be
    // cut to die, so a hero who never attacks can at best stall — and stalling earns nothing,
    // because the boss carries the exit key.
    const r = tally(runnerAction, 6);
    expect(r["killed-boss"]).toBe(0);
    // Most of them still die to it on the shipped one-tile-per-turn tuning (measured 18/30 at
    // 6 HP). A floor, not a target: the bot never eats and cannot plan a route.
    expect(r["died"]).toBeGreaterThanOrEqual(Math.ceil(RUNS * 0.5));
  });

  it("closes on a runner much harder when it may double-move", () => {
    // Why COILWYRM_LUNGE_TILES still exists even though the encounter ships with lunges off.
    // The double-move is the ONLY thing that converts kiting from a stall into a death, and it
    // is what the surge rides on: at lungeTiles 1 a "surge" is an ordinary step, so surge/5 and
    // no-surge produce byte-identical outcomes. Measured at 6 HP: 18/30 deaths on one tile per
    // turn, 25/30 with a 2-tile surge every 5. Keep this asserted, or a future tidy-up deletes
    // the mechanic on the grounds that nothing uses it.
    const flowing = tally(runnerAction, 6, { lungeTiles: 1, surgeEvery: 0 });
    const surging = tally(runnerAction, 6, { lungeTiles: 2, surgeEvery: 5 });
    expect(surging["died"]).toBeGreaterThan(flowing["died"]);
    expect(surging["killed-boss"]).toBe(0);
    // And the surge is inert without the double-move behind it.
    const surgeWithoutLunge = tally(runnerAction, 6, { lungeTiles: 1, surgeEvery: 5 });
    expect(surgeWithoutLunge).toEqual(flowing);
  });

  it("never leaves the coil broken, whatever the player does", () => {
    // Invariants across whole simulated fights: parts never stack, never stand in a wall,
    // and the coil stays one unbroken line from head to tail.
    for (let i = 0; i < 6; i++) {
      const rng = mulberry32(4000 + i);
      let state = buildCoilwyrmArena(COILWYRM_LAYOUTS[i % COILWYRM_LAYOUTS.length], rng);
      state = { ...state, combatRng: rng, heroHealth: 60, heroMaxHealth: 60 };
      for (let turn = 0; turn < 120; turn++) {
        const allHeads = heads(state);
        if (allHeads.length === 0 || state.heroHealth <= 0) break;
        // No two parts of ANY wyrm ever share a tile or stand in a wall.
        const everyPart = [...allHeads, ...coil(state)];
        const keys = everyPart.map((p) => `${p.y},${p.x}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const p of everyPart) expect(state.mapData.tiles[p.y][p.x]).toBe(0);
        // Each wyrm separately: the head plus the dense run of indices 1..n behind it is one
        // unbroken chain. Anything past a hole is a length just cut off — it either dies or
        // becomes its own wyrm next tick, so it is not part of this chain.
        for (const hd of allHeads) {
          const id = coilIdOf(hd);
          const mine = coil(state)
            .filter((e) => coilIdOf(e) === id)
            .sort((a, b) => depthOf(a) - depthOf(b));
          const attached = [hd];
          for (let k = 0; k < mine.length; k++) {
            if (depthOf(mine[k]) !== k + 1) break;
            attached.push(mine[k]);
          }
          for (let k = 1; k < attached.length; k++) {
            const d =
              Math.abs(attached[k].y - attached[k - 1].y) +
              Math.abs(attached[k].x - attached[k - 1].x);
            expect(d).toBe(1);
          }
        }
        const act = skilledCutter(state);
        if (act === null) break;
        state = "throw" in act ? performThrowRock(state) : movePlayer(state, act.move);
      }
    }
  });
});
