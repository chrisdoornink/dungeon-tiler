import { Enemy } from "../../lib/enemy";
import { TileSubtype } from "../../lib/map/constants";
import type { BehaviorContext } from "../../lib/enemies/registry";
import { EnemyRegistry } from "../../lib/enemies/registry";
import {
  fisherUpdate,
  spearLane,
  pickHurlLanding,
  fisherCoiledLane,
  fisherIsStunned,
  FISHER_SPEAR_RANGE,
  FISHER_EMBED_TURNS,
  FISHER_EMBED_TURNS_ON_ROCK,
  FISHER_HURL_MIN,
  FISHER_HURL_MAX,
  FISHER_STRIDE,
  FISHER_NECK_REACH,
  FISHER_PANIC_HP,
  FISHER_PANIC_HURL_COOLDOWN,
  FISHER_PANIC_HURLS,
  FISHER_PANIC_MAX_TURNS,
  FISHER_HURL_COOLDOWN,
  fisherIsPanicking,
  type FisherMemory,
} from "../../lib/bosses/fisher";

const FLOOR = 0;
const WALL = 1;
const TREE = 6;
// Matches the real arena's height so "the hero hangs back" is actually reachable:
// FISHER_LURE_RANGE is 7 from the bank at row 14, so hanging back means row 22+.
const N = 26;

/** Fixed rng so hurl landings and pacing are deterministic. */
function rng(): () => number {
  let s = 0.321;
  return () => {
    s = (s * 9301 + 0.49297) % 1;
    return s;
  };
}

interface Harness {
  ctx: BehaviorContext;
  mem: FisherMemory;
  grid: number[][];
  subs: number[][][];
  /** Move the hero and re-point the context at the new tile. */
  setHero: (y: number, x: number, next?: [number, number]) => void;
}

// Mirrors the real arena's geometry so these behaviour tests exercise the actual numbers:
// a SINGLE spike row at 13, the Fisher's four-row bank at 9-12, its fishing row at 9.
const SPIKE_ROW = 13;
const BANK_MIN = 9;
const BANK_MAX = 12;
const FISH = 9;
const HERO_SIDE = 14;
/**
 * The HERO's rock-throw range. The spear used to match it exactly; now the spear is
 * unlimited, so this is the number that actually matters for "can the player reach it" and
 * FISHER_SPEAR_RANGE is no longer a stand-in for it.
 */
const ROCK_RANGE = 4;
/** Rows it can brace on and therefore throw from. Everything else is wade-and-fish only. */
const BRACED = BANK_MAX;
const UNBRACED = BANK_MIN;

/**
 * An open board with a one-row spike band at row 13 (mirroring the real arena), the
 * Fisher on the north side and the hero on the south.
 */
function harness(
  bossPos: [number, number],
  heroPos: [number, number],
  extras: { snakes?: Array<[number, number]>; heroSideMinY?: number } = {}
): Harness {
  const grid = Array.from({ length: N }, (_, y) =>
    Array.from({ length: N }, (_, x) =>
      y === 0 || x === 0 || y === N - 1 || x === N - 1 ? WALL : FLOOR
    )
  );
  const subs: number[][][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => [] as number[])
  );
  for (let x = 1; x < N - 1; x++) subs[SPIKE_ROW][x] = [TileSubtype.SPIKES];

  const fisher = new Enemy({ y: bossPos[0], x: bossPos[1] });
  fisher.kind = "fisher";
  const mem = fisher.behaviorMemory as FisherMemory;
  mem.bankMinY = BANK_MIN;
  mem.bankMaxY = BANK_MAX;
  mem.bankMinX = 1;
  mem.bankMaxX = N - 2;
  mem.heroSideMinY = extras.heroSideMinY ?? HERO_SIDE;
  mem.fishRow = FISH;

  const snakes = (extras.snakes ?? []).map(([y, x]) => {
    const s = new Enemy({ y, x });
    s.kind = "snake";
    return s;
  });
  const roster = [fisher, ...snakes];

  const ctx: BehaviorContext = {
    grid,
    subtypes: subs,
    enemies: roster.map((e) => ({
      y: e.y,
      x: e.x,
      kind: e.kind,
      health: e.health,
      behaviorMemory: e.behaviorMemory,
    })),
    enemyIndex: 0,
    player: { y: heroPos[0], x: heroPos[1], torchLit: true },
    playerNext: { y: heroPos[0], x: heroPos[1] },
    rng: rng(),
    enemy: {
      y: fisher.y,
      x: fisher.x,
      facing: fisher.facing,
      memory: fisher.behaviorMemory,
      attack: fisher.attack,
    },
  };

  return {
    ctx,
    mem,
    grid,
    subs,
    setHero: (y, x, next) => {
      ctx.player = { y, x, torchLit: ctx.player.torchLit };
      ctx.playerNext = next ? { y: next[0], x: next[1] } : { y, x };
    },
  };
}

