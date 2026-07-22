import { Enemy, updateEnemies } from "../../lib/enemy";
import { TileSubtype, Direction } from "../../lib/map";
import {
  movePlayer,
  performThrowRock,
  performThrowBomb,
  detonateLiveBombs,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { generateCompleteMapForFloor } from "../../lib/map/map-features";
import { areAllFloorsConnected } from "../../lib/map/map-generation";

function baseState(
  tiles: number[][],
  subtypes: number[][][],
  overrides: Partial<GameState> = {}
): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: { tiles, subtypes },
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    enemies: [],
    npcs: [],
    rockCount: 5,
    runeCount: 5,
    bombCount: 5,
    heroTorchLit: true,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

const openGrid = (n: number) => Array.from({ length: n }, () => Array(n).fill(0));
const emptySubs = (n: number) =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));

describe("Water terrain (v2)", () => {
  test("swimming into deep water snuffs the torch; shallow water keeps it lit", () => {
    const tiles = openGrid(5);
    const subs = emptySubs(5);
    subs[2][0] = [TileSubtype.PLAYER];
    subs[2][1] = [TileSubtype.SHALLOW_WATER];
    subs[2][2] = [TileSubtype.DEEP_WATER];
    const state = baseState(tiles, subs);

    const wade = movePlayer(state, Direction.RIGHT);
    expect(wade.heroTorchLit).toBe(true); // shallow: still lit
    expect(wade.mapData.subtypes[2][1]).toContain(TileSubtype.SHALLOW_WATER);

    const swim = movePlayer(wade, Direction.RIGHT);
    expect(swim.heroTorchLit).toBe(false); // deep: snuffed
    expect(swim.mapData.subtypes[2][2]).toContain(TileSubtype.DEEP_WATER);
    expect(swim.heroHealth).toBe(5); // water never hurts the body
  });

  test("the torch cannot relight while swimming, even next to a wall torch", () => {
    const tiles = openGrid(5);
    const subs = emptySubs(5);
    subs[2][1] = [TileSubtype.PLAYER];
    subs[2][2] = [TileSubtype.DEEP_WATER];
    subs[2][3] = [TileSubtype.DEEP_WATER];
    subs[1][3] = [TileSubtype.WALL_TORCH]; // adjacent to the second deep tile
    const state = baseState(tiles, subs);

    const enter = movePlayer(state, Direction.RIGHT); // (2,2): snuffed
    expect(enter.heroTorchLit).toBe(false);
    const alongside = movePlayer(enter, Direction.RIGHT); // (2,3): torch adjacent, still swimming
    expect(alongside.heroTorchLit).toBe(false);
  });

  test("a rock makes a stepping stone only where it LANDS — mid-flight deep water is flown over", () => {
    // Hero at (2,0) facing right; deep water at (2,2) mid-flight and (2,4) at the
    // end of the 4-tile range. The rock sails OVER (2,2) and converts only (2,4).
    const tiles = openGrid(6);
    const subs = emptySubs(6);
    subs[2][0] = [TileSubtype.PLAYER];
    subs[2][2] = [TileSubtype.DEEP_WATER];
    subs[2][4] = [TileSubtype.DEEP_WATER];
    const state = baseState(tiles, subs, { rockCount: 3 });

    const next = performThrowRock(state);

    // Mid-flight tile untouched — still deep water.
    expect(next.mapData.subtypes[2][2]).toContain(TileSubtype.DEEP_WATER);
    expect(next.mapData.subtypes[2][2]).not.toContain(TileSubtype.STEPPING_STONE);
    // Landing tile converted; the rock is spent building the stone (no ROCK tag).
    const stone = next.mapData.subtypes[2][4];
    expect(stone).toContain(TileSubtype.STEPPING_STONE);
    expect(stone).not.toContain(TileSubtype.DEEP_WATER);
    expect(stone).not.toContain(TileSubtype.ROCK);
    expect(next.rockCount).toBe(2);
  });

  test("the landed stepping stone is a dry, walkable crossing", () => {
    const tiles = openGrid(7);
    const subs = emptySubs(7);
    subs[2][1] = [TileSubtype.PLAYER];
    subs[2][5] = [TileSubtype.DEEP_WATER]; // 4 tiles out = the landing tile
    const state = baseState(tiles, subs, { rockCount: 3 });

    const next = performThrowRock(state);
    expect(next.mapData.subtypes[2][5]).toContain(TileSubtype.STEPPING_STONE);

    // Walk out onto it with a lit torch: stones are dry.
    let s = next;
    for (let i = 0; i < 4; i++) s = movePlayer(s, Direction.RIGHT);
    expect(s.mapData.subtypes[2][5]).toContain(TileSubtype.PLAYER);
    expect(s.heroTorchLit).toBe(true);
    expect(s.heroHealth).toBe(5);
  });

  test("torch-snuff stealth: unseen by a land goblin, still hunted by a fire goblin", () => {
    // 1-wide corridor; enemy directly adjacent to the hero.
    const grid = [
      [1, 1, 1],
      [0, 0, 0],
      [1, 1, 1],
    ];
    const subs = [[[], [], []], [[], [], []], [[], [], []]] as number[][][];
    const player = { y: 1, x: 0 };

    const earth = new Enemy({ y: 1, x: 1 });
    earth.kind = "earth-goblin";
    const hidden = updateEnemies(grid, subs, [earth], player, {
      rng: () => 0.7,
      playerTorchLit: false,
    });
    expect(hidden.damage).toBe(0); // can't see you, can't bite you

    const fire = new Enemy({ y: 1, x: 1 });
    fire.kind = "fire-goblin";
    const hunted = updateEnemies(grid, subs, [fire], player, {
      rng: () => 0.7,
      playerTorchLit: false,
    });
    expect(hunted.damage).toBeGreaterThan(0); // carries its own light

    // Control: with the torch lit, the earth goblin bites normally.
    const earth2 = new Enemy({ y: 1, x: 1 });
    earth2.kind = "earth-goblin";
    const seen = updateEnemies(grid, subs, [earth2], player, {
      rng: () => 0.7,
      playerTorchLit: true,
    });
    expect(seen.damage).toBeGreaterThan(0);
  });

  test("water is kryptonite to pink goblins: contact destroys them", () => {
    // Pink goblin trapped on a shallow tile in a wall pocket (it can't step off).
    const tiles = [
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],
      [1, 1, 1, 0, 1],
      [1, 1, 1, 1, 1],
    ];
    const subs: number[][][] = tiles.map((row) => row.map(() => []));
    subs[1][3] = [TileSubtype.PLAYER];
    subs[1][1] = [TileSubtype.SHALLOW_WATER];
    const pink = new Enemy({ y: 1, x: 1 });
    pink.kind = "pink-goblin";
    const state = baseState(tiles, subs, { enemies: [pink] });

    const next = movePlayer(state, Direction.DOWN);

    expect(next.enemies).toHaveLength(0);
    expect(next.stats.enemiesDefeated).toBe(1);
    // The water stays — no tile conversion.
    expect(next.mapData.subtypes[1][1]).toContain(TileSubtype.SHALLOW_WATER);
  });

  test("water goblins swim deep water; knife-throwers refuse it", () => {
    const grid = [
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
    ];
    const subs: number[][][] = grid.map((row) => row.map(() => []));
    subs[1][2] = [TileSubtype.DEEP_WATER];
    const player = { y: 1, x: 0 };

    const swimmer = new Enemy({ y: 1, x: 3 });
    swimmer.kind = "water-goblin";
    updateEnemies(grid, subs, [swimmer], player, { rng: () => 0, playerTorchLit: true });
    expect([swimmer.y, swimmer.x]).toEqual([1, 2]); // swam into the deep tile

    const knives = new Enemy({ y: 1, x: 3 });
    knives.kind = "earth-goblin-knives";
    updateEnemies(grid, subs, [knives], player, { rng: () => 0, playerTorchLit: true });
    expect(knives.x).toBe(3); // refused the water; held position
  });

  test("shallow water is selective: snakes and stone goblins wade; fire/knives/white stay dry", () => {
    // 1-wide corridor with a shallow tile between the enemy and the hero.
    const grid = [
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
    ];
    const player = { y: 1, x: 0 };
    const mkSubs = () => {
      const s: number[][][] = grid.map((row) => row.map(() => []));
      s[1][2] = [TileSubtype.SHALLOW_WATER];
      return s;
    };

    const waders: Array<"snake" | "stone-goblin"> = ["snake", "stone-goblin"];
    for (const kind of waders) {
      const e = new Enemy({ y: 1, x: 3 });
      e.kind = kind;
      updateEnemies(grid, mkSubs(), [e], player, { rng: () => 0, playerTorchLit: true });
      expect([e.y, e.x]).toEqual([1, 2]); // waded into the shallows
    }

    const dryKinds: Array<"fire-goblin" | "earth-goblin-knives" | "white-goblin"> = [
      "fire-goblin",
      "earth-goblin-knives",
      "white-goblin",
    ];
    for (const kind of dryKinds) {
      const e = new Enemy({ y: 1, x: 3 });
      e.kind = kind;
      updateEnemies(grid, mkSubs(), [e], player, { rng: () => 0, playerTorchLit: true });
      expect(e.x).toBe(3); // refused even the shallows; held position
    }
  });

  test("a stone goblin drowns on a stepping stone — the stone sinks back into deep water", () => {
    // Pocket the goblin on a stepping stone (walls all around) so it must end its
    // tick there; the hero moves elsewhere on the same turn.
    const tiles = [
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 0],
      [1, 1, 1, 0, 1],
      [1, 1, 1, 1, 1],
    ];
    const subs: number[][][] = tiles.map((row) => row.map(() => []));
    subs[1][1] = [TileSubtype.STEPPING_STONE];
    subs[1][3] = [TileSubtype.PLAYER];
    const stone = new Enemy({ y: 1, x: 1 });
    stone.kind = "stone-goblin";
    const state = baseState(tiles, subs, { enemies: [stone] });

    const next = movePlayer(state, Direction.DOWN);

    expect(next.enemies).toHaveLength(0);
    expect(next.stats.enemiesDefeated).toBe(1);
    // The stone gave way under his weight: the crossing is deep water again.
    expect(next.mapData.subtypes[1][1]).toContain(TileSubtype.DEEP_WATER);
    expect(next.mapData.subtypes[1][1]).not.toContain(TileSubtype.STEPPING_STONE);
    expect(next.recentDeaths).toContainEqual([1, 1]);
  });

  test("everyone else crosses stepping stones safely", () => {
    const tiles = [
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 0],
      [1, 1, 1, 0, 1],
      [1, 1, 1, 1, 1],
    ];
    const subs: number[][][] = tiles.map((row) => row.map(() => []));
    subs[1][1] = [TileSubtype.STEPPING_STONE];
    subs[1][3] = [TileSubtype.PLAYER];
    const swimmer = new Enemy({ y: 1, x: 1 });
    swimmer.kind = "water-goblin";
    const state = baseState(tiles, subs, { enemies: [swimmer] });

    const next = movePlayer(state, Direction.DOWN);

    expect(next.enemies).toHaveLength(1); // alive and well
    expect(next.mapData.subtypes[1][1]).toContain(TileSubtype.STEPPING_STONE);
  });

  test("bombs: doused dud in deep water; blast evaporates shallow and downgrades deep", () => {
    // Dud: bomb thrown right rests on the deep tile and never arms.
    const dudTiles = [
      [1, 1, 1],
      [0, 0, 1],
      [1, 1, 1],
    ];
    const dudSubs: number[][][] = dudTiles.map((row) => row.map(() => []));
    dudSubs[1][0] = [TileSubtype.PLAYER];
    dudSubs[1][1] = [TileSubtype.DEEP_WATER];
    const dudState = baseState(dudTiles, dudSubs, { bombCount: 2 });
    const dud = performThrowBomb(dudState);
    const anyLive = dud.mapData.subtypes.flat().some((s) => s.includes(TileSubtype.BOMB_LIVE));
    expect(anyLive).toBe(false);
    expect(dud.bombCount).toBe(1);

    // Blast transforms: live bomb with shallow + deep neighbors.
    const tiles = openGrid(5);
    const subs = emptySubs(5);
    subs[0][0] = [TileSubtype.PLAYER];
    subs[2][2] = [TileSubtype.BOMB_LIVE];
    subs[2][3] = [TileSubtype.SHALLOW_WATER];
    subs[3][2] = [TileSubtype.DEEP_WATER];
    const state = baseState(tiles, subs);
    const boomed = detonateLiveBombs(state);

    const evaporated = boomed.mapData.subtypes[2][3];
    expect(evaporated).not.toContain(TileSubtype.SHALLOW_WATER);
    expect(evaporated).not.toContain(TileSubtype.SINGED); // steam, not scorch

    const downgraded = boomed.mapData.subtypes[3][2];
    expect(downgraded).toContain(TileSubtype.SHALLOW_WATER);
    expect(downgraded).not.toContain(TileSubtype.DEEP_WATER);
    expect(downgraded).not.toContain(TileSubtype.SINGED);
  });

  test("floor-2 maps with lava + water keep a dry path; most pools carry a shallow shore", () => {
    let sawDeep = 0;
    let sawShallow = 0;
    for (let seed = 0; seed < 25; seed++) {
      const map = generateCompleteMapForFloor(
        { chests: 2, keys: 2, chestContents: [TileSubtype.SWORD, TileSubtype.SHIELD] },
        2,
        { includeLava: true, includeWater: true }
      );
      const h = map.tiles.length;
      const w = map.tiles[0].length;
      const testGrid = map.tiles.map((row) => [...row]);
      let deepCount = 0;
      let shallowCount = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const subs = map.subtypes[y][x];
          if (
            subs.includes(TileSubtype.DEEP_WATER) ||
            subs.includes(TileSubtype.LAVA) ||
            subs.includes(TileSubtype.FAULTY_FLOOR) ||
            subs.includes(TileSubtype.OPEN_ABYSS)
          ) {
            testGrid[y][x] = 1;
          }
          if (subs.includes(TileSubtype.DEEP_WATER)) deepCount++;
          if (subs.includes(TileSubtype.SHALLOW_WATER)) shallowCount++;
          if (subs.includes(TileSubtype.DEEP_WATER) || subs.includes(TileSubtype.SHALLOW_WATER)) {
            expect(subs).not.toContain(TileSubtype.EXIT);
            expect(subs).not.toContain(TileSubtype.EXITKEY);
            expect(subs).not.toContain(TileSubtype.LAVA);
          }
        }
      }
      // Every hazard walled: the dry path must survive.
      expect(areAllFloorsConnected(testGrid)).toBe(true);
      if (deepCount > 0) {
        sawDeep++;
        if (shallowCount > 0) sawShallow++;
        expect(deepCount).toBeLessThanOrEqual(4); // budget respected
      }
    }
    // The pool placement retries 8 seeds per floor; across 25 floors it should
    // essentially always land. Require a strong majority to catch regressions.
    expect(sawDeep).toBeGreaterThanOrEqual(20);
    // Pools cut their shore on 0-2 sides, so a rare pool can be all hard banks —
    // but the majority should still carry some shallow shoreline.
    expect(sawShallow).toBeGreaterThanOrEqual(Math.floor(sawDeep * 0.6));
  });
});
