import React from "react";
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Tile } from "../../components/Tile";
import MobileControls from "../../components/MobileControls";
import { TilemapGrid } from "../../components/TilemapGrid";
import { parsePuzzleRoom, PUZZLE_ROOMS } from "../../lib/puzzles/rooms";
import type { GameState } from "../../lib/map/game-state";
import { TileSubtype } from "../../lib/map";
import { PLATFORM_SLIDE } from "../../lib/smooth_movement";
import { TOGGLE_STATE_COLORS, toggleStateColor } from "../../lib/map/machinery";

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
  it("draws the deck ONCE, on its anchor tile, sized to its whole length", () => {
    // One element for the whole deck. The per-tile version had each slab translate itself backwards
    // to fake a slide, which is what produced direction-dependent flicker and visible seams.
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.PLATFORM_TRACK, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
        deck={{ length: 3, axis: "col" }}
      />
    );
    const el = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("data-deck-length")).toBe("3");
    expect(el.style.height).toContain("* 3");
  });

  it("draws no deck on a covered tile that is not the anchor", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
      />
    );
    expect(
      screen.queryByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`)
    ).not.toBeInTheDocument();
  });

  it("grows rightward on a horizontal rail", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.DEEP_WATER, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
        deck={{ length: 2, axis: "row" }}
      />
    );
    const el = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    expect(el.style.width).toContain("* 2");
    expect(el.getAttribute("data-deck-axis")).toBe("row");
  });

  it("never draws the rail decal — the path hashes were removed by request", () => {
    // The track stays in the data model but is no longer rendered on the tiles; the deck's magic
    // glow is the only in-world signal now. Assert the decal is absent whether or not the deck
    // covers the tile.
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
      screen.queryByTestId(`subtype-icon-${TileSubtype.PLATFORM_TRACK}`)
    ).not.toBeInTheDocument();
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
        deck={{
          length: 1,
          axis: "col",
          step: {
            dy: 0,
            dx: -1,
            dur: PLATFORM_SLIDE.durMs,
            ease: "ease-in-out",
            seq: 1,
            delay: PLATFORM_SLIDE.delayMs,
          },
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

  it("carries no animation when the deck did not move", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
        deck={{ length: 1, axis: "col" }}
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
   * The old fix for upward slides lifted the whole TILE, which trapped the hero's z-index inside it
   * and drew riders over walls that should occlude them. A single deck element needs no lift at all:
   * it carries one z-index (1025 — above a lava or water tile's own 1020 overlay, below items,
   * enemies, the hero and walls), so both directions behave the same by construction.
   */
  const renderSliding = (dy: number) =>
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.LAVA, TileSubtype.MOVING_PLATFORM]}
        isVisible={true}
        deck={{
          length: 2,
          axis: "col",
          step: {
            dy,
            dx: 0,
            dur: PLATFORM_SLIDE.durMs,
            ease: "ease-in-out",
            seq: 1,
            delay: PLATFORM_SLIDE.delayMs,
          },
        }}
      />
    );

  it("animates an UPWARD slide from below", () => {
    renderSliding(1);
    const el = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    expect(el.style.getPropertyValue("--smooth-step-from")).toContain("40px");
    expect(el.style.animation).toContain(`${PLATFORM_SLIDE.delayMs}ms`);
  });

  it("animates a DOWNWARD slide from above, identically", () => {
    renderSliding(-1);
    const el = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    expect(el.style.getPropertyValue("--smooth-step-from")).toContain("-40px");
    expect(el.style.animation).toContain(`${PLATFORM_SLIDE.delayMs}ms`);
  });

  it("never lifts the tile, so walls still occlude a rider", () => {
    renderSliding(1);
    expect(screen.getByTestId("tile-0").style.zIndex).toBe("");
  });
});

describe("riding cancels submersion", () => {
  /**
   * Standing on a slab means being ON the water, not in it. Deep water otherwise clips the hero
   * down to a head, which is what made the rider look like it was wading through the raft.
   *
   * There are THREE submersion sites — the in-tile hero, the in-tile enemy, and the smooth-mode
   * hero overlay in TilemapGrid — and smooth mode is the default, so fixing only the tile copy
   * leaves the bug visible to everyone. These cover the two in-tile ones; the overlay lives in
   * TilemapGrid and is exempted alongside them.
   */
  it("does not clip the hero when a slab is under them", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.DEEP_WATER, TileSubtype.MOVING_PLATFORM, TileSubtype.PLAYER]}
        isVisible={true}
        heroTorchLit={true}
      />
    );
    const hero = document.querySelector('[class*="heroImage"]') as HTMLElement | null;
    expect(hero).not.toBeNull();
    expect(hero!.style.clipPath).toBe("");
  });

  it("still clips a hero swimming the same water", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.DEEP_WATER, TileSubtype.PLAYER]}
        isVisible={true}
        heroTorchLit={true}
      />
    );
    const hero = document.querySelector('[class*="heroImage"]') as HTMLElement | null;
    expect(hero).not.toBeNull();
    expect(hero!.style.clipPath).not.toBe("");
  });
});

describe("toggle switch state is visible", () => {
  /**
   * The complaint this fixes: every toggle looked identical whichever way it was thrown, so there
   * was no way to read a room's state without experimenting on the switch. The state lives on the
   * ToggleGroup rather than on the tile, so it has to be passed in.
   */
  it("shows a different colour in each state", () => {
    const { rerender } = render(
      <Tile tileId={0} tileType={FLOOR_TYPE} subtype={[TileSubtype.TOGGLE_SWITCH]} isVisible={true} toggleState={0} />
    );
    const read = () =>
      screen.getByTestId(`subtype-icon-${TileSubtype.TOGGLE_SWITCH}`).style.getPropertyValue("--toggle-color");
    const s0 = read();
    expect(s0).toBe(TOGGLE_STATE_COLORS[0]);

    rerender(
      <Tile tileId={0} tileType={FLOOR_TYPE} subtype={[TileSubtype.TOGGLE_SWITCH]} isVisible={true} toggleState={1} />
    );
    expect(read()).toBe(TOGGLE_STATE_COLORS[1]);
    expect(read()).not.toBe(s0);
  });

  it("supports more than two states, wrapping past the palette", () => {
    for (let state = 0; state < TOGGLE_STATE_COLORS.length + 2; state++) {
      const { unmount } = render(
        <Tile tileId={0} tileType={FLOOR_TYPE} subtype={[TileSubtype.TOGGLE_SWITCH]} isVisible={true} toggleState={state} />
      );
      const el = screen.getByTestId(`subtype-icon-${TileSubtype.TOGGLE_SWITCH}`);
      expect(el.style.getPropertyValue("--toggle-color")).toBe(toggleStateColor(state));
      expect(el.getAttribute("data-toggle-state")).toBe(String(state));
      unmount();
    }
  });

  it("also flips the lever on odd states, so colour is not the only tell", () => {
    // Deliberate redundancy: the dungeon dims tiles to 55-80% brightness by FOV tier, and colour
    // alone is a poor single channel for anyone with colour-vision deficiency.
    const { rerender } = render(
      <Tile tileId={0} tileType={FLOOR_TYPE} subtype={[TileSubtype.TOGGLE_SWITCH]} isVisible={true} toggleState={0} />
    );
    const el = () => screen.getByTestId(`subtype-icon-${TileSubtype.TOGGLE_SWITCH}`);
    expect(el().style.transform).toBe("");
    rerender(
      <Tile tileId={0} tileType={FLOOR_TYPE} subtype={[TileSubtype.TOGGLE_SWITCH]} isVisible={true} toggleState={1} />
    );
    expect(el().style.transform).toContain("scaleX(-1)");
  });

  it("every palette colour is distinct", () => {
    expect(new Set(TOGGLE_STATE_COLORS).size).toBe(TOGGLE_STATE_COLORS.length);
  });
});

describe("deck stacks above a glowing tile below it", () => {
  /**
   * Regression for a very specific bug: the raft's bottom half vanished over LAVA but not over
   * land or water. Cause — a platform deck is drawn on its ANCHOR tile and overflows DOWNWARD, and
   * a glowing tile (lava emits light) lifts its wrapper to z-index 10050. So the lava tile beneath
   * the anchor was a sibling stacking context at 10050 that painted OVER the deck's overflow. Water
   * and floor do not glow, which is exactly why only lava showed the bug. The fix lifts a deck
   * anchor's own wrapper to 10060, above that tier.
   */
  it("gives a deck-anchor tile's wrapper a z-index above the 10050 glow tier", () => {
    const room = parsePuzzleRoom(
      PUZZLE_ROOMS.find((r) => r.name === "The Ferry")!
    );
    const state = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      showFullMap: true,
      win: false,
      playerDirection: 2,
      enemies: [],
      npcs: [],
      heroHealth: 5,
      heroMaxHealth: 5,
      heroAttack: 1,
      heroTorchLit: true,
      rockCount: 0,
      runeCount: 0,
      foodCount: 0,
      potionCount: 0,
      mode: "normal",
      allowCheckpoints: false,
      mapData: room.mapData,
      toggleGroups: room.toggleGroups,
      platforms: room.platforms,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0, byKind: {} },
      recentDeaths: [],
      diaryEntries: [],
    } as unknown as GameState;

    render(
      <TilemapGrid
        tileTypes={{ 0: FLOOR_TYPE, 1: { id: 1, name: "wall", color: "#333", walkable: false } }}
        initialGameState={state}
        forceDaylight={true}
        storageSlot="test"
      />
    );

    const deck = screen.getByTestId(`subtype-icon-${TileSubtype.MOVING_PLATFORM}`);
    // Walk up to the .tileWrapper (the element carrying data-row/data-col).
    let wrapper: HTMLElement | null = deck.parentElement;
    while (wrapper && wrapper.getAttribute("data-row") === null) {
      wrapper = wrapper.parentElement;
    }
    expect(wrapper).not.toBeNull();
    expect(wrapper!.style.zIndex).toBe("10060");
    expect(Number(wrapper!.style.zIndex)).toBeGreaterThan(10050);
  });
});

describe("first-platform wait tip", () => {
  const WALL_TYPE = { id: 1, name: "wall", color: "#333", walkable: false };
  const tileTypes = { 0: FLOOR_TYPE, 1: WALL_TYPE };

  function stateFor(roomName: string): GameState {
    const room = parsePuzzleRoom(PUZZLE_ROOMS.find((r) => r.name === roomName)!);
    return {
      hasKey: false, hasExitKey: false, hasSword: false, hasShield: false, showFullMap: true,
      win: false, playerDirection: 2, enemies: room.enemies, npcs: [], heroHealth: 5,
      heroMaxHealth: 5, heroAttack: 1, heroTorchLit: true, rockCount: room.rocks, runeCount: 0,
      foodCount: 0, potionCount: 0, mode: "normal", allowCheckpoints: false, mapData: room.mapData,
      toggleGroups: room.toggleGroups, platforms: room.platforms, recentDeaths: [], diaryEntries: [],
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0, byKind: {} },
    } as unknown as GameState;
  }

  beforeEach(() => window.localStorage.clear());

  it("shows once, the first time a platform is on the floor", () => {
    render(<TilemapGrid tileTypes={tileTypes} initialGameState={stateFor("The Ferry")} forceDaylight storageSlot="test" />);
    expect(screen.getByTestId("wait-tip")).toBeInTheDocument();
    // It writes the seen-flag so it will not return.
    expect(window.localStorage.getItem("tb_wait_tip_seen")).toBe("1");
  });

  it("does not show again once it has been seen", () => {
    window.localStorage.setItem("tb_wait_tip_seen", "1");
    render(<TilemapGrid tileTypes={tileTypes} initialGameState={stateFor("The Ferry")} forceDaylight storageSlot="test" />);
    expect(screen.queryByTestId("wait-tip")).not.toBeInTheDocument();
  });

  it("does not show on a floor that has no platform", () => {
    // The Trade is toggles + spikes, no platform — the tip is about riding, so it must stay quiet.
    render(<TilemapGrid tileTypes={tileTypes} initialGameState={stateFor("The Trade")} forceDaylight storageSlot="test" />);
    expect(screen.queryByTestId("wait-tip")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("tb_wait_tip_seen")).toBeNull();
  });
})

describe("colour switch palette", () => {
  it("shows all four colours in the corners with the current one active", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.TOGGLE_SWITCH]}
        isVisible={true}
        toggleState={2}
        toggleColors={4}
      />
    );
    for (let i = 0; i < 4; i++) {
      const dot = screen.getByTestId(`palette-dot-${i}`);
      expect(dot).toBeInTheDocument();
      // Each corner carries its own fixed colour...
      expect(dot.style.getPropertyValue("--dot-color")).toBe(toggleStateColor(i));
      // ...and only the current colour (2) is lit.
      expect(dot.getAttribute("data-active")).toBe(i === 2 ? "true" : "false");
    }
  });

  it("leaves a binary toggle with no palette dots (keeps its single lamp)", () => {
    render(
      <Tile
        tileId={0}
        tileType={FLOOR_TYPE}
        subtype={[TileSubtype.TOGGLE_SWITCH]}
        isVisible={true}
        toggleState={1}
      />
    );
    expect(screen.queryByTestId("palette-dot-0")).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`subtype-icon-${TileSubtype.TOGGLE_SWITCH}`)
    ).toBeInTheDocument();
  });
})