describe("spearLane (thrown spear, unlimited range)", () => {
  it("reaches a hero straight ahead and keeps going to the first blocker", () => {
    const { grid } = harness([BRACED, 8], [14, 8]);
    const lane = spearLane(grid, { y: BRACED, x: 8 }, { y: 14, x: 8 })!;
    expect(lane).not.toBeNull();
    expect(lane).toContainEqual([14, 8]);
    // Nothing between the hero and the far wall, so the spear flies the whole way.
    expect(lane[lane.length - 1]).toEqual([N - 2, 8]);
  });

  it("crosses the whole map — the range really is unlimited", () => {
    const { grid } = harness([BRACED, 8], [N - 2, 8]);
    const far = N - 2 - BRACED;
    expect(far).toBeGreaterThan(ROCK_RANGE * 2); // far beyond anything the hero can throw
    const lane = spearLane(grid, { y: BRACED, x: 8 }, { y: N - 2, x: 8 })!;
    expect(lane).not.toBeNull();
    expect(lane).toContainEqual([N - 2, 8]);
  });

  it("runs PAST the hero, so a whiff plants somewhere they aren't standing", () => {
    // The rock-trap depends on this: the hero can never stand on a rock (they'd pick it
    // up), so if the lane stopped at them the trap tile could never be set up.
    const { grid } = harness([BRACED, 8], [14, 8]);
    const lane = spearLane(grid, { y: BRACED, x: 8 }, { y: 14, x: 8 })!;
    const end = lane[lane.length - 1];
    expect(end).not.toEqual([14, 8]);
    expect(end[0]).toBeGreaterThan(14);
  });

  it("passes OVER spikes — the barrier stops feet, not projectiles", () => {
    const { grid, subs } = harness([BRACED, 8], [14, 8]);
    expect(subs[SPIKE_ROW][8]).toContain(TileSubtype.SPIKES);
    expect(spearLane(grid, { y: BRACED, x: 8 }, { y: 14, x: 8 })).not.toBeNull();
  });

  it("is null off the cardinal lanes (diagonals are safe)", () => {
    const { grid } = harness([BRACED, 8], [15, 9]);
    expect(spearLane(grid, { y: BRACED, x: 8 }, { y: 15, x: 9 })).toBeNull();
  });

  it("is stopped dead by a tree — cover still works at any range", () => {
    const { grid } = harness([BRACED, 8], [16, 8]);
    grid[15][8] = TREE;
    expect(spearLane(grid, { y: BRACED, x: 8 }, { y: 16, x: 8 })).toBeNull();
  });
});

describe("bracing (what keeps unlimited range fair)", () => {
  it("will not throw from its back rows even with a perfect lane", () => {
    // Without this the spear's unlimited range would let it snipe from outside the hero's
    // rock range forever, with no counterplay at all.
    const h = harness([UNBRACED, 8], [14, 8]);
    expect(spearLane(h.grid, { y: UNBRACED, x: 8 }, { y: 14, x: 8 })).not.toBeNull();
    fisherUpdate(h.ctx);
    expect(fisherCoiledLane(h.mem)).toBeNull(); // lane exists, but it can't plant its feet
  });

  it("throws from the water's edge, which is inside the hero's rock range", () => {
    const h = harness([BRACED, 8], [14, 8]);
    fisherUpdate(h.ctx);
    expect(fisherCoiledLane(h.mem)).not.toBeNull();
    expect(HERO_SIDE - BRACED).toBeLessThanOrEqual(ROCK_RANGE);
  });

  it("walks forward to a braced row when it wants a shot", () => {
    const h = harness([UNBRACED, 8], [14, 8]);
    for (let i = 0; i < 6; i++) fisherUpdate(h.ctx);
    expect(h.ctx.enemy.y).toBeGreaterThan(UNBRACED);
    expect(HERO_SIDE - h.ctx.enemy.y).toBeLessThanOrEqual(ROCK_RANGE);
  });
});

