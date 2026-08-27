import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
  corridorTilesForMap,
  type GameState,
} from "../../lib/map/game-state";
import { placeEnemies } from "../../lib/enemy";
import { enemyTypeAssignement } from "../../lib/enemy_assignment";
import { stampBossEntranceOnFloor } from "../../lib/bosses/boss_entrances";
import { generateCompleteMapForFloor } from "../../lib/map/map-features";
import { planSwitchGate } from "../../lib/map/switch-gates";
import { TileSubtype, FLOOR } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { findPlayerPosition } from "../../lib/map/player";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";

/**
 * Daily tuning v2 (lib/map/daily_tuning.ts) is a date-gated batch that changes seeded
 * draws MID-STREAM. Two things must therefore hold forever: with the flag off, generation
 * is byte-identical to the pre-v2 game (history stays replayable); with it on, each
 * mechanism honors its contract on real generated floors.
 */

function buildDaily(seed: number, tuningV2: boolean): [GameState, GameState, GameState] {
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1, { switchGates: true, tuningV2 })
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  return [f1, f2, f3];
}

// GameState.enemies is optional in the type; on freshly-built daily floors it is always
// present, so an empty default keeps the assertions honest without non-null assertions.
function foes(s: GameState) {
  return s.enemies ?? [];
}

function enemySnapshot(s: GameState): Array<[string, number, number]> {
  return foes(s).map((e) => [e.kind ?? "?", e.y, e.x] as [string, number, number]);
}

describe("tuningV2 off — byte-identical to the pre-v2 generator", () => {
  it.each(["2026-07-15", "2026-08-20", "2026-08-26"])(
    "flag false and flag absent build the same run for %s",
    (date) => {
      const seed = hashStringToSeed(date);
      const withFalse = buildDaily(seed, false);
      const f1 = withPatchedMathRandom(mulberry32(seed), () =>
        initializeGameStateForMultiTier(1, { switchGates: true })
      );
      const f2 = advanceToNextFloor(f1, seed);
      const f3 = advanceToNextFloor(f2, seed);
      const absent = [f1, f2, f3];
      for (let i = 0; i < 3; i++) {
        expect(withFalse[i].mapData.tiles).toEqual(absent[i].mapData.tiles);
        expect(withFalse[i].mapData.subtypes).toEqual(absent[i].mapData.subtypes);
        expect(enemySnapshot(withFalse[i])).toEqual(enemySnapshot(absent[i]));
      }
      expect(withFalse[2].switchGate).toEqual(absent[2].switchGate);
      // And the off state never carries the flag into the save.
      expect(withFalse[0].tuningV2Enabled).toBeUndefined();
    }
  );
});

describe("boosted white-goblin swarm table", () => {
  const seq = (values: number[]) => {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  };

  it("floor 2: a 0.2 roll is a swarm only when boosted (10% -> 25%)", () => {
    // Draw order inside enemyTypeAssignement: ghost roll, then swarm roll.
    const base = enemyTypeAssignement([], { floor: 2, rng: seq([0.4, 0.2]) });
    const boosted = enemyTypeAssignement([], { floor: 2, rng: seq([0.4, 0.2]), boostedSwarms: true });
    expect(base.whiteGoblinCount).toBe(0);
    expect(boosted.whiteGoblinCount).toBe(4);
  });

  it("floor 3: a 0.45 roll is two swarms only when boosted (26% -> 50%)", () => {
    const base = enemyTypeAssignement([], { floor: 3, rng: seq([0.4, 0.45]) });
    const boosted = enemyTypeAssignement([], { floor: 3, rng: seq([0.4, 0.45]), boostedSwarms: true });
    expect(base.whiteGoblinCount).toBe(0);
    expect(boosted.whiteGoblinCount).toBe(8);
  });
});

describe("placeEnemies candidate options", () => {
  // 7x7 room: outer wall ring, floor inside, a 2x2 deep pool in the south-east.
  const grid = Array.from({ length: 7 }, (_, y) =>
    Array.from({ length: 7 }, (_, x) => (y === 0 || x === 0 || y === 6 || x === 6 ? 1 : 0))
  );
  const subtypes = () =>
    Array.from({ length: 7 }, (_, y) =>
      Array.from({ length: 7 }, (_, x) =>
        (y === 4 || y === 5) && (x === 4 || x === 5) ? [TileSubtype.DEEP_WATER] : []
      )
    );

  it("inDeepWater picks only bare deep-water tiles", () => {
    const placed = placeEnemies({
      grid,
      subtypes: subtypes(),
      player: { y: 1, x: 1 },
      count: 4, // more than the pool holds — must cap at the 4 pool tiles
      minDistanceFromPlayer: 0,
      rng: mulberry32(5).next,
      inDeepWater: true,
    });
    expect(placed.length).toBe(4);
    for (const e of placed) {
      expect([4, 5]).toContain(e.y);
      expect([4, 5]).toContain(e.x);
    }
  });

  it("allowedTiles and takenTiles restrict candidates", () => {
    const allowed = new Set(["2,2", "2,3"]);
    const placed = placeEnemies({
      grid,
      subtypes: subtypes(),
      player: { y: 1, x: 1 },
      count: 5,
      minDistanceFromPlayer: 0,
      rng: mulberry32(5).next,
      allowedTiles: allowed,
      takenTiles: new Set(["2,3"]),
    });
    expect(placed.map((e) => `${e.y},${e.x}`)).toEqual(["2,2"]);
  });
});

