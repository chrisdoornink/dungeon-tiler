import {
  Direction,
  TileSubtype,
  type GameState,
  performThrowBomb,
  detonateLiveBombs,
  movePlayer,
  BOMB_PACK_SIZE,
} from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { Enemy } from "../../lib/enemy";

/** Build an all-floor square arena of the given size with the player at [py,px]. */
function makeArena(size: number, py: number, px: number): MapData {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < size; y++) {
    tiles.push(new Array(size).fill(FLOOR));
    subtypes.push(Array.from({ length: size }, () => [] as number[]));
  }
  subtypes[py][px] = [TileSubtype.PLAYER];
  return { tiles, subtypes };
}

function baseState(mapData: MapData, overrides: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    bombCount: 1,
    heroTorchLit: true,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
    ...overrides,
  };
}

function findPlayer(map: MapData): [number, number] {
  for (let y = 0; y < map.subtypes.length; y++) {
    for (let x = 0; x < map.subtypes[y].length; x++) {
      if (map.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x];
    }
  }
  throw new Error("player not found");
}

describe("Bomb throwing - placement and fuse", () => {
  it("rests on the floor tile adjacent to a wall and arms a live bomb", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][8] = WALL; // wall 3 tiles to the right
    const state = baseState(map, { playerDirection: Direction.RIGHT });

    const after = performThrowBomb(state);

    expect(after.bombCount).toBe(0);
    expect(after.stats.bombsThrown).toBe(1);
    // Player did not move.
    expect(findPlayer(after.mapData)).toEqual([5, 5]);
    // Live bomb rests on (5,7), the floor tile just before the wall.
    expect(after.mapData.subtypes[5][7]).toContain(TileSubtype.BOMB_LIVE);
    // It does NOT detonate on the throw turn.
    expect(after.mapData.tiles[5][8]).toBe(WALL);
  });

  it("stops in front of an enemy instead of passing through it", () => {
    const map = makeArena(12, 5, 5);
    const enemy = new Enemy({ y: 5, x: 6 }); // directly ahead, adjacent (can't advance onto player)
    enemy.kind = "fire-goblin";
    const thrown = performThrowBomb(
      baseState(map, { playerDirection: Direction.RIGHT, enemies: [enemy] })
    );
    // The bomb must not pass through the enemy: no live bomb on or beyond the enemy tile.
    for (let x = 6; x < 12; x++) {
      expect(thrown.mapData.subtypes[5][x]).not.toContain(TileSubtype.BOMB_LIVE);
    }
    // It rests on the tile in front of the enemy (here the player's own tile).
    expect(thrown.mapData.subtypes[5][5]).toContain(TileSubtype.BOMB_LIVE);
  });

  it("does nothing when bombCount is 0", () => {
    const map = makeArena(12, 5, 5);
    const state = baseState(map, { bombCount: 0 });
    const after = performThrowBomb(state);
    expect(after.bombCount).toBe(0);
    expect(after.stats.bombsThrown ?? 0).toBe(0);
    let live = 0;
    for (const row of after.mapData.subtypes)
      for (const cell of row) if (cell.includes(TileSubtype.BOMB_LIVE)) live++;
    expect(live).toBe(0);
  });
});

