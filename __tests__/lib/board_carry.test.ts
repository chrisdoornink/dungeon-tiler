import { planBoardCarry } from "../../lib/smooth_movement";
import { Direction } from "../../lib/map";

/**
 * Boarding a moving platform is a single turn that moves the hero TWO tiles — a step onto the deck,
 * then a carry as the platform advances. Animated as one tween it read as a snap-to-final-tile
 * followed by the deck sliding under a stationary hero. planBoardCarry is the pure decision that
 * splits that move into a walk (to the returned `stepped` tile) and a ride (the carry). These lock
 * the geometry, since the two-phase animation itself can't be frame-sampled reliably in a browser.
 */
describe("planBoardCarry", () => {
  it("splits a downward board-and-carry into walk then ride", () => {
    // Hero at (1,5) steps DOWN onto the deck at (2,5); the platform then carries him to (3,5).
    const plan = planBoardCarry({
      from: [1, 5],
      after: [3, 5],
      direction: Direction.DOWN,
      endedOnPlatform: true,
    });
    expect(plan).not.toBeNull();
    // The walk ends on the tile he actually stepped onto — the platform carry is the second phase.
    expect(plan!.stepped).toEqual([2, 5]);
  });

  it("handles a horizontal rail: walk down on, carried sideways", () => {
    // Steps DOWN onto a deck tile, then the platform carries him RIGHT — an L-shaped path that a
    // single linear tween would cut diagonally across the corner.
    const plan = planBoardCarry({
      from: [1, 4],
      after: [2, 5],
      direction: Direction.DOWN,
      endedOnPlatform: true,
    });
    expect(plan).not.toBeNull();
    expect(plan!.stepped).toEqual([2, 4]);
  });

  it("tolerates a fractional visual start (mid-glide) by rounding", () => {
    const plan = planBoardCarry({
      from: [0.97, 5.02],
      after: [3, 5],
      direction: Direction.DOWN,
      endedOnPlatform: true,
    });
    expect(plan!.stepped).toEqual([2, 5]);
  });

  it("returns null for an ordinary one-tile step onto a platform (no carry)", () => {
    // Boarded a PARKED platform: net move is one tile, so there is nothing to split.
    const plan = planBoardCarry({
      from: [1, 5],
      after: [2, 5],
      direction: Direction.DOWN,
      endedOnPlatform: true,
    });
    expect(plan).toBeNull();
  });

  it("returns null when the hero did not end on a platform", () => {
    // A two-tile move that is NOT a platform carry (e.g. a portal/warp) must still snap, not be
    // mistaken for boarding.
    const plan = planBoardCarry({
      from: [1, 5],
      after: [3, 5],
      direction: Direction.DOWN,
      endedOnPlatform: false,
    });
    expect(plan).toBeNull();
  });

  it("returns null for a long teleport even onto a platform tile", () => {
    // Net move of 4 tiles: not a step-plus-carry, so it is not a board-carry.
    const plan = planBoardCarry({
      from: [1, 5],
      after: [5, 5],
      direction: Direction.DOWN,
      endedOnPlatform: true,
    });
    expect(plan).toBeNull();
  });

  it("works in every direction", () => {
    expect(
      planBoardCarry({ from: [5, 5], after: [3, 5], direction: Direction.UP, endedOnPlatform: true })!
        .stepped
    ).toEqual([4, 5]);
    expect(
      planBoardCarry({ from: [5, 5], after: [5, 3], direction: Direction.LEFT, endedOnPlatform: true })!
        .stepped
    ).toEqual([5, 4]);
    expect(
      planBoardCarry({ from: [5, 5], after: [5, 7], direction: Direction.RIGHT, endedOnPlatform: true })!
        .stepped
    ).toEqual([5, 6]);
  });
});