describe("tuningV2 on — mechanism contracts on real generated floors", () => {
  // Scan real dates from the gate so the fixtures are the game's own floors. Deterministic:
  // the same dates always produce the same maps.
  const dates: string[] = [];
  {
    const t0 = Date.UTC(2026, 7, 27);
    for (let i = 0; i < 40; i++) dates.push(new Date(t0 + i * 86400000).toISOString().slice(0, 10));
  }
  const runs = dates.map((d) => ({ date: d, floors: buildDaily(hashStringToSeed(d), true) }));

  const deepFrac = (m: MapData): number => {
    let deep = 0;
    let floor = 0;
    for (let y = 0; y < m.tiles.length; y++)
      for (let x = 0; x < m.tiles[y].length; x++) {
        if (m.tiles[y][x] !== FLOOR) continue;
        floor++;
        if ((m.subtypes[y]?.[x] ?? []).includes(TileSubtype.DEEP_WATER)) deep++;
      }
    return floor ? deep / floor : 0;
  };
  const ambushers = (s: GameState): number =>
    foes(s).filter(
      (e) =>
        e.kind === "water-goblin" &&
        (s.mapData.subtypes[e.y]?.[e.x] ?? []).includes(TileSubtype.DEEP_WATER)
    ).length;

  it("big pools carry 1-2 water-goblin ambushers; small/dry floors carry none", () => {
    let wetFloors = 0;
    for (const { floors } of runs) {
      for (const fl of [1, 2]) {
        const s = floors[fl];
        const frac = deepFrac(s.mapData);
        const n = ambushers(s);
        if (frac >= 0.15) {
          expect(n).toBe(2);
          wetFloors++;
        } else if (frac >= 0.08) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(2);
          wetFloors++;
        } else {
          expect(n).toBe(0);
        }
      }
    }
    // The scan must actually have exercised the wet case, or this test is vacuous.
    expect(wetFloors).toBeGreaterThan(0);
  });

  it("path bias puts more of the base count on the spawn→key→exit corridor", () => {
    const share = (s: GameState): number | null => {
      const corridor = corridorTilesForMap(s.mapData);
      if (!corridor) return null;
      const isSpecial = (e: ReturnType<typeof foes>[number]) =>
        e.kind === "ghost" ||
        e.kind === "white-goblin" ||
        e.kind === "snake" ||
        e.behaviorMemory?.isGuard === true;
      const base = foes(s).filter((e) => !isSpecial(e));
      if (base.length === 0) return null;
      return base.filter((e) => corridor.has(`${e.y},${e.x}`)).length / base.length;
    };
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Floor 2 is the sparse floor the bias exists for; compare v2 against v1 on the same dates.
    const sample = dates.slice(0, 12);
    const v2 = sample
      .map((d) => share(buildDaily(hashStringToSeed(d), true)[1]))
      .filter((x): x is number => x !== null);
    const v1 = sample
      .map((d) => share(buildDaily(hashStringToSeed(d), false)[1]))
      .filter((x): x is number => x !== null);
    expect(mean(v2)).toBeGreaterThan(mean(v1));
  });

  it("the day's gate records what it guards", () => {
    const gates = runs.map((r) => r.floors[2].switchGate).filter(Boolean);
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      expect(["chest", "corridor"]).toContain(g!.target);
    }
  });

  it("intended base counts are still met (no shortfall from the new draws)", () => {
    for (const { floors } of runs) {
      const baseCount = (s: GameState, deepOk: boolean) =>
        foes(s).filter((e) => {
          if (e.kind === "ghost" || e.kind === "white-goblin" || e.kind === "snake") return false;
          if (e.behaviorMemory?.isGuard) return false;
          // Ambushers are additive, not part of the base roll.
          if (
            deepOk &&
            e.kind === "water-goblin" &&
            (s.mapData.subtypes[e.y]?.[e.x] ?? []).includes(TileSubtype.DEEP_WATER)
          )
            return false;
          return true;
        }).length;
      expect(baseCount(floors[0], false)).toBeGreaterThanOrEqual(3);
      expect(baseCount(floors[1], true)).toBeGreaterThanOrEqual(7);
      expect(baseCount(floors[2], true)).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("moat variance (varyMoat)", () => {
  function freshFloor3(seed: number): MapData {
    return withPatchedMathRandom(mulberry32(seed), () =>
      generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, 3)
    );
  }
  const quadrant = (m: MapData): string => {
    let sy = 0;
    let sx = 0;
    let n = 0;
    for (let y = 0; y < m.tiles.length; y++)
      for (let x = 0; x < m.tiles[y].length; x++) {
        const subs = m.subtypes[y]?.[x] ?? [];
        if (subs.includes(TileSubtype.DEEP_WATER) || subs.includes(TileSubtype.SHALLOW_WATER)) {
          sy += y;
          sx += x;
          n++;
        }
      }
    if (n === 0) return "none";
    return (sy / n < m.tiles.length / 2 ? "N" : "S") + (sx / n < m.tiles[0].length / 2 ? "W" : "E");
  };

  it("still places the entrance, and the corner is no longer a function of the spawn alone", () => {
    // Same base floor, different stamp seeds: the base picker is deterministic per floor
    // (always the corner farthest from the hero), the varied picker must not be.
    const corners = new Set<string>();
    for (let s = 1; s <= 10; s++) {
      const map = freshFloor3(4242);
      const res = withPatchedMathRandom(mulberry32(1000 + s), () =>
        stampBossEntranceOnFloor(map, "moat-water", { varyMoat: true })
      );
      expect(res.placed).toBe(true);
      corners.add(quadrant(map));
    }
    expect(corners.size).toBeGreaterThanOrEqual(2);
  });

  it("chest-target planning returns null on a chestless floor", () => {
    const map = freshFloor3(4242);
    const hero = findPlayerPosition(map);
    expect(hero).not.toBeNull();
    const plan = planSwitchGate(map, hero!, { targetMode: "chest", minDetour: 2 });
    expect(plan).toBeNull();
  });
});