describe("Bomb detonation - 3x3 blast", () => {
  it("turns walls to floor, scorches tiles, and clears the live bomb", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][8] = WALL;
    const thrown = performThrowBomb(baseState(map, { playerDirection: Direction.RIGHT }));
    // Bomb resting at (5,7); detonate it.
    const blown = detonateLiveBombs(thrown);

    expect(blown.mapData.tiles[5][8]).toBe(FLOOR); // wall destroyed
    expect(blown.stats.wallsDestroyed).toBe(1);
    // Live bomb consumed.
    expect(blown.mapData.subtypes[5][7]).not.toContain(TileSubtype.BOMB_LIVE);
    // The whole 3x3 around (5,7) is scorched.
    for (let y = 4; y <= 6; y++)
      for (let x = 6; x <= 8; x++)
        expect(blown.mapData.subtypes[y][x]).toContain(TileSubtype.SINGED);
    // Blast recorded for VFX.
    expect(blown.recentBombBlasts).toContainEqual([5, 7]);
  });

  it("removes a mounted wall torch when its wall is blasted to floor", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][8] = WALL;
    map.subtypes[5][8] = [TileSubtype.WALL_TORCH];
    const thrown = performThrowBomb(baseState(map, { playerDirection: Direction.RIGHT }));
    const blown = detonateLiveBombs(thrown);

    expect(blown.mapData.tiles[5][8]).toBe(FLOOR); // wall destroyed
    // The mounted torch must not linger on the now-open floor tile.
    expect(blown.mapData.subtypes[5][8]).not.toContain(TileSubtype.WALL_TORCH);
    // Hero can now walk onto the tile (a lingering torch would block it).
    const stepped = movePlayer(
      { ...blown, playerDirection: Direction.RIGHT },
      Direction.RIGHT
    );
    // Player started at (5,5); after three rightward steps they should reach (5,8).
    let s = stepped;
    for (let i = 0; i < 2; i++) s = movePlayer(s, Direction.RIGHT);
    expect(findPlayer(s.mapData)).toEqual([5, 8]);
  });

  it("detonates automatically on the player's next turn", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][8] = WALL;
    const thrown = performThrowBomb(baseState(map, { playerDirection: Direction.RIGHT }));
    // Player takes another turn (move up, away from the blast).
    const next = movePlayer(thrown, Direction.UP);
    expect(next.mapData.tiles[5][8]).toBe(FLOOR);
  });

  it("never destroys the exit door or exit key", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][7] = WALL;
    map.subtypes[5][7] = [TileSubtype.EXIT]; // exit door wall, adjacent
    map.subtypes[6][6] = [TileSubtype.EXITKEY]; // exit key on floor, in blast
    const thrown = performThrowBomb(
      baseState(map, { playerDirection: Direction.RIGHT })
    );
    // Bomb rests at (5,6); blast covers (5,7) and (6,6).
    expect(thrown.mapData.subtypes[5][6]).toContain(TileSubtype.BOMB_LIVE);
    const blown = detonateLiveBombs(thrown);

    expect(blown.mapData.tiles[5][7]).toBe(WALL); // exit door survives
    expect(blown.mapData.subtypes[5][7]).toContain(TileSubtype.EXIT);
    expect(blown.mapData.subtypes[6][6]).toContain(TileSubtype.EXITKEY);
  });

  it("destroys enemies caught in the blast", () => {
    // Place a live bomb directly so the detonation is isolated from enemy AI movement.
    const map = makeArena(12, 5, 5);
    map.subtypes[5][7] = [TileSubtype.BOMB_LIVE];
    const enemy = new Enemy({ y: 5, x: 6 }); // inside the 3x3 around (5,7)
    enemy.kind = "fire-goblin";
    const blown = detonateLiveBombs(
      baseState(map, { enemies: [enemy], bombCount: 0 })
    );
    expect(blown.enemies?.length ?? 0).toBe(0);
    expect(blown.stats.enemiesDefeated).toBe(1);
  });

  it("damages the hero if caught in the blast", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][6] = WALL; // wall immediately to the right -> bomb rests at player's feet
    const thrown = performThrowBomb(
      baseState(map, { playerDirection: Direction.RIGHT, heroHealth: 5 })
    );
    expect(thrown.mapData.subtypes[5][5]).toContain(TileSubtype.BOMB_LIVE);
    const blown = detonateLiveBombs(thrown);
    expect(blown.heroHealth).toBeLessThan(5);
  });

  it("records a dedicated 'bomb' death cause (never an enemy kind) when it kills the hero", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][6] = WALL; // bomb rests at the player's feet
    const thrown = performThrowBomb(
      baseState(map, { playerDirection: Direction.RIGHT, heroHealth: 2 })
    );
    const blown = detonateLiveBombs(thrown);
    expect(blown.heroHealth).toBe(0);
    // Must be a dedicated type, not { type: "enemy", enemyKind: "bomb" } which would
    // crash the daily completion screen (EnemyRegistry has no "bomb").
    expect(blown.deathCause).toEqual({ type: "bomb" });
  });
});

