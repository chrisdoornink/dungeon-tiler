import { MapData, findStrategicDoorWall } from "../../lib/map";

// Build a 9x9 map with a single-entrance room on the right side.
// Layout (F=floor, W=wall, X=candidate door wall):
//
// WWWWWWWWW
// WFFFFFWWW
// WFWWWFWWW
// WFWXWFWWW
// WFWF FWWW   <-- space denotes floor (for clarity)
// WFWWWFWWW
// WFFFFFWWW
// WWWWWWWWW
// WWWWWWWWW
//
// The room is the 5x5 block on the right separated by a single wall at (3,4) marked X.
// The only connection to the left area is through that wall tile.

describe("Strategic door placement", () => {
  function makeMap(): MapData {
    const H = 9,
      W = 9;
    const WALL = 1,
      FLOOR = 0;
    const tiles: number[][] = Array(H)
      .fill(0)
      .map(() => Array(W).fill(WALL));
    const subtypes: number[][][] = Array(H)
      .fill(0)
      .map(() =>
        Array(W)
          .fill(0)
          .map(() => [] as number[])
      );

    // Carve left open area (x <= 3 only)
    for (let y = 1; y <= 6; y++) {
      for (let x = 1; x <= 3; x++) {
        tiles[y][x] = FLOOR;
      }
    }

    // Carve right room interior floors (x = 6..7)
    for (let y = 1; y <= 6; y++) {
      for (let x = 6; x <= 7; x++) {
        tiles[y][x] = FLOOR;
      }
    }

    // Separator column x=5 remains WALL for y=1..6
    for (let y = 1; y <= 6; y++) {
      tiles[y][5] = WALL;
    }

    // Create a single left-adjacent floor at (3,4) so only (3,5) is a choke between floors
    tiles[3][4] = FLOOR;

    return { tiles, subtypes };
  }

  it("finds the single-entrance wall tile for door placement", () => {
    const map = makeMap();
    const door = findStrategicDoorWall(map);
    expect(door).not.toBeNull();
    if (!door) return;
    const [y, x] = door;
    expect([y, x]).toEqual([3, 5]);
  });

  // Test removed since regular doors are no longer generated
  it("findStrategicDoorWall still identifies potential door locations", () => {
    const base = makeMap();
    const doorLocation = findStrategicDoorWall(base);
    expect(doorLocation).toEqual([3, 5]);
  });
});
