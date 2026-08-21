import { updateFollowBehavior } from "../../lib/npc_behaviors";
import { NPC } from "../../lib/npc";
import { Direction, FLOOR, WALL } from "../../lib/map";

function makeFollower(
  id: string,
  y: number,
  x: number,
  followOrder: number,
  extraMetadata: Record<string, unknown> = {}
): NPC {
  return new NPC({
    id,
    name: id,
    sprite: "/images/family/test.png",
    y,
    x,
    facing: Direction.DOWN,
    canMove: true,
    metadata: { behavior: "follow", followOrder, ...extraMetadata },
  });
}

function makeGrid(size = 6): number[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => FLOOR)
  );
}

function ctx(npc: NPC, npcs: NPC[], grid: number[][], player = { y: 5, x: 1 }) {
  return { npc, grid, subtypes: undefined, player, npcs, enemies: [] };
}

describe("updateFollowBehavior", () => {
  it("steps toward the player and turns to face the step", () => {
    const a = makeFollower("a", 1, 1, 0, {
      directionalSprites: { back: "b.png", side: "s.png" },
    });
    const result = updateFollowBehavior(ctx(a, [a], makeGrid()));
    expect(result.moved).toBe(true);
    expect([a.y, a.x]).toEqual([2, 1]);
    expect(a.facing).toBe(Direction.DOWN);
  });

  it("holds position once adjacent to its leader", () => {
    const a = makeFollower("a", 4, 1, 0);
    const result = updateFollowBehavior(ctx(a, [a], makeGrid()));
    expect(result.moved).toBe(false);
    expect([a.y, a.x]).toEqual([4, 1]);
  });

  it("chains: later followers trail the one ahead, not the player", () => {
    const a = makeFollower("a", 4, 1, 0); // adjacent to player already
    const b = makeFollower("b", 4, 4, 1);
    const result = updateFollowBehavior(ctx(b, [a, b], makeGrid()));
    expect(result.moved).toBe(true);
    // Steps toward a at (4,1), not the player at (5,1).
    expect([b.y, b.x]).toEqual([4, 3]);
  });

  it("routes around walls via the other axis", () => {
    const grid = makeGrid();
    grid[2][1] = WALL; // block the straight path down
    const a = makeFollower("a", 1, 1, 0);
    const result = updateFollowBehavior(ctx(a, [a], grid, { y: 5, x: 2 }));
    expect(result.moved).toBe(true);
    expect([a.y, a.x]).toEqual([1, 2]); // sidestep instead
  });

  it("never steps onto the player or another NPC", () => {
    const blocker = makeFollower("blocker", 3, 1, 5);
    const a = makeFollower("a", 2, 1, 0);
    // Straight down is blocked by an NPC; a's column is also the player's, so
    // the only legal step is sideways or nothing — verify no overlap happens.
    const result = updateFollowBehavior(ctx(a, [a, blocker], makeGrid()));
    const landed = [a.y, a.x].join(",");
    expect(landed).not.toBe("3,1");
    expect(landed).not.toBe("5,1");
    expect(result.moved).toBe(false);
  });
});