describe("Bomb blast - fixed damage values", () => {
  it("deals 6 damage to the hero (4 with a shield)", () => {
    const map = makeArena(12, 5, 5);
    map.subtypes[5][6] = [TileSubtype.BOMB_LIVE]; // player at (5,5) is in the 3x3
    const noShield = detonateLiveBombs(
      baseState(map, { heroHealth: 9, heroMaxHealth: 9, bombCount: 0 })
    );
    expect(noShield.heroHealth).toBe(3); // 9 - 6

    const map2 = makeArena(12, 5, 5);
    map2.subtypes[5][6] = [TileSubtype.BOMB_LIVE];
    const withShield = detonateLiveBombs(
      baseState(map2, { heroHealth: 9, heroMaxHealth: 9, hasShield: true, bombCount: 0 })
    );
    expect(withShield.heroHealth).toBe(5); // 9 - 4
  });

  it("a stone goblin (8 HP) is destroyed by a single bomb", () => {
    const map = makeArena(12, 5, 5);
    map.subtypes[5][6] = [TileSubtype.BOMB_LIVE];
    const goblin = new Enemy({ y: 5, x: 5 }); // in the 3x3
    goblin.kind = "stone-goblin";
    const blown = detonateLiveBombs(baseState(map, { enemies: [goblin], bombCount: 0 }));
    expect(blown.enemies?.length).toBe(0); // 8 damage kills its 8 HP outright
  });
});

describe("Bomb dodge - blast measured at the post-move position", () => {
  it("lets the hero step out of the 3x3 to avoid the blast", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][7] = WALL;
    const thrown = performThrowBomb(
      baseState(map, { playerDirection: Direction.RIGHT, heroHealth: 5 })
    );
    // Bomb rests at (5,6); player at (5,5). Move LEFT to (5,4) -> out of the blast.
    const after = movePlayer(thrown, Direction.LEFT);
    expect(after.heroHealth).toBe(5); // dodged, no damage
    expect(after.mapData.tiles[5][7]).toBe(FLOOR); // the bomb still detonated
    let live = 0;
    for (const row of after.mapData.subtypes)
      for (const cell of row) if (cell.includes(TileSubtype.BOMB_LIVE)) live++;
    expect(live).toBe(0);
  });

  it("still hits the hero if they end the move inside the 3x3", () => {
    const map = makeArena(12, 5, 5);
    map.tiles[5][7] = WALL;
    const thrown = performThrowBomb(
      baseState(map, { playerDirection: Direction.RIGHT, heroHealth: 9, heroMaxHealth: 9 })
    );
    // Bomb at (5,6); move UP to (4,5) -> still in the 3x3 (rows 4-6, cols 5-7).
    const after = movePlayer(thrown, Direction.UP);
    expect(after.heroHealth).toBe(3); // 9 - 6
  });
});

describe("Bomb pickup", () => {
  it("grants a three-pack when collected", () => {
    const map = makeArena(12, 5, 5);
    map.subtypes[5][6] = [TileSubtype.BOMB]; // revealed bomb to the right
    const state = baseState(map, { bombCount: 0, playerDirection: Direction.RIGHT });
    const after = movePlayer(state, Direction.RIGHT);
    expect(after.bombCount).toBe(BOMB_PACK_SIZE);
    expect(after.mapData.subtypes[5][6]).not.toContain(TileSubtype.BOMB);
  });
});

