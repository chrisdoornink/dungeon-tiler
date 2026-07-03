import {
  calculateMapTransform,
  heroViewportPosition,
} from "../../components/TilemapGrid";

// 600px viewport, 40px tiles. A 20x20 map is 800px, so valid camera offsets
// are [-200, 0] on each axis.
describe("camera clamping", () => {
  it("centers the player when away from map edges", () => {
    expect(calculateMapTransform([10, 10], 20, 20)).toBe("-120px, -120px");
    expect(heroViewportPosition([10, 10], 20, 20)).toEqual({ x: 300, y: 300 });
  });

  it("clamps at the top-left so the viewport never shows past the map edge", () => {
    expect(calculateMapTransform([0, 0], 20, 20)).toBe("0px, 0px");
    expect(heroViewportPosition([0, 0], 20, 20)).toEqual({ x: 20, y: 20 });
  });

  it("clamps at the bottom-right edge", () => {
    expect(calculateMapTransform([19, 19], 20, 20)).toBe("-200px, -200px");
    expect(heroViewportPosition([19, 19], 20, 20)).toEqual({ x: 580, y: 580 });
  });

  it("centers maps smaller than the viewport regardless of player position", () => {
    expect(calculateMapTransform([0, 0], 10, 10)).toBe("100px, 100px");
    expect(heroViewportPosition([9, 9], 10, 10)).toEqual({ x: 480, y: 480 });
  });

  it("falls back to unclamped centering when map dimensions are unknown", () => {
    expect(calculateMapTransform([0, 0])).toBe("280px, 280px");
  });
});
