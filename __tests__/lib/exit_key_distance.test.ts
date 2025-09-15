import { generateMapWithSubtypes, generateMapWithExit, addExitKeyToMap, TileSubtype, type MapData, generateCompleteMap } from '../../lib/map';

function findSubtype(mapData: MapData, subtype: TileSubtype): [number, number] | null {
  const h = mapData.subtypes.length;
  const w = mapData.subtypes[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mapData.subtypes[y][x].includes(subtype)) return [y, x];
    }
  }
  return null;
}

function manhattan(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function allEligibleFloors(mapData: MapData): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const h = mapData.tiles.length;
  const w = mapData.tiles[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        mapData.tiles[y][x] === 0 &&
        (mapData.subtypes[y][x].length === 0 || mapData.subtypes[y][x].includes(TileSubtype.NONE))
      ) {
        out.push([y, x]);
      }
    }
  }
  return out;
}

describe('Exit key placement distance constraints', () => {
  test('exit key is at least 10 tiles away from the exit (Manhattan) across many generated maps', () => {
    const trials = 25;
    for (let i = 0; i < trials; i++) {
      const map = generateCompleteMap();
      const exitPos = findSubtype(map, TileSubtype.EXIT);
      const keyPos = findSubtype(map, TileSubtype.EXITKEY);
      expect(exitPos).not.toBeNull();
      expect(keyPos).not.toBeNull();
      if (exitPos && keyPos) {
        const d = manhattan(exitPos, keyPos);
        expect(d).toBeGreaterThanOrEqual(10);
      }
    }
  });

  test('exit key placement has variety: not always at maximum distance', () => {
    // Build a base with just exit to test the new varied placement logic
    const base = generateMapWithExit(generateMapWithSubtypes());
    const exitPos = findSubtype(base, TileSubtype.EXIT);
    expect(exitPos).not.toBeNull();
    if (!exitPos) return; // type guard for TS

    const eligible = allEligibleFloors(base);
    expect(eligible.length).toBeGreaterThan(0);

    // Compute max distance among eligible floors
    const maxDist = Math.max(
      ...eligible.map((p) => manhattan(p, exitPos as [number, number]))
    );

    // Test multiple placements to ensure variety
    const distances: number[] = [];
    for (let i = 0; i < 10; i++) {
      const withKey = addExitKeyToMap(base);
      const keyPos = findSubtype(withKey, TileSubtype.EXITKEY);
      expect(keyPos).not.toBeNull();
      if (!keyPos) continue;

      const d = manhattan(keyPos, exitPos as [number, number]);
      distances.push(d);

      // Should still respect minimum distance
      expect(d).toBeGreaterThanOrEqual(10);
    }

    // Should have some variety - not all placements at max distance
    const uniqueDistances = new Set(distances);
    expect(uniqueDistances.size).toBeGreaterThan(1);

    // Should still favor farther distances (70% of max or better)
    const minExpectedDistance = Math.floor(maxDist * 0.7);
    const farDistances = distances.filter(d => d >= minExpectedDistance);
    expect(farDistances.length).toBeGreaterThan(distances.length * 0.5); // At least half should be far
  });
});