describe("the Fisher's spear cycle", () => {
  it("coils instead of striking when it first lines up (one turn of warning)", () => {
    const h = harness([BRACED, 8], [14, 8]);
    const dmg = fisherUpdate(h.ctx);
    expect(dmg).toBe(0);
    const lane = fisherCoiledLane(h.mem);
    expect(lane).not.toBeNull();
    expect(lane).toContainEqual([14, 8]);
  });

  it("hits a hero who stays in the lane", () => {
    const h = harness([BRACED, 8], [14, 8]);
    fisherUpdate(h.ctx); // coil
    const dmg = fisherUpdate(h.ctx); // resolve
    expect(dmg).toBe(h.ctx.enemy.attack);
    expect(dmg).toBeGreaterThan(0);
    expect(fisherIsStunned(h.mem)).toBe(false);
  });

  it("whiffs and is left off balance when the hero steps out of the lane", () => {
    const h = harness([BRACED, 8], [14, 8]);
    fisherUpdate(h.ctx); // cock the spear, aimed down column 8
    // The hero's END-of-turn tile is what matters — this is the dodge.
    h.setHero(14, 8, [14, 9]);
    const dmg = fisherUpdate(h.ctx);
    expect(dmg).toBe(0);
    expect(fisherIsStunned(h.mem)).toBe(true);
    expect(h.mem.stunTurns).toBe(FISHER_EMBED_TURNS);
    // The spear itself carries on to the end of the lane and plants there.
    expect(h.mem.embedded).toMatchObject({ y: N - 2, x: 8 });
  });

  it("is completely inert while its beak is buried, then recovers", () => {
    const h = harness([BRACED, 8], [14, 8]);
    fisherUpdate(h.ctx);
    h.setHero(14, 8, [14, 9]);
    fisherUpdate(h.ctx); // whiff -> stunned
    const restY = h.ctx.enemy.y;
    const restX = h.ctx.enemy.x;
    // Hero steps back into the lane; a stunned Fisher must NOT punish that.
    h.setHero(14, 8, [14, 8]);
    for (let i = 0; i < FISHER_EMBED_TURNS; i++) {
      expect(fisherUpdate(h.ctx)).toBe(0);
      expect(h.ctx.enemy.y).toBe(restY);
      expect(h.ctx.enemy.x).toBe(restX);
    }
    expect(fisherIsStunned(h.mem)).toBe(false);
  });

  it("stays stuck a turn longer when the beak lands on a rock, and spends the rock", () => {
    // A rock lying where the spear will come down. Only reachable as a trap because the
    // lane runs past the hero rather than stopping at them.
    const h = harness([BRACED, 8], [14, 8]);
    h.subs[N - 2][8] = [TileSubtype.ROCK];
    fisherUpdate(h.ctx); // cock
    h.setHero(14, 8, [14, 9]); // dodge sideways
    fisherUpdate(h.ctx); // whiff, spear lands on the rock
    expect(h.mem.embedded).toMatchObject({ y: N - 2, x: 8 });
    expect(h.mem.stunTurns).toBe(FISHER_EMBED_TURNS_ON_ROCK);
    expect(FISHER_EMBED_TURNS_ON_ROCK).toBeGreaterThan(FISHER_EMBED_TURNS);
    expect(h.subs[N - 2][8]).not.toContain(TileSubtype.ROCK);
  });

  it("buries in bare mud (shorter stun) when no rock is there to shatter on", () => {
    const h = harness([BRACED, 8], [14, 8]);
    fisherUpdate(h.ctx);
    h.setHero(14, 8, [14, 9]);
    fisherUpdate(h.ctx);
    expect(h.mem.stunTurns).toBe(FISHER_EMBED_TURNS);
  });

  it("still hits a hero who steps FURTHER along the lane, not just one who stands still", () => {
    const h = harness([BRACED, 8], [14, 8]);
    fisherUpdate(h.ctx); // coil covering rows 12-15 of column 8
    h.setHero(14, 8, [15, 8]); // stepped deeper into the lane, not out of it
    expect(fisherUpdate(h.ctx)).toBe(h.ctx.enemy.attack);
  });
});