describe("Outside world breach", () => {
  it("marks a BREACH when an outer wall is destroyed", () => {
    const size = 10;
    const map = makeArena(size, 4, size - 3);
    // Single outer wall on the right edge; (4,size-2) stays floor so the bomb rests
    // there and the blast reaches the perimeter wall.
    map.tiles[4][size - 1] = WALL;
    const thrown = performThrowBomb(
      baseState(map, { playerDirection: Direction.RIGHT })
    );
    const blown = detonateLiveBombs(thrown);
    // The perimeter wall opened by the blast is marked as a breach.
    expect(blown.mapData.subtypes[4][size - 1]).toContain(TileSubtype.BREACH);
    expect(blown.mapData.tiles[4][size - 1]).toBe(FLOOR);
  });

  it("steps into the outside world and walks back into the dungeon", () => {
    const size = 10;
    const map = makeArena(size, 4, size - 1);
    // Player is on the right-edge breach tile.
    map.subtypes[4][size - 1] = [TileSubtype.PLAYER, TileSubtype.BREACH];
    const state = baseState(map, { playerDirection: Direction.RIGHT, bombCount: 0 });

    const outside = movePlayer(state, Direction.RIGHT);
    expect(outside.inOutsideWorld).toBe(true);
    expect(outside.mapData.environment).toBe("outdoor");
    // Stone goblins await out there.
    expect((outside.enemies ?? []).some((e) => e.kind === "stone-goblin")).toBe(true);
    expect(outside.dungeonReturn?.position).toEqual([4, size - 1]);

    // Walk to the inner breach (left edge) and back through it.
    const [py] = findPlayer(outside.mapData);
    const atEdge = movePlayer(outside, Direction.LEFT); // onto x=0 breach
    expect(findPlayer(atEdge.mapData)).toEqual([py, 0]);
    const back = movePlayer(atEdge, Direction.LEFT); // off the edge -> dungeon
    expect(back.inOutsideWorld).toBeFalsy();
    expect(findPlayer(back.mapData)).toEqual([4, size - 1]);
  });
});

describe("Bombs and the abyss", () => {
  it("a bomb thrown onto an open abyss drops in — no live bomb is armed", () => {
    const map = makeArena(12, 5, 5);
    // Open pit exactly at max range (4 tiles right); floor the rest of the way.
    map.subtypes[5][9] = [TileSubtype.OPEN_ABYSS];
    const after = performThrowBomb(baseState(map, { playerDirection: Direction.RIGHT }));

    // Bomb is spent and counted, but it fell into the pit: no live bomb anywhere.
    expect(after.bombCount).toBe(0);
    expect(after.stats.bombsThrown).toBe(1);
    let live = 0;
    for (const row of after.mapData.subtypes)
      for (const cell of row) if (cell.includes(TileSubtype.BOMB_LIVE)) live++;
    expect(live).toBe(0);
    // The abyss is untouched.
    expect(after.mapData.subtypes[5][9]).toContain(TileSubtype.OPEN_ABYSS);
  });

  it("a blast breaks a faulty (cracked) floor open into an abyss instead of scorching it", () => {
    const map = makeArena(12, 5, 5);
    map.subtypes[5][7] = [TileSubtype.BOMB_LIVE];
    map.subtypes[5][8] = [TileSubtype.FAULTY_FLOOR]; // cracked floor in the blast
    const blown = detonateLiveBombs(baseState(map, { bombCount: 0 }));

    // The cracked floor is now an open pit — and a pit can't be scorched.
    expect(blown.mapData.subtypes[5][8]).toContain(TileSubtype.OPEN_ABYSS);
    expect(blown.mapData.subtypes[5][8]).not.toContain(TileSubtype.FAULTY_FLOOR);
    expect(blown.mapData.subtypes[5][8]).not.toContain(TileSubtype.SINGED);
    // A plain floor tile in the blast is still just scorched (not turned into a pit).
    expect(blown.mapData.subtypes[5][6]).toContain(TileSubtype.SINGED);
    expect(blown.mapData.subtypes[5][6]).not.toContain(TileSubtype.OPEN_ABYSS);
  });

  it("a blast leaves an already-open abyss open, never filled or scorched", () => {
    const map = makeArena(12, 5, 5);
    map.subtypes[5][7] = [TileSubtype.BOMB_LIVE];
    map.subtypes[5][8] = [TileSubtype.OPEN_ABYSS];
    const blown = detonateLiveBombs(baseState(map, { bombCount: 0 }));

    expect(blown.mapData.subtypes[5][8]).toContain(TileSubtype.OPEN_ABYSS);
    expect(blown.mapData.subtypes[5][8]).not.toContain(TileSubtype.SINGED);
  });
});
