import { getWallAsset, wallTopPattern } from "../../lib/environment";

/**
 * Wall pieces have to line up across tile boundaries: a wall's top face is drawn over the
 * tile above it, from the top third of one of the wall sprites, and its dark edge must sit
 * where the edge on the piece below sits.
 */

const W = 1;
const F = 0;

describe("wallTopPattern", () => {
  it("follows the wall below's sides, not the upper tile's", () => {
    // Above a run the upper tile's own sides are floor; the wall below continues both ways.
    // This used to pick 0010 (edges on both sides), seaming the run's top at every tile.
    expect(wallTopPattern({ left: F, right: F, bottomLeft: W, bottomRight: W })).toBe("0111");
  });

  it("draws an edge only where the run ends, on the open side", () => {
    expect(wallTopPattern({ left: F, right: F, bottomLeft: W, bottomRight: F })).toBe("0011");
    expect(wallTopPattern({ left: F, right: F, bottomLeft: F, bottomRight: W })).toBe("0110");
    expect(wallTopPattern({ left: F, right: F, bottomLeft: F, bottomRight: F })).toBe("0010");
  });

  it("treats the map edge as open", () => {
    expect(wallTopPattern({ left: null, right: F, bottomLeft: null, bottomRight: W })).toBe("0110");
  });

  it("falls back to the tile's own sides without the diagonals", () => {
    expect(wallTopPattern({ left: W, right: W })).toBe("0111");
    expect(wallTopPattern({ left: W, right: F })).toBe("0011");
  });
});

describe("getWallAsset", () => {
  it("serves the corrected right-end piece in the cave", () => {
    expect(getWallAsset("cave", "0001")).toBe("/images/wall/wall-0001-thin-edge.png");
    expect(getWallAsset(undefined, "0001")).toBe("/images/wall/wall-0001-thin-edge.png");
  });

  it("leaves every other piece and environment on its pattern file", () => {
    expect(getWallAsset("cave", "0101")).toBe("/images/wall/wall-0101.png");
    expect(getWallAsset("outdoor", "0001")).toBe("/images/wall/outdoor-wall-0001.png");
    expect(getWallAsset("pink_realm", "0001")).toBe("/images/wall/pink-realm-wall-0001.png");
  });
});