describe("the Fisher's positioning", () => {
  it("advances toward the hero's column when the hero is near the bank", () => {
    const h = harness([BANK_MIN, 2], [14, 12]);
    const startX = h.ctx.enemy.x;
    fisherUpdate(h.ctx);
    expect(h.ctx.enemy.x).toBeGreaterThan(startX);
  });

  it("never steps onto the spikes or off its bank", () => {
    const h = harness([BANK_MAX, 8], [14, 8]);
    // Force it to want to close: hero directly below, already aligned, so it coils —
    // drive many turns and assert it never leaves its four-row bank.
    for (let i = 0; i < 30; i++) {
      fisherUpdate(h.ctx);
      expect(h.ctx.enemy.y).toBeGreaterThanOrEqual(BANK_MIN);
      expect(h.ctx.enemy.y).toBeLessThanOrEqual(BANK_MAX);
      expect(h.subs[h.ctx.enemy.y][h.ctx.enemy.x]).not.toContain(TileSubtype.SPIKES);
    }
  });

  it("can reach the water's edge — one row past the barrier — and no further", () => {
    // BANK_MAX is adjacent to the spike row, so the Fisher looms directly over it. That
    // is only safe because the barrier refuses the hero's move rather than damaging them:
    // a one-row band is still absolutely uncrossable.
    expect(BANK_MAX).toBe(SPIKE_ROW - 1);
    const h = harness([BANK_MAX, 8], [14, 8]);
    expect(h.subs[BANK_MAX][8]).not.toContain(TileSubtype.SPIKES);
    // From the water's edge its spear still reaches the near bank, and a rock from the
    // near bank still reaches it — the duel stays symmetric at the tighter spacing.
    expect(spearLane(h.grid, { y: BANK_MAX, x: 8 }, { y: HERO_SIDE, x: 8 })).not.toBeNull();
    expect(HERO_SIDE - BANK_MAX).toBeLessThanOrEqual(FISHER_SPEAR_RANGE);
  });

  it("retreats to its fishing row — out of rock range — when the hero hangs back", () => {
    const h = harness([BANK_MAX, 8], [23, 8]); // 9 off the bank: beyond FISHER_LURE_RANGE
    h.mem.alerted = true;
    for (let i = 0; i < 12; i++) fisherUpdate(h.ctx);
    expect(h.ctx.enemy.y).toBeLessThanOrEqual(h.mem.fishRow!);
    // From the fishing row it is further than a thrown rock can travel — and the hero
    // can never get closer than HERO_SIDE, since row 13 is spikes. This is only a 1-tile
    // margin, so it's asserted rather than assumed.
    expect(HERO_SIDE - h.ctx.enemy.y).toBeGreaterThan(ROCK_RANGE);
  });

  it("covers FISHER_STRIDE tiles per move turn — it out-paces the hero on purpose", () => {
    const h = harness([BANK_MIN, 2], [14, 20]);
    const startX = h.ctx.enemy.x;
    fisherUpdate(h.ctx);
    expect(h.ctx.enemy.x - startX).toBe(FISHER_STRIDE);
  });

  it("never stalls: given no lane it always finds something to do", () => {
    // Hero parked in the dead gap — inside lure range but beyond spear range, so it can
    // never coil. Every turn must still produce an action (a move or a hurl); the old
    // build parked against the barrier doing literally nothing here.
    const h = harness([BANK_MAX, 8], [18, 8], { snakes: [[10, 3], [11, 18]] });
    for (let i = 0; i < 20; i++) {
      const before = { y: h.ctx.enemy.y, x: h.ctx.enemy.x, hurl: h.mem.lastHurl?.nonce };
      const dmg = fisherUpdate(h.ctx);
      const acted =
        dmg > 0 || // threw and connected
        h.ctx.enemy.y !== before.y ||
        h.ctx.enemy.x !== before.x ||
        h.mem.lastHurl?.nonce !== before.hurl ||
        h.mem.coiled != null ||
        fisherIsStunned(h.mem); // recovering from a throw counts as committed
      expect(acted).toBe(true);
    }
  });

  it("ignores a hero whose torch is out (snuffed = hidden)", () => {
    const h = harness([BRACED, 8], [14, 8]);
    h.ctx.player = { y: 14, x: 8, torchLit: false };
    fisherUpdate(h.ctx);
    expect(fisherCoiledLane(h.mem)).toBeNull();
  });
});

