// Headless policy simulation for the Quarrymaster, following the method the Coilwyrm
// build used: drive the real engine with bot proxies for the ways a player can try to
// break a boss fight, and assert the fight neither collapses (a lazy policy wins) nor is
// impossible (a competent policy never wins).
//
// The bots are crude — they do not plan routes, bait adds onto specific pits, or manage
// consumables well — so the SKILLED number is a floor on a human's rate, not an estimate
// of it. What matters is the SHAPE: engaging must beat waiting, by a lot.
//
// STATUS: engaging beats waiting (only the switch-runner ever wins), but the fight has no
// clock — waiting no longer LOSES either, it just runs out the turn cap. The floor-cracking
// that used to kill campers 40/40 was cut by design. See the feature doc's open questions.
import { Direction, TileSubtype } from "../../lib/map";
import {
  movePlayer,
  performUseFood,
  performUsePotion,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import {
  buildQuarrymasterArena,
  QUARRYMASTER_LAYOUTS,
} from "../../lib/bosses/quarrymaster_arena";

const MAX_TURNS = 400;
const ORTHO: Array<[number, number, Direction]> = [
  [-1, 0, Direction.UP],
  [1, 0, Direction.DOWN],
  [0, -1, Direction.LEFT],
  [0, 1, Direction.RIGHT],
];

type Pos = { y: number; x: number };

function heroAt(state: GameState): Pos {
  const { subtypes } = state.mapData;
  for (let y = 0; y < subtypes.length; y++) {
    for (let x = 0; x < subtypes[y].length; x++) {
      if (subtypes[y][x].includes(TileSubtype.PLAYER)) return { y, x };
    }
  }
  throw new Error("hero not on the map");
}

/**
 * Tiles the hero must never voluntarily walk into: authored cracks, any hole a goblin has
 * already opened, standing spike beds, and the lava pools by the door. All are plainly
 * visible in-game, so a bot that blundered into them would be measuring its own
 * carelessness rather than the arena — and spikes in particular REFUSE the move, so a bot
 * that kept trying would just wedge itself against one for the rest of the fight
 * (measured: 13 spike deaths and the Broken Yard at 0/12 before this).
 *
 * Lava belongs here for the same reason and is the clearest case of it: it GLOWS, which is
 * the whole point of putting it by the hero's start (see the arena's `L` legend), so it is
 * the most visible hazard in the room. Omitting it took the switch-runner from 40/40 to
 * 14/40 purely on walk-into-the-fire deaths.
 *
 * Retracted beds (SPIKE_HOLES) are deliberately absent — those are walkable, and treating
 * them as blocked would hide the fact that a thrown switch opens the way. So is OBSIDIAN,
 * a rock-cooled lava tile, which is genuinely safe to cross.
 */
function lethalTiles(state: GameState): Set<string> {
  const out = new Set<string>();
  const { subtypes } = state.mapData;
  for (let y = 0; y < subtypes.length; y++) {
    for (let x = 0; x < subtypes[y].length; x++) {
      const cell = subtypes[y][x];
      if (
        cell.includes(TileSubtype.OPEN_ABYSS) ||
        cell.includes(TileSubtype.FAULTY_FLOOR) ||
        cell.includes(TileSubtype.SPIKES) ||
        (cell.includes(TileSubtype.LAVA) && !cell.includes(TileSubtype.OBSIDIAN))
      ) {
        out.add(`${y},${x}`);
      }
    }
  }
  return out;
}

function walkable(state: GameState, lethal: Set<string>, y: number, x: number): boolean {
  const t = state.mapData.tiles[y]?.[x];
  if (t !== 0 && t !== 5) return false;
  return !lethal.has(`${y},${x}`);
}

/**
 * First step of a shortest path from the hero to any goal.
 *
 * `throughEnemies` is the difference between a bot that thrashes and one that plays: with
 * it false, bodies are walls and a surrounded hero gets no route at all; with it true, the
 * path may run through a goblin, and stepping into a goblin IS the attack. A player facing
 * a blocked lane cuts through it, so the policy tries clean first and then cuts.
 */
function stepToward(
  state: GameState,
  from: Pos,
  goals: Pos[],
  lethal: Set<string>,
  throughEnemies = false
): Direction | null {
  if (goals.length === 0) return null;
  const enemyKeys = new Set(
    (state.enemies ?? []).map((e) => `${e.y},${e.x}`)
  );
  const goalKeys = new Set(goals.map((g) => `${g.y},${g.x}`));
  // BFS from the hero, remembering the first step taken on each frontier path.
  const seen = new Set<string>([`${from.y},${from.x}`]);
  const q: Array<{ y: number; x: number; first: Direction | null }> = [
    { y: from.y, x: from.x, first: null },
  ];
  while (q.length) {
    const cur = q.shift()!;
    for (const [dy, dx, dir] of ORTHO) {
      const ny = cur.y + dy;
      const nx = cur.x + dx;
      const k = `${ny},${nx}`;
      if (seen.has(k)) continue;
      if (!walkable(state, lethal, ny, nx)) continue;
      const first = cur.first ?? dir;
      if (goalKeys.has(k)) return first;
      if (enemyKeys.has(k) && !throughEnemies) continue;
      seen.add(k);
      q.push({ y: ny, x: nx, first });
    }
  }
  return null;
}

/**
 * The move to make toward `goals` when the clean route is gone: cut through the blockers,
 * and failing that hit whatever is adjacent or shuffle to safe ground. Never returns a
 * step onto known-lethal floor — no player walks into a pit they can see, so a bot that
 * did would measure the arena's difficulty as its own clumsiness.
 */
function pressOn(
  state: GameState,
  hero: Pos,
  goals: Pos[],
  lethal: Set<string>
): Direction {
  const through = stepToward(state, hero, goals, lethal, true);
  if (through !== null) return through;
  const hit = adjacentTarget(state, hero);
  if (hit !== null) return hit;
  const out = escapeStep(state, hero, lethal);
  if (out !== null) return out;
  // Cornered with every exit lethal or occupied: shove a wall rather than a pit.
  for (const [dy, dx, dir] of ORTHO) {
    if (state.mapData.tiles[hero.y + dy]?.[hero.x + dx] === 1) return dir;
  }
  return Direction.UP;
}

/** An adjacent enemy to hit, preferring the weakest so swings aren't wasted. */
function adjacentTarget(state: GameState, hero: Pos): Direction | null {
  const options = ORTHO.map(([dy, dx, dir]) => ({
    dir,
    enemy: (state.enemies ?? []).find(
      (e) => e.y === hero.y + dy && e.x === hero.x + dx
    ),
  })).filter((o) => o.enemy);
  if (options.length === 0) return null;
  options.sort((a, b) => (a.enemy!.health ?? 99) - (b.enemy!.health ?? 99));
  return options[0].dir;
}

/** Any safe neighbour — the escape move when the hero is standing on a telegraph. */
function escapeStep(state: GameState, hero: Pos, lethal: Set<string>): Direction | null {
  const enemyKeys = new Set((state.enemies ?? []).map((e) => `${e.y},${e.x}`));
  for (const [dy, dx, dir] of ORTHO) {
    const ny = hero.y + dy;
    const nx = hero.x + dx;
    if (!walkable(state, lethal, ny, nx)) continue;
    if (enemyKeys.has(`${ny},${nx}`)) continue;
    return dir;
  }
  return null;
}

function unpressedPlates(state: GameState): Pos[] {
  return (state.gateGroups ?? [])
    .filter((g) => !g.open)
    .map((g) => ({ y: g.plate[0], x: g.plate[1] }));
}

type Policy = (
  state: GameState
) => { dir?: Direction; usePotion?: boolean; useFood?: boolean };

/**
 * Spend healing the way a player would. The threshold is the per-turn damage cap plus a
 * step, not half health: the cap is 4, so anything at or below 6 can be killed inside two
 * turns and there is no point holding potions for a corpse. Healing at half health left
 * the earlier bots dying at 3 HP with two potions and three food unspent — they were
 * losing to their own hoarding, not to the arena. Each drink is still a whole turn with
 * the swarm closing, which is the real cost.
 */
function healChoice(
  state: GameState
): { usePotion?: boolean; useFood?: boolean } | null {
  const max = state.heroMaxHealth ?? 10;
  const hp = state.heroHealth ?? 0;
  if (hp > 6) return null;
  if ((state.potionCount ?? 0) > 0 && hp <= max - 2) return { usePotion: true };
  if ((state.foodCount ?? 0) > 0 && hp <= max - 1) return { useFood: true };
  return null;
}

/**
 * SKILLED: throw the switches, then kill him. Steps off telegraphed floor first, drinks
 * at 2 HP, cuts down whatever blocks the route, and otherwise beelines to the nearest
 * unthrown switch. It does NOT deliberately bait adds onto pits — that is the main skill
 * a human has and this bot does not, which is why its rate is a floor.
 */
const skilled: Policy = (state) => {
  const hero = heroAt(state);
  const lethal = lethalTiles(state);
  if (lethal.has(`${hero.y},${hero.x}`)) {
    const out = escapeStep(state, hero, lethal);
    if (out !== null) return { dir: out };
  }
  const heal = healChoice(state);
  if (heal) return heal;

  const plates = unpressedPlates(state);
  const boss = (state.enemies ?? []).find((e) => e.kind === "quarrymaster");
  const goals: Pos[] =
    plates.length > 0 ? plates : boss ? [{ y: boss.y, x: boss.x }] : [];

  const step = stepToward(state, hero, goals, lethal);
  return { dir: step ?? pressOn(state, hero, goals, lethal) };
};

/** CAMPER: never leaves its corner. Bumps a wall to burn the turn, swings at whatever
 *  arrives, and only moves when the floor under it is about to go. */
const camper: Policy = (state) => {
  const hero = heroAt(state);
  const lethal = lethalTiles(state);
  if (lethal.has(`${hero.y},${hero.x}`)) {
    const out = escapeStep(state, hero, lethal);
    if (out !== null) return { dir: out };
  }
  const heal = healChoice(state);
  if (heal) return heal;
  const hit = adjacentTarget(state, hero);
  if (hit !== null) return { dir: hit };
  // Face the nearest wall and shove: a blocked bump still spends the turn.
  for (const [dy, dx, dir] of ORTHO) {
    if (state.mapData.tiles[hero.y + dy]?.[hero.x + dx] === 1) return { dir };
  }
  return { dir: Direction.UP };
};

/** KITER: runs from the nearest enemy forever, never throws a switch. */
const kiter: Policy = (state) => {
  const hero = heroAt(state);
  const lethal = lethalTiles(state);
  const heal = healChoice(state);
  if (heal) return heal;
  const enemies = state.enemies ?? [];
  const enemyKeys = new Set(enemies.map((e) => `${e.y},${e.x}`));
  const nearestDist = (y: number, x: number) =>
    enemies.length === 0
      ? 99
      : Math.min(...enemies.map((e) => Math.abs(e.y - y) + Math.abs(e.x - x)));
  let best: { dir: Direction; d: number } | null = null;
  for (const [dy, dx, dir] of ORTHO) {
    const ny = hero.y + dy;
    const nx = hero.x + dx;
    if (!walkable(state, lethal, ny, nx)) continue;
    if (enemyKeys.has(`${ny},${nx}`)) continue;
    const d = nearestDist(ny, nx);
    if (!best || d > best.d) best = { dir, d };
  }
  if (best) return { dir: best.dir };
  return { dir: pressOn(state, hero, [], lethal) };
};

/** RUSHER: ignores the switches entirely and tries to walk at the caged boss. */
const rusher: Policy = (state) => {
  const hero = heroAt(state);
  const lethal = lethalTiles(state);
  if (lethal.has(`${hero.y},${hero.x}`)) {
    const out = escapeStep(state, hero, lethal);
    if (out !== null) return { dir: out };
  }
  const heal = healChoice(state);
  if (heal) return heal;
  const boss = (state.enemies ?? []).find((e) => e.kind === "quarrymaster");
  const goals = boss ? [{ y: boss.y, x: boss.x }] : [];
  const step = stepToward(state, hero, goals, lethal);
  return { dir: step ?? pressOn(state, hero, goals, lethal) };
};

interface Outcome {
  killedBoss: boolean;
  died: boolean;
  stalled: boolean;
  turns: number;
  platesThrown: number;
  addsKilled: number;
  /** What actually ended it — the single most useful number when tuning. */
  cause: string;
  healsLeft: number;
}

function snapshot(state: GameState, turns: number): Omit<Outcome, "killedBoss" | "died" | "stalled"> {
  const c = state.deathCause as { type?: string; enemyKind?: string } | undefined;
  return {
    turns,
    platesThrown: (state.gateGroups ?? []).filter((g) => g.open).length,
    addsKilled: state.stats.enemiesDefeated,
    cause: c ? `${c.type}${c.enemyKind ? `:${c.enemyKind}` : ""}` : "-",
    healsLeft: (state.foodCount ?? 0) + (state.potionCount ?? 0),
  };
}

function runFight(seed: number, policy: Policy, heroHealth?: number): Outcome {
  // Layouts are authored, so the seed picks which one and the Math.random mock supplies the
  // varying RNG stream on top.
  let state = buildQuarrymasterArena({ heroHealth, layoutIndex: seed }).state;
  let turns = 0;
  while (turns < MAX_TURNS) {
    turns += 1;
    const move = policy(state);
    const next = move.usePotion
      ? performUsePotion(state)
      : move.useFood
      ? performUseFood(state)
      : movePlayer(state, move.dir ?? Direction.UP);
    state = next as GameState;
    // Order matters: a mutual kill (his last swing lands as your last swing lands) is a
    // DEATH, because the run is over either way and the hero never reaches the exit.
    if ((state.heroHealth ?? 0) <= 0) {
      return { killedBoss: false, died: true, stalled: false, ...snapshot(state, turns) };
    }
    if (state.bossDefeated) {
      return { killedBoss: true, died: false, stalled: false, ...snapshot(state, turns) };
    }
  }
  return { killedBoss: false, died: false, stalled: true, ...snapshot(state, turns) };
}

function runFightOnLayout(layoutIndex: number, policy: Policy): Outcome {
  let state = buildQuarrymasterArena({ layoutIndex }).state;
  let turns = 0;
  while (turns < MAX_TURNS) {
    turns += 1;
    const move = policy(state);
    const next = move.usePotion
      ? performUsePotion(state)
      : move.useFood
      ? performUseFood(state)
      : movePlayer(state, move.dir ?? Direction.UP);
    state = next as GameState;
    if ((state.heroHealth ?? 0) <= 0) {
      return { killedBoss: false, died: true, stalled: false, ...snapshot(state, turns) };
    }
    if (state.bossDefeated) {
      return { killedBoss: true, died: false, stalled: false, ...snapshot(state, turns) };
    }
  }
  return { killedBoss: false, died: false, stalled: true, ...snapshot(state, turns) };
}

function sweep(policy: Policy, fights: number, heroHealth?: number) {
  const results: Outcome[] = [];
  for (let seed = 1; seed <= fights; seed++) results.push(runFight(seed, policy, heroHealth));
  const avg = (pick: (r: Outcome) => number) =>
    results.reduce((a, r) => a + pick(r), 0) / Math.max(1, results.length);
  const causes = new Map<string, number>();
  for (const r of results.filter((x) => x.died)) {
    causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
  }
  return {
    results,
    wins: results.filter((r) => r.killedBoss).length,
    deaths: results.filter((r) => r.died).length,
    stalls: results.filter((r) => r.stalled).length,
    avgPlates: avg((r) => r.platesThrown),
    avgAdds: avg((r) => r.addsKilled),
    avgTurns: avg((r) => r.turns),
    avgHealsLeft: avg((r) => r.healsLeft),
    causes: [...causes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c}x${n}`)
      .join(" "),
  };
}

function report(name: string, s: ReturnType<typeof sweep>, fights: number): void {
  // eslint-disable-next-line no-console
  console.log(
    `${name}: ${s.wins}/${fights} kills, ${s.deaths} deaths, ${s.stalls} stalls | ` +
      `switches ${s.avgPlates.toFixed(1)}/4, ${s.avgAdds.toFixed(0)} adds, ` +
      `${s.avgTurns.toFixed(0)} turns, ${s.avgHealsLeft.toFixed(1)} heals unspent | ${s.causes}`
  );
}

const FIGHTS = 40;

describe("Quarrymaster policy simulation", () => {
  // Seeded arena layout, but combat variance and the boss's own rolls use Math.random,
  // so pin it for reproducible numbers.
  let randomSpy: jest.SpyInstance;
  beforeEach(() => {
    let n = 0;
    // A fixed, non-degenerate cycle: 0.5 everywhere would freeze every coin flip in the
    // engine into the same branch and stop being a fair sample.
    const cycle = [0.17, 0.83, 0.41, 0.66, 0.09, 0.95, 0.52, 0.28, 0.74, 0.36];
    randomSpy = jest
      .spyOn(Math, "random")
      .mockImplementation(() => cycle[n++ % cycle.length]);
  });
  afterEach(() => randomSpy.mockRestore());

  test("a switch-runner solves the puzzle and wins", () => {
    const s = sweep(skilled, FIGHTS);
    report("skilled", s, FIGHTS);
    expect(s.wins).toBeGreaterThan(FIGHTS * 0.5);
    // It must actually be doing the puzzle, not stumbling into a win.
    expect(s.avgPlates).toBeGreaterThan(2);
    // Currently 40/40 with heals to spare: with two suicidal summons and no clock there is
    // nothing left to lose to. Recorded rather than asserted-against, because the fix is a
    // balance pass, not a looser test.
  });

  test("camping never wins (but no longer loses either — see the clock gap)", () => {
    const s = sweep(camper, FIGHTS);
    report("camper", s, FIGHTS);
    expect(s.wins).toBe(0);
    // NOTE: it does not DIE either — it stalls to the turn cap in every fight. That is a
    // known, deliberate gap, not a passing grade: the boss's floor-cracking used to be the
    // clock that killed campers (it did, 40/40) and it was cut because pits appearing
    // mid-fight was never the design intent. Until a replacement clock exists, the only
    // claim this suite can honestly make about waiting is that it never WINS.
    expect(s.stalls + s.deaths).toBe(FIGHTS);
  });

  test("kiting never wins (but no longer loses either — see the clock gap)", () => {
    const s = sweep(kiter, FIGHTS);
    report("kiter", s, FIGHTS);
    expect(s.wins).toBe(0);
    // Same gap as the camper — see the note there.
    expect(s.stalls + s.deaths).toBe(FIGHTS);
  });

  test("rushing the cage gets you nowhere: the switches are not optional", () => {
    const s = sweep(rusher, FIGHTS);
    report("rusher", s, FIGHTS);
    expect(s.wins).toBe(0);
  });
});

describe("exploratory: per-layout and hero HP", () => {
  let randomSpy: jest.SpyInstance;
  beforeEach(() => {
    let n = 0;
    const cycle = [0.17, 0.83, 0.41, 0.66, 0.09, 0.95, 0.52, 0.28, 0.74, 0.36];
    randomSpy = jest.spyOn(Math, "random").mockImplementation(() => cycle[n++ % cycle.length]);
  });
  afterEach(() => randomSpy.mockRestore());

  test("hp curve", () => {
    for (const hp of [8, 10, 12, 16]) {
      const sk = sweep(skilled, 24, hp);
      const ca = sweep(camper, 12, hp);
      // eslint-disable-next-line no-console
      console.log(
        `hp ${hp}: skilled ${sk.wins}/24 (${sk.avgTurns.toFixed(0)}t, ${sk.avgPlates.toFixed(1)}/4sw, ` +
        `${sk.avgAdds.toFixed(0)} adds killed) | camper ${ca.wins}/12 w ${ca.stalls} stalls`
      );
    }
  });

  test("per layout", () => {
    QUARRYMASTER_LAYOUTS.forEach((layout, i) => {
      const results: Outcome[] = [];
      for (let n = 0; n < 12; n++) {
        results.push(runFightOnLayout(i, skilled));
      }
      const wins = results.filter((r) => r.killedBoss).length;
      const avg = (pick: (r: Outcome) => number) =>
        results.reduce((a, r) => a + pick(r), 0) / results.length;
      // eslint-disable-next-line no-console
      console.log(
        `${layout.name}: skilled ${wins}/12 (${avg((r) => r.turns).toFixed(0)}t, ` +
        `${avg((r) => r.platesThrown).toFixed(1)}/4sw, ${avg((r) => r.addsKilled).toFixed(0)} adds killed)`
      );
    });
  });
});
