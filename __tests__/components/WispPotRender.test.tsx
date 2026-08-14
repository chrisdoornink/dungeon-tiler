import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Tile } from "../../components/Tile";
import { TileSubtype } from "../../lib/map/constants";

/**
 * Regression: a wisp is stamped onto a pot as [POT, WISP] (see stampWispPots). WISP is a
 * hidden payload the smash consumes — it must never draw its own glyph. Before the fix it
 * fell through getFilteredSubtypes to the generic renderer and painted a gray "?" box on the
 * pot tile (seen on the 2026-08-14 daily, floor 2).
 */
describe("wisp pot rendering", () => {
  it("does not draw a placeholder glyph for the hidden WISP payload", () => {
    render(
      <Tile
        tileId={0}
        tileType={{ id: 0, name: "floor", color: "#222", walkable: true }}
        isVisible={true}
        neighbors={{ top: 0, right: 0, bottom: 0, left: 0 }}
        subtype={[TileSubtype.POT, TileSubtype.WISP] as unknown as number[]}
      />
    );
    // The hidden WISP payload (72) must not draw its own glyph box.
    expect(screen.queryByTestId(`subtype-icon-${TileSubtype.WISP}`)).toBeNull();
    // The pot itself still renders (its sprite reuses the subtype-icon-12 testid).
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.POT}`)).toBeInTheDocument();
  });
});