describe("the panic act (wounded past halfway)", () => {
  /** Drop the Fisher's health in the roster copy the behaviour reads. */
  const wound = (h: Harness, hp: number) => {
    h.ctx.enemies[0].health = hp;
  };

  it("refuses to spear even from a perfect lane once wounded", () => {
    const h = harness([BANK_MAX, 8], [14, 8], { snakes: [[10, 8]] });
    // Sanity: at full health this exact setup coils.
    fisherUpdate(h.ctx);
    expect(fisherCoiledLane(h.mem)).not.toBeNull();

    const h2 = harness([BANK_MAX, 8], [14, 8], { snakes: [[10, 8]] });
    wound(h2, FISHER_PANIC_HP);
    fisherUpdate(h2.ctx);
    expect(fisherIsPanicking(h2.mem)).toBe(true);
    expect(fisherCoiledLane(h2.mem)).toBeNull();
  });

  it("throws a BOUNDED burst, faster than normal, then stops", () => {
    // A dozen snakes on its bank must not mean a dozen throws — the act is capped by
    // FISHER_PANIC_HURLS. Unbounded, this deadlocked the fight.
    const h = harness([BANK_MIN, 12], [14, 12], {
      snakes: [[10, 10], [11, 14], [12, 8], [10, 16], [11, 6], [12, 18]],
    });
    wound(h, FISHER_PANIC_HP);
    // Count only throws made DURING the burst. It keeps throwing snakes afterwards whenever
    // it has no spear lane (that's rung 2 of the normal ladder) — those aren't part of the
    // act and must not be conflated with it.
    // Sample the flag AFTER the update: the act's exit check runs at the top of the turn, so
    // a throw on the turn the burst ends is already a normal one.
    let duringBurst = 0;
    let lastNonce: number | undefined;
    for (let i = 0; i < 40; i++) {
      fisherUpdate(h.ctx);
      const nonce = h.mem.lastHurl?.nonce;
      if (nonce !== lastNonce && fisherIsPanicking(h.mem)) duringBurst++;
      lastNonce = nonce;
    }
    expect(h.mem.panicHurls).toBe(FISHER_PANIC_HURLS);
    expect(duringBurst).toBe(FISHER_PANIC_HURLS);
    expect(FISHER_PANIC_HURL_COOLDOWN).toBeLessThan(FISHER_HURL_COOLDOWN);
  });

  it("ends after the burst and comes back to fight, even with snakes to spare", () => {
    // The fix for the standstill: it runs out of ways to avoid the duel.
    const h = harness([BANK_MAX, 8], [14, 8], {
      snakes: [[10, 8], [11, 15], [12, 4], [9, 20], [11, 2], [12, 17]],
    });
    wound(h, FISHER_PANIC_HP);
    let sawPanic = false;
    for (let i = 0; i < 40; i++) {
      fisherUpdate(h.ctx);
      if (fisherIsPanicking(h.mem)) sawPanic = true;
      if (sawPanic && !fisherIsPanicking(h.mem)) break;
    }
    expect(sawPanic).toBe(true);
    expect(fisherIsPanicking(h.mem)).toBe(false);
    // Snakes still on its bank, and it is no longer hiding behind them.
    expect(h.ctx.enemies.some((e) => e.kind === "snake")).toBe(true);
    // Drive on: it must line up and cock a spear again.
    let coiled = false;
    for (let i = 0; i < 12 && !coiled; i++) {
      fisherUpdate(h.ctx);
      if (fisherCoiledLane(h.mem)) coiled = true;
    }
    expect(coiled).toBe(true);
  });

  it("never panics a second time", () => {
    const h = harness([BANK_MAX, 8], [14, 8], { snakes: [[10, 8], [11, 15], [12, 4]] });
    wound(h, FISHER_PANIC_HP);
    for (let i = 0; i < 40; i++) fisherUpdate(h.ctx);
    expect(fisherIsPanicking(h.mem)).toBe(false);
    // Wound it further — still no second burst; the duel is the only option left.
    wound(h, 1);
    for (let i = 0; i < 10; i++) {
      fisherUpdate(h.ctx);
      expect(fisherIsPanicking(h.mem)).toBe(false);
    }
  });

  it("ends early if the bank runs dry mid-burst", () => {
    const h = harness([BANK_MAX, 8], [14, 8], { snakes: [[10, 8]] });
    wound(h, FISHER_PANIC_HP);
    fisherUpdate(h.ctx);
    expect(fisherIsPanicking(h.mem)).toBe(true);
    h.ctx.enemies.splice(1, 1); // last snake gone
    fisherUpdate(h.ctx);
    expect(fisherIsPanicking(h.mem)).toBe(false);
    expect(fisherCoiledLane(h.mem)).not.toBeNull();
  });

  it("NEVER leaves a long stretch where neither side can act", () => {
    // The bug this act shipped with, stated as an invariant. Fetching snakes keeps it on its
    // back rows — out of the hero's rock range — while it also refuses to attack, so an
    // unbounded panic meant nobody could do anything. Across the whole fight it must never
    // go more than a handful of turns both unreachable AND non-threatening.
    const h = harness([BANK_MAX, 8], [14, 8], {
      snakes: [[10, 8], [11, 15], [12, 4], [9, 20], [11, 2], [12, 17]],
    });
    h.ctx.enemies[0].health = FISHER_PANIC_HP;
    let deadTurns = 0;
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      const dmg = fisherUpdate(h.ctx);
      const reachable = HERO_SIDE - h.ctx.enemy.y <= ROCK_RANGE;
      const threatening = dmg > 0 || fisherCoiledLane(h.mem) != null;
      const hurled = h.mem.lastHurl?.nonce === h.mem.turn;
      // A turn counts as "dead" only if the hero can neither hit it nor be pressured by it.
      if (!reachable && !threatening && !hurled) deadTurns++;
      else deadTurns = 0;
      worst = Math.max(worst, deadTurns);
    }
    expect(worst).toBeLessThanOrEqual(FISHER_PANIC_MAX_TURNS);
  });

  it("comes back within rock range shortly after the burst", () => {
    const h = harness([BANK_MIN, 8], [14, 8], {
      snakes: [[10, 8], [11, 15], [12, 4], [9, 20]],
    });
    h.ctx.enemies[0].health = FISHER_PANIC_HP;
    let reachableTurn = -1;
    for (let i = 0; i < 40; i++) {
      fisherUpdate(h.ctx);
      if (!fisherIsPanicking(h.mem) && HERO_SIDE - h.ctx.enemy.y <= ROCK_RANGE) {
        reachableTurn = i;
        break;
      }
    }
    expect(reachableTurn).toBeGreaterThanOrEqual(0);
    expect(reachableTurn).toBeLessThan(20);
  });

  it("cannot deadlock: the act ends even if it can never reach a snake", () => {
    // Snakes exist but are walled off, so the burst can never be completed. The turn
    // ceiling has to end the act anyway — this is the exact shape of the standstill.
    const h = harness([BANK_MAX, 8], [14, 8], { snakes: [[9, 22]] });
    for (let y = BANK_MIN; y <= BANK_MAX; y++) h.grid[y][20] = TREE;
    wound(h, FISHER_PANIC_HP);
    for (let i = 0; i <= FISHER_PANIC_MAX_TURNS + 2; i++) fisherUpdate(h.ctx);
    expect(fisherIsPanicking(h.mem)).toBe(false);
  });

  it("does not panic while still above the threshold", () => {
    const h = harness([BANK_MAX, 8], [14, 8], { snakes: [[10, 8]] });
    wound(h, FISHER_PANIC_HP + 1);
    fisherUpdate(h.ctx);
    expect(fisherIsPanicking(h.mem)).toBe(false);
    expect(fisherCoiledLane(h.mem)).not.toBeNull();
  });
});

