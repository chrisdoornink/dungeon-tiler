// The Quarrymaster: a summoner caged behind switch-gates, fought across a field of cracks.
//
// THE SHAPE. He is a bad duellist behind a locked door. Statline is water-goblin tier, so
// the fight is never about out-damaging him — it is about the goblins piling up behind you
// while you work a route through the crack field to the three switches that unlock him.
// The difficulty is the crowd and your manoeuvring, not the terrain.
//
// THE CRACKS ARE FAULTY_FLOOR, AND THAT IS THE WHOLE TRICK. They are authored into the
// arena layout up front and visible to the player, who simply avoids them. The engine's
// existing rule does the rest, with no special-casing anywhere: a goblin AVOIDS a crack
// while patrolling but will step on one while CHASING, at which point it gives way, the
// goblin falls, and the tile becomes a permanently open hole that everything routes around
// from then on. So each arena de-mines itself as the fight runs, differently every time,
// driven by where the player made the goblins chase them.
//
// THE SUMMONS ARE ORDINARY GOBLINS. Normal speed, normal vision, normal pathing. Nothing
// about them is buffed — the pressure comes from how many there are, not from what each one
// can do.
//
// THE PODS are two mouths flanking his chamber, high up. Each wave, every pod that can
// disgorge does, so the crowd grows over the fight up to a cap.
//
// Pure/testable, and imported by lib/enemy.ts for the statline: imports only TileSubtype and
// the erased BehaviorContext type — no value import that could cycle back through the
// registry.
import { TileSubtype } from "../map/constants";
import type { BehaviorContext } from "../enemies/registry";
import type { EnemyKind } from "../enemies/registry";

const FLOOR = 0;
const FLOWERS = 5;

// --- Tuning dials ----------------------------------------------------------------

/**
 * Boss statline: a water goblin's 5 HP with a bit more bite. Two sword swings and he is
 * done, and he lands 1-3 back.
 *
 * Attack was 3 (spear-goblin tier) and that single point was the difference between a
 * fight you finish and one you don't: the switch-runner bot reliably solved the puzzle and
 * then lost the final trade 21 times in 24, because arriving at a 6 HP / attack-3 boss
 * after a long traverse means a 3-turn exchange you cannot afford.
 */
export const QUARRYMASTER_HP = 5;
export const QUARRYMASTER_ATTACK = 2;

/** Turns between waves. Every pod that can open, opens — so a wave is one goblin per pod. */
export const QUARRYMASTER_WAVE_EVERY = 5;
/**
 * Live summons allowed at once. This is the difficulty dial: the fight is meant to be a
 * crowd you manoeuvre through, so it wants to be high enough to actually crowd the room and
 * low enough that a wall of bodies never makes the switches physically unreachable.
 */
export const QUARRYMASTER_MAX_ADDS = 8;

/**
 * THE SPAWN POOL. Waves open with plain earth goblins (3 HP / attack 1 — easy, and the
 * point is that they're easy) and the odds of something worse creeping in climb as the fight
 * runs, so the crowd gets meaner as well as bigger.
 *
 * PINK GOBLINS ARE EXCLUDED BY RULE. They keep their distance, snipe from range 4-5 and blink
 * away when you close — the exact opposite of a crowd you manoeuvre through, and they'd also
 * die instantly to nothing here since there's no water. Everything else in the roster is in.
 */
export const QUARRYMASTER_HARD_CHANCE_PER_WAVE = 0.06;
export const QUARRYMASTER_HARD_CHANCE_CAP = 0.45;

/** Fallback, and the overwhelming majority of every early wave. */
const BASE_SUMMON: EnemyKind = "earth-goblin";

/**
 * The upgrade table, rolled only when a summon comes up "hard". Weighted so the merely
 * annoying are common and the genuinely dangerous are rare — a stone goblin (8 HP, takes
 * exactly 1 damage per sword hit, hits for 5) can end a run on its own, so it sits at the
 * bottom. Weights are relative, not percentages.
 */
const HARD_SUMMONS: Array<{ kind: EnemyKind; weight: number }> = [
  { kind: "earth-goblin-knives", weight: 30 }, // 3 HP / atk 2 — a sharper version of the base
  { kind: "snake", weight: 20 }, // 2 HP but the bite poisons
  { kind: "fire-goblin", weight: 16 }, // 4 HP; carries a torch, so killing it relights yours
  { kind: "white-goblin", weight: 12 }, // 1 HP, flanks and bites harder when it has company
  { kind: "water-goblin", weight: 10 }, // 5 HP, just tanky
  { kind: "ghost", weight: 6 }, // snuffs your torch — see WALL torches in the layouts
  { kind: "water-goblin-spear", weight: 4 }, // 5 HP / atk 3
  { kind: "stone-goblin", weight: 2 }, // the "oh no" pick
];

const HARD_WEIGHT_TOTAL = HARD_SUMMONS.reduce((n, h) => n + h.weight, 0);

