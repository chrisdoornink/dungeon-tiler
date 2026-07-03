import {
  buildOutsideWorld,
  OUTSIDE_GOBLIN_COUNT,
  TREE_BORDER,
} from "../../lib/map/outside-world";
import { Direction, TREE, FLOOR, TileSubtype } from "../../lib/map/constants";
import { detonateLiveBombs, movePlayer, type GameState } from "../../lib/map";

// dungeon-facing (open) edge for each outward direction the player stepped
const innerFor = (d: Direction): "top" | "bottom" | "left" | "right" =>
  d === Direction.UP ? "bottom" : d === Direction.DOWN ? "top" : d === Direction.LEFT ? "right" : "left";

describe("buildOutsideWorld: thick indestructible tree boundary", () => {
  const W = 24;
  const H = 22;
  const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];

  it.each(dirs)("direction %s: 3 non-inner sides are TREE_BORDER trees thick, inner edge open", (dir) => {
    const { mapData, enemies, entry } = buildOutsideWorld(dir, W, H);
    const t = mapData.tiles;
    const inner = innerFor(dir);

    expect(TREE_BORDER).toBeGreaterThanOrEqual(3);

    // Every tile in the outer TREE_BORDER layers of a bounded side is a tree.
    for (let b = 0; b < TREE_BORDER; b++) {
      for (let x = 0; x < W; x++) {
        if (inner !== "top") expect(t[b][x]).toBe(TREE);
        if (inner !== "bottom") expect(t[H - 1 - b][x]).toBe(TREE);
      }
      for (let y = 0; y < H; y++) {
        if (inner !== "left") expect(t[y][b]).toBe(TREE);
        if (inner !== "right") expect(t[y][W - 1 - b]).toBe(TREE);
      }
    }

    // The inner (dungeon-facing) edge has a walkable breach opening.
    let breaches = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (mapData.subtypes[y][x].includes(TileSubtype.BREACH)) breaches++;
    expect(breaches).toBeGreaterThan(0);

    // Entry and all enemies sit on floor (never buried in the tree wall).
    expect(t[entry[0]][entry[1]]).toBe(FLOOR);
    expect(enemies.length).toBe(OUTSIDE_GOBLIN_COUNT);
    for (const e of enemies) expect(t[e.y][e.x]).toBe(FLOOR);
  });
});

describe("trees are destructible by bombs", () => {
  it("a bomb blast turns an adjacent tree into floor", () => {
    const size = 5;
    const tiles = Array.from({ length: size }, () => Array(size).fill(FLOOR));
    const subtypes = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => [] as number[])
    );
    tiles[2][3] = TREE; // a tree inside the 3x3 blast of a bomb at (2,2)
    subtypes[2][2] = [TileSubtype.BOMB_LIVE];
    subtypes[0][0] = [TileSubtype.PLAYER];

    const state = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: true,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [],
      heroHealth: 5,
      heroMaxHealth: 5,
      heroAttack: 1,
      heroTorchLit: true,
      mode: "normal",
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    } as unknown as GameState;

    const after = detonateLiveBombs(state);
    expect(after.mapData.tiles[2][3]).toBe(FLOOR); // tree blown to floor
    // Trees are counted separately (for the "blowing up trees outside" metric).
    expect(after.stats.treesDestroyed).toBe(1);
  });
});

describe("reachedOutsideWorld latches when breaching to the grassland", () => {
  it("stepping through a top-edge breach enters the outside world and sets the run flag", () => {
    const size = 8;
    const tiles = Array.from({ length: size }, () => Array(size).fill(FLOOR));
    const subtypes = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => [] as number[])
    );
    // Player standing on a breached top-edge tile, about to step out (UP).
    subtypes[0][4] = [TileSubtype.PLAYER, TileSubtype.BREACH];

    const state = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: true,
      win: false,
      playerDirection: Direction.UP,
      enemies: [],
      heroHealth: 5,
      heroMaxHealth: 5,
      heroAttack: 1,
      heroTorchLit: true,
      mode: "normal",
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      recentDeaths: [],
    } as unknown as GameState;

    expect(state.reachedOutsideWorld).toBeFalsy();
    const after = movePlayer(state, Direction.UP);
    expect(after.inOutsideWorld).toBe(true);
    expect(after.reachedOutsideWorld).toBe(true);
  });
});
