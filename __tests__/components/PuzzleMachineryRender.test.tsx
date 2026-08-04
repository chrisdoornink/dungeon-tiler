import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Tile } from "../../components/Tile";
import MobileControls from "../../components/MobileControls";
import { TileSubtype } from "../../lib/map";
import { PLATFORM_SLIDE } from "../../lib/smooth_movement";

/**
 * These exist because of a specific failure, not for coverage.
 *
 * The slab was moved out of the tile's background so it could be animated, and the replacement
 * overlay element was never actually added — so for a whole round of "fixed it" the platform had NO
 * visual at all, and what looked like the slab moving instantly was really the gap it left in the
 * rail decal. Typecheck and 1264 logic tests all passed, because none of them looked at what the
 * tile renders. So: assert the element exists, and assert the delay that makes the turn order
 * legible is really on it.
 */

const FLOOR_TYPE = { id: 0, name: "floor", color: "#ccc", walkable: true };

describe("moving platform rendering", () => {
  it("renders a slab element for a MOVING_PLATFORM tile", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.PLATFORM_TRACK, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
      />
    );
    expect(
      screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`)
    ).toBeInTheDocument();
  });

  it("hides the rail decal under the slab and shows it everywhere else", () => {
    const { rerender } = render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.PLATFORM_TRACK, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
      />
    );
    expect(
      screen.queryByTestId(`subtype-icon-${TileSubtype.PLATFORM_TRACK}`)
    ).not.toBeInTheDocument();

    rerender(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.PLATFORM_TRACK]}
        isVisible={true}
      />
    );
    expect(
      screen.getByTestId(`subtype-icon-${TileSubtype.PLATFORM_TRACK}`)
    ).toBeInTheDocument();
  });

  it("puts a DELAYED slide on the slab when it arrived this turn", () => {
    // The delay is the whole fix for the ordering being unreadable. If this assertion goes, the
    // platform is back to moving in the same frame as the hero.
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
        platformStep={{
          dy: 0,
          dx: -1,
          dur: PLATFORM_SLIDE.durMs,
          ease: "ease-in-out",
          seq: 1,
          delay: PLATFORM_SLIDE.delayMs,
        }}
      />
    );
    const slab = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    const animation = slab.style.animation;
    expect(animation).toContain("smoothStepSlide");
    expect(animation).toContain(`${PLATFORM_SLIDE.durMs}ms`);
    expect(animation).toContain(`${PLATFORM_SLIDE.delayMs}ms`);
    // `both` fill is load-bearing with a delay: without it the slab sits at its destination during
    // the delay and then jumps back to animate, which is the opposite of a delayed slide.
    expect(animation).toContain("both");
    // Starts one tile back toward where it came from.
    expect(slab.style.getPropertyValue("--smooth-step-from")).toContain("translate(-40px");
  });

  it("carries no animation when the slab did not move", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
      />
    );
    const slab = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    expect(slab.style.animation).toBe("");
  });

  it("renders a toggle switch distinctly from a latching plate", () => {
    const { rerender } = render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.TOGGLE_SWITCH]}
        isVisible={true}
      />
    );
    const toggle = screen.getByTestId(`subtype-icon-${TileSubtype.TOGGLE_SWITCH}`);
    expect(toggle).toBeInTheDocument();

    rerender(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.PRESSURE_PLATE]}
        isVisible={true}
      />
    );
    // Different elements, so the two can never be confused for one another on screen.
    expect(
      screen.queryByTestId(`subtype-icon-${TileSubtype.TOGGLE_SWITCH}`)
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`subtype-icon-${TileSubtype.PRESSURE_PLATE}`)
    ).toBeInTheDocument();
  });
});

describe("wait control", () => {
  it("puts a wait button in BOTH top corners of the dpad", () => {
    // Two, in the corners, because a single button beside the pad can sit off a narrow screen with
    // no hint it exists — which is exactly what happened to the first version.
    const onWait = jest.fn();
    render(<MobileControls onMove={() => {}} onWait={onWait} />);
    expect(screen.getByTestId("mobile-control-wait-left")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-control-wait-right")).toBeInTheDocument();
  });

  it("sizes itself off the grid cell rather than a fixed height", () => {
    // The first version hard-coded h-14, which rendered oversized and off-centre on desktop, whose
    // direction keys are h-9.
    render(<MobileControls onMove={() => {}} onWait={() => {}} />);
    for (const side of ["left", "right"]) {
      const btn = screen.getByTestId(`mobile-control-wait-${side}`);
      expect(btn.className).toContain("h-full");
      expect(btn.className).toContain("w-full");
      // Borderless, like the drag grabber — it is a secondary control.
      expect(btn.className).not.toContain("border");
    }
  });

  it("renders nothing when the map has no use for waiting", () => {
    render(<MobileControls onMove={() => {}} />);
    expect(screen.queryByTestId("mobile-control-wait-left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-control-wait-right")).not.toBeInTheDocument();
  });

  it("fires on press", () => {
    const onWait = jest.fn();
    render(<MobileControls onMove={() => {}} onWait={onWait} />);
    const btn = screen.getByTestId("mobile-control-wait-left");
    // jsdom has no PointerEvent constructor; a bubbling Event with the right type still runs
    // React's onPointerDown handler, which is all this needs to assert.
    btn.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    expect(onWait).toHaveBeenCalledTimes(1);
  });
});

describe("slide direction symmetry", () => {
  /**
   * The slab is drawn in its DESTINATION tile and translated back toward where it came from, so
   * mid-slide it overhangs a neighbour. `.fov-tier-1/-2` put `filter: brightness()` on every tile,
   * which makes each tile its own stacking context — so a z-index on the slab element cannot paint
   * outside its parent, and tiles just resolve in DOM order. That made DOWNWARD slides look right
   * (destination is later in the DOM) while UPWARD ones stayed hidden until they crossed their own
   * border. The fix lifts the whole TILE, so these assert the tile is lifted in both directions.
   */
  const renderSliding = (dy: number) =>
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
        platformStep={{
          dy,
          dx: 0,
          dur: PLATFORM_SLIDE.durMs,
          ease: "ease-in-out",
          seq: 1,
          delay: PLATFORM_SLIDE.delayMs,
        }}
      />
    );

  it("lifts the tile for an UPWARD slide (dy = +1, overhang below)", () => {
    renderSliding(1);
    const tile = screen.getByTestId("tile-0");
    expect(tile.style.zIndex).not.toBe("");
    expect(Number(tile.style.zIndex)).toBeGreaterThan(0);
    const slab = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    expect(slab.style.getPropertyValue("--smooth-step-from")).toContain("40px");
  });

  it("lifts the tile for a DOWNWARD slide too", () => {
    renderSliding(-1);
    const tile = screen.getByTestId("tile-0");
    expect(Number(tile.style.zIndex)).toBeGreaterThan(0);
    const slab = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    expect(slab.style.getPropertyValue("--smooth-step-from")).toContain("-40px");
  });

  it("does not lift a tile whose slab is standing still", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
      />
    );
    expect(screen.getByTestId("tile-0").style.zIndex).toBe("");
  });
});
