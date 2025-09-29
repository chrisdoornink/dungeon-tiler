import { placeStraight, placeCorner, placeT, placeEnd, layStraightBetween, layManhattan } from "../../../lib/map/roads";
import { FLOOR, TileSubtype } from "../../../lib/map/constants";

function makeGrid(h = 8, w = 8) {
  const tiles: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 1)); // 1 = WALL by convention
  const subtypes: number[][][] = Array.from({ length: h }, () => Array.from({ length: w }, () => [] as number[]));
  return { tiles, subtypes };
}

function has(arr: number[] | undefined, t: number) {
  return !!arr && arr.includes(t);
}

function rotationFlags(arr: number[]) {
  return {
    r90: has(arr, TileSubtype.ROAD_ROTATE_90),
    r180: has(arr, TileSubtype.ROAD_ROTATE_180),
    r270: has(arr, TileSubtype.ROAD_ROTATE_270),
  };
}

describe("roads helpers", () => {
  test("placeStraight sets floor, preserves overlays, and sets orientation", () => {
    const { tiles, subtypes } = makeGrid();
    // seed an overlay to ensure it is kept
    subtypes[3][2] = [TileSubtype.ROOM_TRANSITION];

    placeStraight(tiles, subtypes, 3, 2, 0); // horizontal

    expect(tiles[3][2]).toBe(FLOOR);
    const cell = subtypes[3][2];
    expect(has(cell, TileSubtype.ROOM_TRANSITION)).toBe(true);
    expect(has(cell, TileSubtype.ROAD)).toBe(true);
    expect(has(cell, TileSubtype.ROAD_STRAIGHT)).toBe(true);
    const rot = rotationFlags(cell);
    expect(rot.r90 || rot.r180 || rot.r270).toBe(false); // horizontal => no rotate flags

    // vertical
    placeStraight(tiles, subtypes, 4, 5, 90);
    const cell2 = subtypes[4][5];
    expect(tiles[4][5]).toBe(FLOOR);
    expect(has(cell2, TileSubtype.ROAD)).toBe(true);
    expect(has(cell2, TileSubtype.ROAD_STRAIGHT)).toBe(true);
    const rot2 = rotationFlags(cell2);
    expect(rot2.r90).toBe(true);
  });

  test("placeCorner maps rotations from two directions", () => {
    const { tiles, subtypes } = makeGrid();

    placeCorner(tiles, subtypes, 2, 2, ["N", "E"]);
    let c = subtypes[2][2]!;
    expect(has(c, TileSubtype.ROAD_CORNER)).toBe(true);
    // Corner base is NE at 0deg, so no rotation flags
    expect(rotationFlags(c).r90 || rotationFlags(c).r180 || rotationFlags(c).r270).toBe(false);

    placeCorner(tiles, subtypes, 2, 3, ["E", "S"]);
    c = subtypes[2][3]!;
    expect(has(c, TileSubtype.ROAD_CORNER)).toBe(true);
    expect(rotationFlags(c).r90).toBe(true);

    placeCorner(tiles, subtypes, 3, 3, ["S", "W"]);
    c = subtypes[3][3]!;
    expect(has(c, TileSubtype.ROAD_CORNER)).toBe(true);
    expect(rotationFlags(c).r180).toBe(true);

    placeCorner(tiles, subtypes, 3, 2, ["W", "N"]);
    c = subtypes[3][2]!;
    expect(has(c, TileSubtype.ROAD_CORNER)).toBe(true);
    // W+N is base => no rotation flags
  });

  test("placeT sets correct rotation for missing side", () => {
    const { tiles, subtypes } = makeGrid();

    // present W,E,S (missing N) => 0 (no rotation flags)
    placeT(tiles, subtypes, 1, 1, ["W", "E", "S"]);
    let c = subtypes[1][1]!;
    expect(has(c, TileSubtype.ROAD_T)).toBe(true);
    expect(rotationFlags(c).r90 || rotationFlags(c).r180 || rotationFlags(c).r270).toBe(false);

    // present N,E,S (missing W) => 270
    placeT(tiles, subtypes, 1, 2, ["N", "E", "S"]);
    c = subtypes[1][2]!;
    expect(has(c, TileSubtype.ROAD_T)).toBe(true);
    expect(rotationFlags(c).r270).toBe(true);

    // present N,S,W (missing E) => 90
    placeT(tiles, subtypes, 1, 3, ["N", "S", "W"]);
    c = subtypes[1][3]!;
    expect(has(c, TileSubtype.ROAD_T)).toBe(true);
    expect(rotationFlags(c).r90).toBe(true);

    // present N,E,W (missing S) => 180
    placeT(tiles, subtypes, 1, 4, ["N", "E", "W"]);
    c = subtypes[1][4]!;
    expect(has(c, TileSubtype.ROAD_T)).toBe(true);
    expect(rotationFlags(c).r180).toBe(true);
  });

  test("corner regression: NE and NW map correctly", () => {
    const { tiles, subtypes } = makeGrid();
    // NE should be base (no rotation flags when corner base is NE)
    placeCorner(tiles, subtypes, 2, 2, ["N", "E"]);
    let c = subtypes[2][2]!;
    expect(has(c, TileSubtype.ROAD_CORNER)).toBe(true);
    expect(rotationFlags(c).r90 || rotationFlags(c).r180 || rotationFlags(c).r270).toBe(false);

    // NW should require 270
    placeCorner(tiles, subtypes, 2, 3, ["N", "W"]);
    c = subtypes[2][3]!;
    expect(has(c, TileSubtype.ROAD_CORNER)).toBe(true);
    expect(rotationFlags(c).r270).toBe(true);
  });

  test("T regression: present sets map to correct missing sides", () => {
    const { tiles, subtypes } = makeGrid();
    // W,S,E present -> missing N => expect 0 (no rotation flags)
    placeT(tiles, subtypes, 3, 3, ["W", "S", "E"]);
    let c = subtypes[3][3]!;
    expect(has(c, TileSubtype.ROAD_T)).toBe(true);
    expect(rotationFlags(c).r90 || rotationFlags(c).r180 || rotationFlags(c).r270).toBe(false);

    // N,E,W present -> missing S => expect 180
    placeT(tiles, subtypes, 3, 4, ["N", "E", "W"]);
    c = subtypes[3][4]!;
    expect(has(c, TileSubtype.ROAD_T)).toBe(true);
    expect(rotationFlags(c).r180).toBe(true);
  });

  test("placeEnd maps direction to rotation", () => {
    const { tiles, subtypes } = makeGrid();

    placeEnd(tiles, subtypes, 2, 2, "S");
    let c = subtypes[2][2]!;
    expect(has(c, TileSubtype.ROAD_END)).toBe(true);
    // base 0 => south, no rotate flags
    expect(rotationFlags(c).r90 || rotationFlags(c).r180 || rotationFlags(c).r270).toBe(false);

    placeEnd(tiles, subtypes, 2, 3, "N");
    c = subtypes[2][3]!;
    expect(rotationFlags(c).r180).toBe(true);

    placeEnd(tiles, subtypes, 2, 4, "E");
    c = subtypes[2][4]!;
    expect(rotationFlags(c).r270).toBe(true);

    placeEnd(tiles, subtypes, 2, 5, "W");
    c = subtypes[2][5]!;
    expect(rotationFlags(c).r90).toBe(true);
  });

  test("layStraightBetween draws inclusive lines horizontally and vertically", () => {
    const { tiles, subtypes } = makeGrid();

    layStraightBetween(tiles, subtypes, 4, 1, 4, 5);
    for (let x = 1; x <= 5; x++) {
      const c = subtypes[4][x]!;
      expect(tiles[4][x]).toBe(FLOOR);
      expect(has(c, TileSubtype.ROAD_STRAIGHT)).toBe(true);
      expect(rotationFlags(c).r90).toBe(false); // horizontal
    }

    layStraightBetween(tiles, subtypes, 1, 6, 6, 6);
    for (let y = 1; y <= 6; y++) {
      const c = subtypes[y][6]!;
      expect(tiles[y][6]).toBe(FLOOR);
      expect(has(c, TileSubtype.ROAD_STRAIGHT)).toBe(true);
      expect(rotationFlags(c).r90).toBe(true); // vertical
    }
  });

  test("layManhattan builds two segments with a corner at the bend", () => {
    const { tiles, subtypes } = makeGrid();

    // vertical-first: from (5,2) to (2,6)
    layManhattan(tiles, subtypes, 5, 2, 2, 6, "vertical-first");

    // Expect straight at (3,2) vertical
    const v = subtypes[3][2]!;
    expect(has(v, TileSubtype.ROAD_STRAIGHT)).toBe(true);
    expect(rotationFlags(v).r90).toBe(true);

    // Corner at (2,2) with dirs N+E (expects r270)
    const corner = subtypes[2][2]!;
    expect(has(corner, TileSubtype.ROAD_CORNER)).toBe(true);
    expect(rotationFlags(corner).r270).toBe(true);

    // Horizontal segment includes (2,4)
    const h = subtypes[2][4]!;
    expect(has(h, TileSubtype.ROAD_STRAIGHT)).toBe(true);
    expect(rotationFlags(h).r90).toBe(false);
  });
});