/** Chance a given summon is upgraded out of the base kind, by wave number (1-based). */
export function hardSummonChance(wave: number): number {
  return Math.min(
    QUARRYMASTER_HARD_CHANCE_CAP,
    Math.max(0, wave - 1) * QUARRYMASTER_HARD_CHANCE_PER_WAVE
  );
}

/** Roll one summon's kind for the given wave. */
export function rollSummonKind(wave: number, rng: () => number): EnemyKind {
  if (rng() >= hardSummonChance(wave)) return BASE_SUMMON;
  let roll = rng() * HARD_WEIGHT_TOTAL;
  for (const entry of HARD_SUMMONS) {
    roll -= entry.weight;
    if (roll < 0) return entry.kind;
  }
  return BASE_SUMMON;
}

export interface QuarrymasterMemory {
  /** Turns elapsed in the fight. */
  turn?: number;
  /** Spawn pods, set by the arena builder. */
  pods?: Array<[number, number]>;
  /** Turn the next wave is due, and how many waves have been sent. */
  nextWaveAt?: number;
  waveCount?: number;
  /** One-shot render nonce: bumped on the turn a pod disgorges a monster. */
  podSpawnNonce?: number;
  /** The turn he last called a wave. Drives the arms-raised sprite for exactly that turn. */
  lastSummonTurn?: number;
  /** Chamber pacing box (set by the arena builder), mirroring the Shaper's roam box. */
  roamMinY?: number;
  roamMaxY?: number;
  roamMinX?: number;
  roamMaxX?: number;
}

type Pos = { y: number; x: number };
const ORTHO: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const manhattan = (a: Pos, b: Pos) => Math.abs(a.y - b.y) + Math.abs(a.x - b.x);

function subsAt(subs: number[][][], y: number, x: number): number[] {
  return subs[y]?.[x] ?? [];
}

/** A tile something could stand on: bare floor, no lethal or blocking overlay. */
export function isStandable(
  grid: number[][],
  subs: number[][][],
  y: number,
  x: number
): boolean {
  if (y < 0 || x < 0 || y >= grid.length || x >= (grid[0]?.length ?? 0)) return false;
  if (grid[y][x] !== FLOOR && grid[y][x] !== FLOWERS) return false;
  const s = subsAt(subs, y, x);
  if (s.includes(TileSubtype.OPEN_ABYSS)) return false;
  if (s.includes(TileSubtype.FAULTY_FLOOR)) return false;
  if (s.includes(TileSubtype.LAVA) && !s.includes(TileSubtype.OBSIDIAN)) return false;
  if (s.includes(TileSubtype.DEEP_WATER)) return false;
  return true;
}

/**
 * Where a monster actually appears for a pod at `pod`: the pod tile itself if it is clear,
 * otherwise a neighbouring tile. Pods sit ON walkable floor so the usual case is the pod
 * tile; the fallback only matters when the previous occupant is still standing there
 * (which the cap makes rare) or the hero is body-blocking the mouth.
 */
export function podExit(
  grid: number[][],
  subs: number[][][],
  pod: Pos,
  taken: Pos[]
): Pos | null {
  const free = (y: number, x: number) =>
    isStandable(grid, subs, y, x) && !taken.some((t) => t.y === y && t.x === x);
  if (free(pod.y, pod.x)) return { y: pod.y, x: pod.x };
  for (const [dy, dx] of ORTHO) {
    if (free(pod.y + dy, pod.x + dx)) return { y: pod.y + dy, x: pod.x + dx };
  }
  return null;
}

/** Pace inside the chamber. He is penned in and mostly just shuffles; the cage fights. */
function pace(ctx: BehaviorContext, mem: QuarrymasterMemory, rng: () => number): void {
  const { grid, subtypes } = ctx;
  if (!subtypes) return;
  const minY = mem.roamMinY ?? ctx.enemy.y;
  const maxY = mem.roamMaxY ?? ctx.enemy.y;
  const minX = mem.roamMinX ?? ctx.enemy.x;
  const maxX = mem.roamMaxX ?? ctx.enemy.x;
  // Shuffle so the pacing has no readable tell.
  const dirs = [...ORTHO];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const [dy, dx] of dirs) {
    const ny = ctx.enemy.y + dy;
    const nx = ctx.enemy.x + dx;
    if (ny < minY || ny > maxY || nx < minX || nx > maxX) continue;
    if (!isStandable(grid, subtypes, ny, nx)) continue;
    // Never pace onto the chamber switch. He shares the chamber with the switch that unseals
    // the exit, and a boss parked on it would body-block the win condition — the hero cannot
    // displace him, so the run would soft-lock until he happened to wander off.
    const cell = subtypes[ny]?.[nx] ?? [];
    if (
      cell.includes(TileSubtype.PRESSURE_PLATE) ||
      cell.includes(TileSubtype.PRESSURE_PLATE_PRESSED)
    ) {
      continue;
    }
    if (ny === ctx.player.y && nx === ctx.player.x) continue;
    if (ctx.enemies.some((e, i) => i !== ctx.enemyIndex && e.y === ny && e.x === nx)) continue;
    ctx.enemy.y = ny;
    ctx.enemy.x = nx;
    if (dx !== 0) ctx.enemy.facing = dx > 0 ? "RIGHT" : "LEFT";
    else ctx.enemy.facing = dy > 0 ? "DOWN" : "UP";
    return;
  }
}

