import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
  type GameState,
} from "../../lib/map/game-state";
import {
  addSnakesPerRules,
  SNAKE_SPAWN_BUFFER_STEPS,
  snakeSpawnBufferForDate,
} from "../../lib/map/enemy-features";
import { generateCompleteMapForFloor } from "../../lib/map/map-features";
import { TileSubtype, FLOOR } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { findPlayerPosition } from "../../lib/map/player";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../lib/rng";

/**
 * Snake spawn buffer: no snake, loose or potted, starts within SNAKE_SPAWN_BUFFER_STEPS
 * walking steps of the hero. Reported on 2026-09-25, a floor-1 swarm day that opened with
 * a snake adjacent to the hero (best run that day: 32 steps).
 */

function stepsFrom(mapData: MapData, from: [number, number]): number[][] {
  const dist = mapData.tiles.map((row) => row.map(() => -1));
  dist[from[0]][from[1]] = 0;
  const queue: Array<[number, number]> = [from];
  for (let head = 0; head < queue.length; head++) {
    const [y, x] = queue[head];
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ny = y + dy;
      const nx = x + dx;
      if (mapData.tiles[ny]?.[nx] !== FLOOR || dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[y][x] + 1;
      queue.push([ny, nx]);
    }
  }
  return dist;
}

function snakeTiles(mapData: MapData, enemies: GameState["enemies"]) {
  const loose = (enemies ?? []).filter((e) => e.kind === "snake").map((e) => [e.y, e.x]);
  const potted: number[][] = [];
  mapData.subtypes.forEach((row, y) =>
    row.forEach((subs, x) => {
      if (subs.includes(TileSubtype.POT) && subs.includes(TileSubtype.SNAKE)) potted.push([y, x]);
    })
  );
  return { loose, potted };
}

/** Walking steps from the hero to each reachable snake. */
function snakeSteps(mapData: MapData, enemies: GameState["enemies"]): number[] {
  const player = findPlayerPosition(mapData)!;
  const dist = stepsFrom(mapData, player);
  const { loose, potted } = snakeTiles(mapData, enemies);
  return [...loose, ...potted].map(([y, x]) => dist[y][x]).filter((d) => d >= 0);
}

function buildDaily(date: string, snakeSpawnBuffer: boolean): GameState[] {
  const seed = hashStringToSeed(date);
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1, {
      switchGates: true,
      tuningV2: true,
      fisherRetired: true,
      snakeSpawnBuffer,
    })
  );
  const f2 = advanceToNextFloor(f1, seed);
  const f3 = advanceToNextFloor(f2, seed);
  return [f1, f2, f3];
}

describe("snake spawn buffer date gate", () => {
  it("starts the day after the 2026-09-25 report", () => {
    expect(snakeSpawnBufferForDate("2026-09-25")).toBe(false);
    expect(snakeSpawnBufferForDate("2026-09-26")).toBe(true);
  });
});

describe("the reported day (2026-09-25, floor-1 swarm)", () => {
  // Pins history as well as the fix: if the "off" half ever fails, a change moved the
  // 2026-09-25 map without a date gate.
  it("opens with a snake adjacent to the hero when the buffer is off", () => {
    const [f1] = buildDaily("2026-09-25", false);
    expect(f1.mapData.snakeSwarm).toBe(true);
    expect(Math.min(...snakeSteps(f1.mapData, f1.enemies))).toBe(1);
  });

  it("keeps every snake on every floor back from the start when the buffer is on", () => {
    const floors = buildDaily("2026-09-25", true);
    for (const f of floors) {
      expect(f.snakeSpawnBufferEnabled).toBe(true);
      for (const d of snakeSteps(f.mapData, f.enemies)) {
        expect(d).toBeGreaterThanOrEqual(SNAKE_SPAWN_BUFFER_STEPS);
      }
    }
    // The swarm keeps its full size: six loose snakes and one in a pot.
    const { loose, potted } = snakeTiles(floors[0].mapData, floors[0].enemies);
    expect(loose).toHaveLength(6);
    expect(potted).toHaveLength(1);
  });

  it("moves only the snakes", () => {
    const off = buildDaily("2026-09-25", false);
    const on = buildDaily("2026-09-25", true);
    const withoutSnakes = (s: GameState) => ({
      tiles: s.mapData.tiles,
      subtypes: s.mapData.subtypes.map((row) =>
        row.map((subs) => (subs.includes(TileSubtype.SNAKE) ? [] : subs))
      ),
      enemies: (s.enemies ?? []).filter((e) => e.kind !== "snake").map((e) => [e.kind, e.y, e.x]),
    });
    for (let i = 0; i < 3; i++) {
      expect(withoutSnakes(on[i])).toEqual(withoutSnakes(off[i]));
    }
  });
});

describe("addSnakesPerRules with minStepsFromPlayer", () => {
  // A forced swarm (first draw < 0.05) on a real generated floor, counting draws.
  function swarmRun(seed: number, minStepsFromPlayer: number) {
    const mapData = withPatchedMathRandom(mulberry32(seed), () =>
      generateCompleteMapForFloor({ chests: 0, keys: 0, chestContents: [] }, 1)
    );
    const next = mulberry32(seed ^ 0x5eed);
    let draws = 0;
    const rng = () => (draws++ === 0 ? 0.01 : next.next());
    const enemies = addSnakesPerRules(mapData, [], { rng, floor: 1, minStepsFromPlayer });
    return { mapData, enemies, draws };
  }

  it.each(Array.from({ length: 30 }, (_, i) => i + 1))(
    "seed %i: every snake is at least the buffer away, with the same draws as no buffer",
    (seed) => {
      const plain = swarmRun(seed, 0);
      const buffered = swarmRun(seed, SNAKE_SPAWN_BUFFER_STEPS);
      for (const d of snakeSteps(buffered.mapData, buffered.enemies)) {
        expect(d).toBeGreaterThanOrEqual(SNAKE_SPAWN_BUFFER_STEPS);
      }
      // Same number of draws, so nothing later on the floor's rng stream moves.
      expect(buffered.draws).toBe(plain.draws);
      const { loose, potted } = snakeTiles(buffered.mapData, buffered.enemies);
      expect(loose).toHaveLength(6);
      expect(potted).toHaveLength(1);
    }
  );
});
