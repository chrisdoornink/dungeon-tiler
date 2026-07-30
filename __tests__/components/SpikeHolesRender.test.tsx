import React from "react";
import { render } from "@testing-library/react";
import { Tile } from "../../components/Tile";
import { TileSubtype } from "../../lib/map/constants";

const mockFloor = { id: 0, name: "floor", color: "#ccc", walkable: true };

/**
 * Retracted spike beds paint themselves from a CSS class (.spikeHoles). The floor branch of
 * Tile also sets an INLINE background-image for ordinary floor, and an inline style beats a
 * class — so any self-painting terrain missing from that exclusion list renders as plain
 * floor with no error anywhere. That is exactly what happened here, and the same trap had
 * already caught lava once before.
 */
describe("self-painting floor terrain keeps its own background", () => {
  const cases: Array<[string, number]> = [
    ["SPIKES", TileSubtype.SPIKES],
    ["SPIKE_HOLES", TileSubtype.SPIKE_HOLES],
    ["LAVA", TileSubtype.LAVA],
    ["DEEP_WATER", TileSubtype.DEEP_WATER],
  ];

  test.each(cases)("%s suppresses the inline floor image", (_label, subtype) => {
    const { container } = render(
      <Tile tileId={0} tileType={mockFloor} subtype={[subtype]} environment="cave" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.backgroundImage).toBe("");
  });

  test("plain floor still gets its inline image", () => {
    const { container } = render(<Tile tileId={0} tileType={mockFloor} subtype={[]} environment="cave" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.backgroundImage).toContain("url(");
  });

  test("a retracted bed gets the spikeHoles class, a standing one gets spikes", () => {
    const retracted = render(
      <Tile tileId={0} tileType={mockFloor} subtype={[TileSubtype.SPIKE_HOLES]} environment="cave" />
    );
    expect(retracted.container.firstElementChild?.className).toContain("spikeHoles");

    const standing = render(
      <Tile tileId={0} tileType={mockFloor} subtype={[TileSubtype.SPIKES]} environment="cave" />
    );
    expect(standing.container.firstElementChild?.className).toContain("spikes");
  });
});
