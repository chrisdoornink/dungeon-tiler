import { Enemy, updateEnemies } from "../../lib/enemy";
import {
  SNAKE_DARK_SENSE_RADIUS,
  SNAKE_RILED_TTL,
} from "../../lib/enemies/registry";
import { TileSubtype, Direction } from "../../lib/map";
import { movePlayer } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";

// Snakes invert torch-snuff stealth: a lit torch keeps them aloof, a doused one
// turns them into heat-seeking hunters. See the SNAKE_DARK_* constants.

const openGrid = (h: number, w = h) =>
  Array.from({ length: h }, () => Array(w).fill(0));
const emptySubs = (h: number, w = h) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => [] as number[]));

function makeSnake(y: number, x: number): Enemy {
  const s = new Enemy({ y, x });
  s.kind = "snake";
  return s;
}

/** One enemy tick. `rng` defaults to a mid value so pursuit ordering is stable. */
function tick(
  tiles: number[][],
  subs: number[][][],
  enemies: Enemy[],
  player: { y: number; x: number },
  torchLit: boolean,
  rng: () => number = () => 0.5
) {
  return updateEnemies(tiles, subs, enemies, player, {
    rng,
    playerTorchLit: torchLit,
  });
}

const dist = (e: Enemy, p: { y: number; x: number }) =>
  Math.abs(e.y - p.y) + Math.abs(e.x - p.x);

function baseState(
  tiles: number[][],
  subtypes: number[][][],
  overrides: Partial<GameState> = {}
): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: { tiles, subtypes },
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    enemies: [],
    npcs: [],
    rockCount: 0,
    runeCount: 0,
    bombCount: 0,
    heroTorchLit: true,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