/**
 * The Quarrymaster's per-tick brain. Returns contact damage (he swings when the hero
 * finally gets next to him — a short, real trade rather than a formality).
 */
export function quarrymasterUpdate(ctx: BehaviorContext): number {
  const { grid, subtypes } = ctx;
  if (!subtypes) return 0;
  const mem = ctx.enemy.memory as QuarrymasterMemory;
  const rng = ctx.rng ?? Math.random;

  const turn = (mem.turn ?? 0) + 1;
  mem.turn = turn;

  const boss = { y: ctx.enemy.y, x: ctx.enemy.x };
  const hero = { y: ctx.player.y, x: ctx.player.x };

  // COLLARED. With the hero orthogonally adjacent he cannot CALL — you have him by the
  // throat and he is busy. This is what makes the fight's promise true ("get through the
  // gates and he dies easily"): a 5 HP boss you must trade with while fresh goblins keep
  // arriving behind you is a second fight, not a finish.
  const collared = manhattan(boss, hero) === 1;

  const pods = mem.pods ?? [];
  if (mem.nextWaveAt === undefined) mem.nextWaveAt = QUARRYMASTER_WAVE_EVERY;
  if (pods.length > 0 && !collared && ctx.spawnEnemy && turn >= mem.nextWaveAt) {
    // Everything already on the board counts against the cap, however it got there.
    const liveAdds = ctx.enemies.filter(
      (e, i) => i !== ctx.enemyIndex && e.behaviorMemory?.["podId"] !== undefined
    ).length;
    let budget = Math.max(0, QUARRYMASTER_MAX_ADDS - liveAdds);
    const wave = (mem.waveCount ?? 0) + 1;
    mem.waveCount = wave;
    const taken: Pos[] = ctx.enemies.map((e) => ({ y: e.y, x: e.x }));
    taken.push(hero);

    for (let i = 0; i < pods.length && budget > 0; i++) {
      const [py, px] = pods[i];
      const spot = podExit(grid, subtypes, { y: py, x: px }, taken);
      if (!spot) continue; // mouth blocked this wave; it'll open next time
      const kind = rollSummonKind(wave, rng);
      // Plain goblins, plain pathing. They hunt by sight like anything else, they avoid
      // cracks while patrolling and step on them while CHASING (which is how they fall),
      // and they route around a hole once it has opened. `podId` only marks them as his,
      // for the cap — it changes no behaviour.
      if (ctx.spawnEnemy({ y: spot.y, x: spot.x, kind, memory: { podId: `pod${i}` } })) {
        budget -= 1;
        mem.podSpawnNonce = (mem.podSpawnNonce ?? 0) + 1;
        mem.lastSummonTurn = turn;
        taken.push(spot);
      }
    }
    mem.nextWaveAt = turn + QUARRYMASTER_WAVE_EVERY;
  }

  // FIGHT, or pace, or plant. He swings the moment the hero is orthogonally adjacent —
  // through an open gate mouth as readily as inside the chamber.
  if (collared) {
    const dy = hero.y - boss.y;
    const dx = hero.x - boss.x;
    if (dx !== 0) ctx.enemy.facing = dx > 0 ? "RIGHT" : "LEFT";
    else ctx.enemy.facing = dy > 0 ? "DOWN" : "UP";
    return ctx.enemy.attack;
  }
  // He does NOT pace on a turn he called a wave: both arms are over his head. Sliding a tile
  // mid-summon made the tell unreadable (the pose is only up for one turn, so a simultaneous
  // step is most of what the eye catches) and looked like a rendering glitch rather than an
  // action.
  if (!quarrymasterIsSummoning(mem)) pace(ctx, mem, rng);
  return 0;
}

// --- Render hooks ----------------------------------------------------------------

/**
 * Is he mid-call this turn? Drives the arms-raised sprite, which is his one visible tell —
 * the reason a summon pose was drawn at all.
 */
export function quarrymasterIsSummoning(
  mem: QuarrymasterMemory | undefined
): boolean {
  return (
    typeof mem?.lastSummonTurn === "number" && mem.lastSummonTurn === mem.turn
  );
}

/** One-shot nonce: bumped the turn a pod disgorges a monster (for a spawn flash/shake). */
export function quarrymasterPodSpawnNonce(
  mem: QuarrymasterMemory | undefined
): number | null {
  return typeof mem?.podSpawnNonce === "number" ? mem.podSpawnNonce : null;
}
