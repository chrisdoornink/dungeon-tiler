import { Enemy, updateEnemies, placeEnemies } from "../../lib/enemy";
import { TileSubtype, Direction } from "../../lib/map";
import {
  movePlayer,
  performThrowRock,
  performThrowRune,
  performThrowBomb,
} from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { addLavaPoolsToMap, generateCompleteMapForFloor } from "../../lib/map/map-features";
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
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

describe("Lava terrain (v1)", () => {
  test("player stepping into lava dies instantly with the 'lava' cause", () => {
    const tiles = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const subtypes = [
      [[], [TileSubtype.PLAYER], []],
      [[], [TileSubtype.LAVA], []],
      [[], [], []],
    ];
    const state = baseState(tiles, subtypes, { playerDirection: Direction.DOWN });

    const next = movePlayer(state, Direction.DOWN);

    expect(next.heroHealth).toBe(0);
    expect(next.deathCause?.type).toBe("lava");
    // Tile keeps its LAVA tag (a glowing wall) and the hero is rendered on it (dead).
    const dest = next.mapData.subtypes[1][1];
    expect(dest).toContain(TileSubtype.LAVA);
    expect(dest).toContain(TileSubtype.PLAYER);
  });

  test("obsidian (cooled lava) is safe, walkable floor", () => {
    const tiles = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const subtypes = [
      [[], [], []],
      [[TileSubtype.PLAYER], [TileSubtype.OBSIDIAN], []],
      [[], [], []],
    ];
    const state = baseState(tiles, subtypes, { playerDirection: Direction.RIGHT });

    const next = movePlayer(state, Direction.RIGHT);

    expect(next.heroHealth).toBe(5);
    expect(next.deathCause).toBeUndefined();
    const dest = next.mapData.subtypes[1][1];
    expect(dest).toContain(TileSubtype.PLAYER);
    expect(dest).toContain(TileSubtype.OBSIDIAN);
  });

  test("a thrown rock cools the lava tile into an obsidian stepping stone", () => {
    const tiles = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const subtypes = [
      [[], [], [], [], []],
      [[], [TileSubtype.PLAYER], [], [TileSubtype.LAVA], []],
      [[], [], [], [], []],
    ];
    const state = baseState(tiles, subtypes, { playerDirection: Direction.RIGHT, rockCount: 3 });

    const next = performThrowRock(state);

    const cooled = next.mapData.subtypes[1][3];
    expect(cooled).toContain(TileSubtype.OBSIDIAN);
    expect(cooled).not.toContain(TileSubtype.LAVA);
    expect(cooled).not.toContain(TileSubtype.ROCK); // it becomes the crossing, not a loose rock
    expect(next.rockCount).toBe(2);
  });

  test("a thrown rune drops on the last dry tile before lava (never lost in it)", () => {
    const tiles = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const subtypes = [
      [[], [], [], [], []],
      [[], [TileSubtype.PLAYER], [], [TileSubtype.LAVA], []],
      [[], [], [], [], []],
    ];
    const state = baseState(tiles, subtypes, { playerDirection: Direction.RIGHT, runeCount: 2 });

    const next = performThrowRune(state);

    // Rune rests on the dry tile before the lava, not on/in the lava.
    expect(next.mapData.subtypes[1][2]).toContain(TileSubtype.RUNE);
    expect(next.mapData.subtypes[1][3]).toContain(TileSubtype.LAVA);
    expect(next.mapData.subtypes[1][3]).not.toContain(TileSubtype.RUNE);
    expect(next.runeCount).toBe(1);
  });

  test("a bomb that would rest on lava fizzles — no live bomb is armed", () => {
    const tiles = [
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ];
    const subtypes = [
      [[], [], []],
      [[TileSubtype.PLAYER], [TileSubtype.LAVA], []],
      [[], [], []],
    ];
    const state = baseState(tiles, subtypes, { playerDirection: Direction.RIGHT, bombCount: 2 });

    const next = performThrowBomb(state);

    const anyLiveBomb = next.mapData.subtypes
      .flat()
      .some((subs) => subs.includes(TileSubtype.BOMB_LIVE));
    expect(anyLiveBomb).toBe(false);
    expect(next.bombCount).toBe(1);
  });

  test("stone goblins cross lava to reach the hero; other goblins refuse", () => {
    // 1-wide corridor: walls top/bottom, so the only path to the hero runs through lava.
    const grid = [
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
    ];
    const subtypes = [
      [[], [], [], [], []],
      [[], [], [TileSubtype.LAVA], [], []],
      [[], [], [], [], []],
    ];
    const player = { y: 1, x: 0 };

    const stone = new Enemy({ y: 1, x: 3 });
    stone.kind = "stone-goblin";
    updateEnemies(grid, subtypes, [stone], player, { rng: () => 0 });
    expect([stone.y, stone.x]).toEqual([1, 2]); // stepped onto the lava tile

    const fire = new Enemy({ y: 1, x: 3 });
    fire.kind = "fire-goblin";
    updateEnemies(grid, subtypes, [fire], player, { rng: () => 0 });
    expect(fire.x).toBe(3); // refused the lava; no other legal move, so it held position
  });

  test("placeEnemies never spawns an enemy on a hazard tile (abyss/faulty/lava)", () => {
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const subtypes = [
      [[TileSubtype.LAVA], [], [TileSubtype.OPEN_ABYSS]],
      [[], [TileSubtype.PLAYER], []],
      [[TileSubtype.FAULTY_FLOOR], [], [TileSubtype.LAVA]],
    ];
    const placed = placeEnemies({
      grid,
      subtypes,
      player: { y: 1, x: 1 },
      count: 8,
      minDistanceFromPlayer: 0,
      rng: () => 0.999,
    });

    const hazard = new Set([
      TileSubtype.LAVA,
      TileSubtype.OPEN_ABYSS,
      TileSubtype.FAULTY_FLOOR,
    ]);
    for (const e of placed) {
      const subs = subtypes[e.y][e.x];
      for (const h of hazard) expect(subs).not.toContain(h);
    }
    // Only the four non-hazard, non-player tiles are legal.
    expect(placed.length).toBeLessThanOrEqual(4);
  });

  test("addLavaPoolsToMap keeps every floor reachable (lava treated as walls)", () => {
    // A simple 12x12 room: solid wall border, open floor interior.
    const size = 12;
    const tiles: number[][] = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) =>
        y === 0 || x === 0 || y === size - 1 || x === size - 1 ? 1 : 0
      )
    );
    const subtypes: number[][][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => [] as number[])
    );
    // Mark exit + exit key so the halo-avoidance path is exercised.
    subtypes[1][1] = [TileSubtype.EXIT];
    subtypes[size - 2][size - 2] = [TileSubtype.EXITKEY];

    const withLava = addLavaPoolsToMap({ tiles, subtypes }, 2);

    // Some lava should have been carved into an open room.
    const lavaCount = withLava.subtypes
      .flat()
      .filter((subs) => subs.includes(TileSubtype.LAVA)).length;
    expect(lavaCount).toBeGreaterThan(0);
    expect(lavaCount).toBeLessThanOrEqual(8); // budget respected

    // Treating every lava tile as an impassable wall, the floor stays one region.
    const testGrid = withLava.tiles.map((row) => [...row]);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (withLava.subtypes[y][x].includes(TileSubtype.LAVA)) testGrid[y][x] = 1;
      }
    }
    expect(areAllFloorsConnected(testGrid)).toBe(true);
  });

  test("a snuffed torch relights when the hero moves into a lava tile's glow", () => {
    // 5x5 open floor; hero at (2,0) moves RIGHT to (2,1); lava at (2,2) is then
    // orthogonally adjacent — well inside the glow octagon. Dip the torch in.
    const tiles = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
    const subtypes: number[][][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => [] as number[])
    );
    subtypes[2][0] = [TileSubtype.PLAYER];
    subtypes[2][2] = [TileSubtype.LAVA];
    const state = baseState(tiles, subtypes, {
      playerDirection: Direction.RIGHT,
      heroTorchLit: false,
    });

    const next = movePlayer(state, Direction.RIGHT);

    expect(next.heroTorchLit).toBe(true);
  });

  test("the glow relight reaches the second ring but not the far corners", () => {
    // Second ring (offset (0,2)): hero ends at (2,1), lava at (2,3) -> relit.
    const tiles = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
    const mk = () =>
      Array.from({ length: 6 }, () =>
        Array.from({ length: 6 }, () => [] as number[])
      );

    const ringSubs = mk();
    ringSubs[2][0] = [TileSubtype.PLAYER];
    ringSubs[2][3] = [TileSubtype.LAVA];
    const ringNext = movePlayer(
      baseState(tiles, ringSubs, { playerDirection: Direction.RIGHT, heroTorchLit: false }),
      Direction.RIGHT
    );
    expect(ringNext.heroTorchLit).toBe(true);

    // Far corner (offset (2,2)) is excluded from the octagon: hero ends at (2,1),
    // lava at (4,3) -> stays snuffed.
    const cornerSubs = mk();
    cornerSubs[2][0] = [TileSubtype.PLAYER];
    cornerSubs[4][3] = [TileSubtype.LAVA];
    const cornerNext = movePlayer(
      baseState(tiles, cornerSubs, { playerDirection: Direction.RIGHT, heroTorchLit: false }),
      Direction.RIGHT
    );
    expect(cornerNext.heroTorchLit).toBe(false);
  });

  test("a full floor-2 map with includeLava places lava and never strands the key/exit", () => {
    // The live daily path: generateCompleteMapForFloor(..., 2, { includeLava: true }).
    // Exercised across many seeds; every one must keep the floor reachable with lava
    // AND every faulty floor walled off (the compounding-hazard connectivity guard).
    for (let seed = 0; seed < 25; seed++) {
      const map = generateCompleteMapForFloor(
        { chests: 2, keys: 2, chestContents: [TileSubtype.SWORD, TileSubtype.SHIELD] },
        2,
        { includeLava: true }
      );

      const h = map.tiles.length;
      const w = map.tiles[0].length;
      const testGrid = map.tiles.map((row) => [...row]);
      let lavaCount = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const subs = map.subtypes[y][x];
          if (
            subs.includes(TileSubtype.LAVA) ||
            subs.includes(TileSubtype.FAULTY_FLOOR) ||
            subs.includes(TileSubtype.OPEN_ABYSS)
          ) {
            testGrid[y][x] = 1;
          }
          if (subs.includes(TileSubtype.LAVA)) lavaCount++;
        }
      }
      // Lava must never sit on the exit or exit key tile.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const subs = map.subtypes[y][x];
          if (subs.includes(TileSubtype.LAVA)) {
            expect(subs).not.toContain(TileSubtype.EXIT);
            expect(subs).not.toContain(TileSubtype.EXITKEY);
          }
        }
      }
      expect(areAllFloorsConnected(testGrid)).toBe(true);
      expect(lavaCount).toBeLessThanOrEqual(8);
    }
  });
});