describe("Snake torch aggression", () => {
  describe("torch out: snakes hunt", () => {
    test("closes the distance every single turn", () => {
      const tiles = openGrid(11);
      const subs = emptySubs(11);
      const player = { y: 5, x: 5 };
      const snake = makeSnake(5, 9); // 4 tiles away, well inside sense range

      let prev = dist(snake, player);
      // Walk it in until adjacent; a hunter must never lose ground.
      for (let i = 0; i < 3; i++) {
        tick(tiles, subs, [snake], player, false);
        const now = dist(snake, player);
        expect(now).toBe(prev - 1);
        prev = now;
      }
      expect(prev).toBe(1);
    });

    test("bites an adjacent hero — a doused hero is not safe nose-to-nose", () => {
      const tiles = openGrid(7);
      const subs = emptySubs(7);
      const player = { y: 3, x: 3 };
      const snake = makeSnake(3, 4);

      const result = tick(tiles, subs, [snake], player, false);

      expect(result.damage).toBeGreaterThan(0);
      expect(result.attackingEnemies.map((a) => a.kind)).toContain("snake");
    });

    test("senses through walls (heat, not line of sight)", () => {
      // Wall column between snake and hero, with no gap on this row.
      const tiles = openGrid(9);
      for (let y = 0; y < 9; y++) tiles[y][4] = 1;
      tiles[8][4] = 0; // a way around, far to the south
      const subs = emptySubs(9);
      const player = { y: 2, x: 2 };
      const snake = makeSnake(2, 6);

      // No line of sight at all, yet it commits toward the hero.
      const before = dist(snake, player);
      tick(tiles, subs, [snake], player, false);
      expect(dist(snake, player)).toBeLessThan(before);
      expect(snake.behaviorMemory.hunting).toBe(true);
    });

    test("ignores a hero beyond the sense radius", () => {
      const width = SNAKE_DARK_SENSE_RADIUS + 6;
      const tiles = openGrid(3, width);
      const subs = emptySubs(3, width);
      const player = { y: 1, x: 0 };
      // One tile past the edge of its heat sense.
      const snake = makeSnake(1, SNAKE_DARK_SENSE_RADIUS + 1);

      tick(tiles, subs, [snake], player, false);

      expect(snake.behaviorMemory.hunting).toBe(false);
      // Never sensed the hero, so it has no target to remember.
      expect(snake.behaviorMemory.lastSensed).toBeUndefined();
    });

    test("still refuses deep water and lava while hunting", () => {
      const tiles = openGrid(5, 7);
      const subs = emptySubs(5, 7);
      const player = { y: 2, x: 0 };
      const snake = makeSnake(2, 4);
      // Wall off the detour rows so the only path to the hero is the flooded/
      // molten tile directly between them.
      for (let x = 0; x < 7; x++) {
        tiles[1][x] = 1;
        tiles[3][x] = 1;
      }
      subs[2][3] = [TileSubtype.DEEP_WATER];

      tick(tiles, subs, [snake], player, false);
      expect([snake.y, snake.x]).toEqual([2, 4]); // held, did not swim

      subs[2][3] = [TileSubtype.LAVA];
      tick(tiles, subs, [snake], player, false);
      expect([snake.y, snake.x]).toEqual([2, 4]); // held, did not burn
    });
  });

  describe("torch lit: snakes stay aloof", () => {
    test("mostly slinks away from a lit hero", () => {
      const tiles = openGrid(11);
      const subs = emptySubs(11);
      const player = { y: 5, x: 5 };
      const snake = makeSnake(5, 7);

      // rng above the approach chance => it retreats.
      tick(tiles, subs, [snake], player, true, () => 0.9);
      expect(dist(snake, player)).toBe(3);
    });

    test("does not beeline the way a hunting snake does", () => {
      const tiles = openGrid(11);
      const subs = emptySubs(11);
      const player = { y: 5, x: 5 };
      const lit = makeSnake(5, 9);
      const dark = makeSnake(9, 5);

      // Same rng stream for both; only the torch differs.
      for (let i = 0; i < 3; i++) {
        tick(tiles, subs, [lit], player, true, () => 0.9);
        tick(tiles, subs, [dark], player, false, () => 0.9);
      }

      expect(dist(dark, player)).toBe(1); // hunted the whole way in
      expect(dist(lit, player)).toBeGreaterThan(4); // kept its distance
      expect(lit.behaviorMemory.hunting).toBe(false);
    });

    test("a lit hero is still bitten if the snake ends up adjacent", () => {
      const tiles = openGrid(7);
      const subs = emptySubs(7);
      const player = { y: 3, x: 3 };
      const snake = makeSnake(3, 4);

      const result = tick(tiles, subs, [snake], player, true);
      expect(result.damage).toBeGreaterThan(0);
    });
  });

  describe("riled memory after a relight", () => {
    test("keeps hunting the last sensed spot, then gives up", () => {
      const tiles = openGrid(11);
      const subs = emptySubs(11);
      const player = { y: 5, x: 5 };
      const snake = makeSnake(5, 10);

      // Lock on in the dark.
      tick(tiles, subs, [snake], player, false);
      expect(snake.behaviorMemory.hunting).toBe(true);
      expect(snake.behaviorMemory.riledTtl).toBe(SNAKE_RILED_TTL);
      expect(snake.behaviorMemory.lastSensed).toEqual({ y: 5, x: 5 });

      // Relight: the snake stays riled for a few turns rather than resetting.
      for (let i = 1; i <= SNAKE_RILED_TTL; i++) {
        tick(tiles, subs, [snake], player, true, () => 0.9);
        expect(snake.behaviorMemory.riledTtl).toBe(SNAKE_RILED_TTL - i);
      }

      // Memory spent: back to aloof, and the stale target is cleared.
      expect(snake.behaviorMemory.hunting).toBe(false);
      expect(snake.behaviorMemory.lastSensed).toBeUndefined();
    });

    test("chases the last sensed tile, not the hero's live position", () => {
      const tiles = openGrid(11);
      const subs = emptySubs(11);
      const snake = makeSnake(0, 0);

      // Sense the hero at the top-left, then relight and move him far away.
      tick(tiles, subs, [snake], { y: 0, x: 4 }, false);
      expect(snake.behaviorMemory.lastSensed).toEqual({ y: 0, x: 4 });

      const moved = { y: 10, x: 0 }; // straight down, opposite axis
      tick(tiles, subs, [snake], moved, true, () => 0.9);

      // It committed along the remembered heading (+x), ignoring where he
      // actually went (+y) — so relighting really does break contact.
      expect(snake.y).toBe(0);
      expect(snake.x).toBeGreaterThan(0);
    });
  });

  test("end to end: a snuffed hero walking past a snake is bitten and poisoned", () => {
    const tiles = openGrid(7);
    const subs = emptySubs(7);
    subs[3][1] = [TileSubtype.PLAYER];
    const snake = makeSnake(3, 3);
    const state = baseState(tiles, subs, {
      enemies: [snake],
      heroTorchLit: false, // e.g. just been snuffed by a ghost
      combatRng: () => 0.5,
    });

    // Step toward the snake; it hunts, closes, and bites.
    let next = movePlayer(state, Direction.RIGHT);
    for (let i = 0; i < 3 && !next.conditions?.poisoned?.active; i++) {
      next = movePlayer(next, Direction.RIGHT);
    }

    expect(next.heroHealth).toBeLessThan(5);
    expect(next.conditions?.poisoned?.active).toBe(true);
  });
});
