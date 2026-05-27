import { orderPursuitSteps } from "../../lib/enemies/pursuit";
import { Enemy, EnemyState } from "../../lib/enemy";

// Fully open NxN floor so line-of-sight is always clear and any axis step is walkable.
const openGrid = (n = 9) =>
  Array.from({ length: n }, () => Array(n).fill(0)) as number[][];

describe("orderPursuitSteps", () => {
  test("returns a single step when already aligned on one axis", () => {
    expect(orderPursuitSteps(0, -3)).toEqual([[0, -1]]); // same row -> horizontal only
    expect(orderPursuitSteps(4, 0)).toEqual([[1, 0]]); // same column -> vertical only
    expect(orderPursuitSteps(0, 0)).toEqual([]); // same tile -> nothing
  });

  test("diagonal: favors the larger-gap (dominant) axis when the roll is low", () => {
    // dy = -6 (big vertical gap), dx = +1 (small horizontal gap) -> dominant is vertical
    const moves = orderPursuitSteps(-6, 1, () => 0);
    expect(moves[0]).toEqual([-1, 0]); // vertical first -- the OLD code always went horizontal here
    expect(moves[1]).toEqual([0, 1]);
  });

  test("diagonal: still chooses the minor axis some of the time (high roll)", () => {
    const moves = orderPursuitSteps(-6, 1, () => 0.999);
    expect(moves[0]).toEqual([0, 1]); // horizontal (minor) first -- keeps it unpredictable
    expect(moves[1]).toEqual([-1, 0]);
  });

  test("equal gaps are a true 50/50 coin flip", () => {
    // dx === dy: probability of dominant-first is exactly 0.5
    expect(orderPursuitSteps(3, 3, () => 0.49)[0]).toEqual([0, 1]); // < 0.5 -> X first
    expect(orderPursuitSteps(3, 3, () => 0.5)[0]).toEqual([1, 0]); // >= 0.5 -> Y first
  });

  test("extreme gap still leaves the minor axis a real (~15%) chance", () => {
    // share -> ~1, pDominant capped near 0.85, so a roll just under 1.0 picks the minor axis
    const moves = orderPursuitSteps(20, 1, () => 0.86);
    expect(moves[0]).toEqual([0, 1]); // horizontal (minor) first despite huge vertical gap
  });
});

describe("Enemy diagonal pursuit (default goblin)", () => {
  test("can step VERTICALLY first toward a player that is mostly below it", () => {
    const grid = openGrid();
    const player = { y: 2, x: 1 };
    const enemy = new Enemy({ y: 7, x: 2 }); // dy = -5, dx = -1 -> dominant vertical

    enemy.update({ grid, player, rng: () => 0 }); // low roll -> dominant (vertical) first

    expect(enemy.y).toBe(6); // moved up toward the player
    expect(enemy.x).toBe(2); // did NOT close the column first (old behavior)
    expect(enemy.state).toBe(EnemyState.HUNTING);
  });

  test("can still step HORIZONTALLY first on a high roll (unpredictable)", () => {
    const grid = openGrid();
    const player = { y: 2, x: 1 };
    const enemy = new Enemy({ y: 7, x: 2 });

    enemy.update({ grid, player, rng: () => 0.999 }); // high roll -> minor (horizontal) first

    expect(enemy.y).toBe(7);
    expect(enemy.x).toBe(1);
  });
});
