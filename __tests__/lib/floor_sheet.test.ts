import {
  SHADE_E,
  SHADE_N,
  SHADE_NE,
  SHADE_NW,
  SHADE_W,
  floorShadeMask,
  floorShadeMaskFromNeighbors,
  generatedFloorBackground,
  parseFloorStyle,
} from "../../lib/floor_sheet";

/**
 * Generated floors (lib/floor_sheet.ts): every floor tile reads its own cell of one
 * seamless sheet, and wall shading is layered on from a neighbour mask. The contract
 * worth pinning is geometric: adjacent tiles must read adjacent cells (that is what makes
 * the floor continuous), and shading must appear exactly where a wall meets the floor.
 */

// "#" = wall, "." = floor, anything outside the grid is the void past the map edge.
function grid(rows: string[]) {
  return (row: number, col: number): number | null => {
    if (row < 0 || row >= rows.length || col < 0 || col >= rows[0].length) return null;
    return rows[row][col] === "#" ? 1 : 0;
  };
}

describe("floorShadeMask", () => {
  it("shades the sides that meet a wall, never the south", () => {
    const at = grid(["###", "#..", "###"]);
    expect(floorShadeMask(at, 1, 1)).toBe(SHADE_N | SHADE_W);
    expect(floorShadeMask(at, 1, 2)).toBe(SHADE_N | SHADE_E); // map edge counts as a wall
  });

  it("rounds the corner at the end of a wall run, and only there", () => {
    // Wall run ending at col 1; the tile past its end sees the wall only diagonally.
    const at = grid(["##...", ".....", "....."]);
    expect(floorShadeMask(at, 1, 1)).toBe(SHADE_N);
    expect(floorShadeMask(at, 1, 2)).toBe(SHADE_NW);
    expect(floorShadeMask(at, 1, 3)).toBe(0);
  });

  it("drops the corner when a side band already covers it", () => {
    const at = grid(["#..", "#..", "..."]);
    // (1,1): wall to the west AND north-west; the west band already covers the corner.
    expect(floorShadeMask(at, 1, 1)).toBe(SHADE_W);
  });

  it("treats flowers and trees as open ground", () => {
    const at = (row: number, col: number) => (row === 0 ? 5 : col === 0 ? 6 : 0);
    expect(floorShadeMask(at, 1, 1)).toBe(0);
  });

  it("falls back to the four direct neighbours without corners", () => {
    expect(floorShadeMaskFromNeighbors({ top: 1, right: 0, left: null })).toBe(SHADE_N | SHADE_W);
    expect(floorShadeMaskFromNeighbors({ top: 0, right: 2, left: 0 })).toBe(SHADE_E);
  });
});

describe("generatedFloorBackground", () => {
  const sheetPosition = (row: number, col: number) => {
    const bg = generatedFloorBackground("cave", row, col, 0)!;
    return String(bg.backgroundPosition);
  };

  it("maps each tile to its own cell of the sheet, wrapping every 8 tiles", () => {
    expect(sheetPosition(0, 0)).toBe("0% 0%");
    expect(sheetPosition(0, 7)).toBe("100% 0%");
    expect(sheetPosition(7, 0)).toBe("0% 100%");
    expect(sheetPosition(3, 11)).toBe(sheetPosition(3, 3));
    expect(sheetPosition(10, 2)).toBe(sheetPosition(2, 2));
  });

  it("sizes the sheet so a cell is exactly one tile", () => {
    const bg = generatedFloorBackground("cave", 0, 0, 0)!;
    expect(bg.backgroundSize).toBe("800% 800%");
    expect(bg.backgroundImage).toMatch(/cave-floor-sheet-v1\.webp/);
  });

  it("layers one gradient per shaded side, above the sheet", () => {
    const bg = generatedFloorBackground("cave", 4, 4, SHADE_N | SHADE_W | SHADE_NE)!;
    const layers = String(bg.backgroundImage).split(/,\s*(?=(?:linear|radial)-gradient|url\()/);
    expect(layers).toHaveLength(4);
    expect(layers[0]).toMatch(/^linear-gradient\(to bottom/);
    expect(layers[1]).toMatch(/^linear-gradient\(to right/);
    expect(layers[2]).toMatch(/^radial-gradient\(32% 50% at 100% 0%/);
    expect(layers[3]).toMatch(/^url\(/);
    // One size/position entry per layer, the sheet's last.
    expect(String(bg.backgroundSize).split(", ")).toHaveLength(4);
    expect(String(bg.backgroundPosition).split(", ")).toHaveLength(4);
  });

  it("leaves outdoor grass unshaded, as the classic outdoor floor is", () => {
    const bg = generatedFloorBackground("outdoor", 1, 1, SHADE_N | SHADE_E | SHADE_W | SHADE_NW)!;
    expect(bg.backgroundImage).toBe(`url(/images/floor/generated/grass-floor-sheet-v1.webp)`);
  });

  it("shades the pink realm in its own magenta, not the cave's green", () => {
    const bg = generatedFloorBackground("pink_realm", 2, 5, SHADE_N)!;
    expect(bg.backgroundImage).toMatch(/^linear-gradient\(to bottom, rgba\(40, 0, 22, 0\.42\) 0%/);
    expect(bg.backgroundImage).toMatch(/pink-realm-floor-sheet-v1\.webp/);
  });

  it("returns null where there is no sheet, so the classic tile stays", () => {
    expect(generatedFloorBackground("house", 0, 0, 0)).toBeNull();
    expect(generatedFloorBackground(undefined, 0, 0, 0)).toBeNull();
  });
});

describe("parseFloorStyle", () => {
  it("only opts in on an explicit flag", () => {
    expect(parseFloorStyle("generated")).toBe("generated");
    expect(parseFloorStyle("gen")).toBe("generated");
    expect(parseFloorStyle("classic")).toBe("classic");
    expect(parseFloorStyle(null)).toBeNull();
    expect(parseFloorStyle("1")).toBeNull();
  });
});