describe("the barrier holds in both directions", () => {
  it("a hurled snake cannot slither back across the spikes", () => {
    // Spikes are a FLOOR overlay, so a base-grid-only walkability check would wave a
    // snake straight over them. Drive a landed snake hard toward the boss's side and
    // assert it never gets onto — or past — the band.
    const h = harness([6, 8], [16, 8], { snakes: [[15, 8]] });
    const snakeMem = h.ctx.enemies[1].behaviorMemory!;
    const snakeCtx: BehaviorContext = {
      ...h.ctx,
      enemyIndex: 1,
      // Hero placed NORTH of the snake so "flee the hero" pushes it at the barrier.
      player: { y: 18, x: 8, torchLit: true },
      playerNext: { y: 18, x: 8 },
      enemy: { y: 15, x: 8, facing: "UP", memory: snakeMem, attack: 1 },
    };
    for (let i = 0; i < 60; i++) {
      EnemyRegistry.snake.behavior!.customUpdate!(snakeCtx);
      expect(h.subs[snakeCtx.enemy.y][snakeCtx.enemy.x]).not.toContain(TileSubtype.SPIKES);
      expect(snakeCtx.enemy.y).toBeGreaterThan(13); // never reached the far bank
    }
  });
});

describe("snake hurling", () => {
  it("picks landings on the hero's side, never adjacent and never on the hero", () => {
    const h = harness([10, 8], [18, 8]);
    for (let i = 0; i < 40; i++) {
      const spot = pickHurlLanding(h.ctx, h.mem, { y: 18, x: 8 }, h.ctx.rng!);
      expect(spot).not.toBeNull();
      const [y, x] = spot!;
      const d = Math.abs(y - 18) + Math.abs(x - 8);
      expect(d).toBeGreaterThanOrEqual(FISHER_HURL_MIN);
      expect(d).toBeLessThanOrEqual(FISHER_HURL_MAX);
      expect(y).toBeGreaterThanOrEqual(h.mem.heroSideMinY!);
      expect(h.subs[y][x]).not.toContain(TileSubtype.SPIKES);
    }
  });

  it("snatches a snake from a distance — it does not need to stand on one", () => {
    // Requiring exact adjacency is why hurling never fired in playtest: snakes flee, so
    // one was essentially never in the Fisher's next step tile.
    const h = harness([10, 8], [15, 12], { snakes: [[10, 8 + FISHER_NECK_REACH]] });
    const before = { y: h.ctx.enemy.y, x: h.ctx.enemy.x };
    fisherUpdate(h.ctx);
    const snakeMem = h.ctx.enemies[1].behaviorMemory as Record<string, unknown>;
    expect(snakeMem.fisherHurl).toBeDefined();
    // It spent the turn throwing, not walking.
    expect({ y: h.ctx.enemy.y, x: h.ctx.enemy.x }).toEqual(before);
  });

  it("WALKS ACROSS THE BANK to reach a snake when it has no shot", () => {
    // The heart of the fix. Hero tucked behind cover on the Fisher's own line (so
    // repositioning is pointless) with a snake far away: it must go fetch, not idle.
    const h = harness([10, 20], [10, 8], { snakes: [[11, 3]] });
    h.grid[10][12] = TREE; // blocks the lane along its row
    const startDist = Math.abs(10 - 11) + Math.abs(20 - 3);
    fisherUpdate(h.ctx);
    const nowDist =
      Math.abs(h.ctx.enemy.y - 11) + Math.abs(h.ctx.enemy.x - 3);
    expect(nowDist).toBeLessThan(startDist);
  });

  it("refusing it a shot converts the fight into a steady snake barrage", () => {
    // Hero behind hard cover, so no lane can ever open. Distance no longer denies the shot
    // (the spear is unlimited) — only cover does, which is exactly why the trees matter.
    // Every one of those turns must then be spent arming and throwing snakes. This is the
    // "it should matter what I'm doing" property: refusing it a spear is not free, it just
    // changes which weapon you hand it.
    const h = harness([BANK_MIN, 12], [19, 5], {
      snakes: [[10, 9], [11, 15], [12, 7]],
    });
    // Wall off the hero's column and row on the Fisher's side of them.
    for (let y = SPIKE_ROW + 1; y < 19; y++) h.grid[y][5] = TREE;
    for (let x = 1; x < N - 1; x++) if (x !== 5) h.grid[19][x] = TREE;
    expect(spearLane(h.grid, { y: BANK_MAX, x: 5 }, { y: 19, x: 5 })).toBeNull();
    const hurls = new Set<number>();
    for (let i = 0; i < 40; i++) {
      fisherUpdate(h.ctx);
      if (h.mem.lastHurl) hurls.add(h.mem.lastHurl.nonce);
    }
    // Cooldown-limited to one every FISHER_HURL_COOLDOWN turns, so expect a stream of
    // them rather than the one-or-none the old adjacency rule produced.
    expect(hurls.size).toBeGreaterThanOrEqual(5);
  });

  it("prefers the spear over a snake when it does have a shot", () => {
    // Ordering matters: with a snake in reach AND the hero on a clear lane, the spear
    // wins — otherwise it would never attack while any snake was nearby.
    const h = harness([BANK_MAX, 8], [14, 8], { snakes: [[BANK_MAX, 9]] });
    fisherUpdate(h.ctx);
    expect(fisherCoiledLane(h.mem)).not.toBeNull();
    expect(
      (h.ctx.enemies[1].behaviorMemory as Record<string, unknown>).fisherHurl
    ).toBeUndefined();
  });

  it("the snake's own tick carries out the flight order and lands it", () => {
    const h = harness([10, 8], [15, 12], { snakes: [[10, 9]] });
    fisherUpdate(h.ctx);
    const order = (h.ctx.enemies[1].behaviorMemory as Record<string, unknown>)
      .fisherHurl as { y: number; x: number };
    expect(order).toBeDefined();

    // Now run the snake's registry behavior with the context pointed at IT.
    const snakeCtx: BehaviorContext = {
      ...h.ctx,
      enemyIndex: 1,
      enemy: {
        y: 10,
        x: 9,
        facing: "DOWN",
        memory: h.ctx.enemies[1].behaviorMemory!,
        attack: 1,
      },
    };
    const dmg = EnemyRegistry.snake.behavior!.customUpdate!(snakeCtx);
    expect(dmg).toBe(0); // landing costs the whole turn — no free bite
    expect(snakeCtx.enemy.y).toBe(order.y);
    expect(snakeCtx.enemy.x).toBe(order.x);
    expect(snakeCtx.enemy.y).toBeGreaterThanOrEqual(14); // cleared the spikes
    // The order is consumed, so it doesn't teleport again next turn.
    expect(
      (h.ctx.enemies[1].behaviorMemory as Record<string, unknown>).fisherHurl
    ).toBeUndefined();

    // It leaves a flight record naming BOTH ends. The render layer keys the tumbling-arc
    // animation off an exact from/to match — without this the snake blinks onto the near
    // bank and the throw is invisible, which is what made it unreadable in playtest.
    const flight = (h.ctx.enemies[1].behaviorMemory as Record<string, unknown>)
      .lastFlight as { from: [number, number]; to: [number, number] };
    expect(flight).toBeDefined();
    expect(flight.from).toEqual([10, 9]);
    expect(flight.to).toEqual([order.y, order.x]);
    // Always a multi-tile flight — it has to clear the barrier — so the arc always fires.
    const spanned =
      Math.abs(flight.to[0] - flight.from[0]) + Math.abs(flight.to[1] - flight.from[1]);
    expect(spanned).toBeGreaterThan(1);
  });

  it("respects the hurl cooldown", () => {
    const h = harness([10, 8], [15, 12], { snakes: [[10, 9], [11, 8]] });
    fisherUpdate(h.ctx); // hurls
    expect(h.mem.hurlCooldown).toBeGreaterThan(0);
    const firstOrder = (h.ctx.enemies[1].behaviorMemory as Record<string, unknown>)
      .fisherHurl;
    expect(firstOrder).toBeDefined();
    // Second snake must not go over on the very next turn.
    fisherUpdate(h.ctx);
    expect(
      (h.ctx.enemies[2].behaviorMemory as Record<string, unknown>).fisherHurl
    ).toBeUndefined();
  });
});
