import {
  Direction,
  TileSubtype,
  type GameState,
  movePlayer,
  performThrowBomb,
} from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { seedMist, advanceMist, mistContains, mistMax } from "../../lib/map/pink-mist";
import { Enemy } from "../../lib/enemy";

// Deterministic RNG so the organic grow/shrink is reproducible in tests.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function openMap(size: number): MapData {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < size; y++) {
    tiles.push(new Array(size).fill(FLOOR));
    subtypes.push(Array.from({ length: size }, () => [] as number[]));
  }
  return { tiles, subtypes };
}

function arena(size: number, py: number, px: number): MapData {
  const m = openMap(size);
  m.subtypes[py][px] = [TileSubtype.PLAYER];
  return m;
}

function baseState(map: MapData, overrides: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: map,
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
    ...overrides,
  };
}

describe("pink mist — generation", () => {
  it("seeds a small connected cluster of 1-8 walkable tiles", () => {
    const map = openMap(15);
    const mist = seedMist(map, seededRng(42));
    expect(mist.length).toBeGreaterThanOrEqual(1);
    expect(mist.length).toBeLessThanOrEqual(8);
    for (const [y, x] of mist) expect(map.tiles[y][x]).toBe(FLOOR);
  });

  it("never seeds onto walls", () => {
    const map = openMap(10);
    // Wall off the right half; mist must stay on floor.
    for (let y = 0; y < 10; y++) for (let x = 5; x < 10; x++) map.tiles[y][x] = WALL;
    for (let i = 0; i < 20; i++) {
      const mist = seedMist(map, seededRng(i + 1));
      for (const [y, x] of mist) expect(map.tiles[y][x]).toBe(FLOOR);
    }
  });

  it("mistMax is ~10% of walkable tiles with a floor of 8", () => {
    expect(mistMax(openMap(4))).toBe(8); // 16 tiles -> 1.6 rounded, floored to 8
    expect(mistMax(openMap(20))).toBe(40); // 400 tiles -> 40
  });
});

describe("pink mist — advance", () => {
  it("grows by at most 2 tiles per turn when below the cap, staying on floor", () => {
    const map = openMap(20);
    let mist = seedMist(map, seededRng(7));
    const rng = seededRng(99);
    for (let turn = 0; turn < 40; turn++) {
      const before = mist.length;
      mist = advanceMist(mist, map, rng);
      expect(Math.abs(mist.length - before)).toBeLessThanOrEqual(2);
      expect(mist.length).toBeLessThanOrEqual(mistMax(map));
      for (const [y, x] of mist) expect(map.tiles[y][x]).toBe(FLOOR);
    }
  });

  it("can shrink to nothing and later re-seed", () => {
    const map = openMap(12);
    // Force shrink: rng that always picks the shrink branch (returns high values).
    const shrinkRng = () => 0.99;
    let mist = seedMist(map, seededRng(3));
    for (let i = 0; i < 20; i++) mist = advanceMist(mist, map, shrinkRng);
    expect(mist.length).toBe(0); // faded out (0.99 >= 0.5 so no re-seed either)

    // A low-value rng re-seeds from empty.
    const reseed = advanceMist([], map, () => 0.1);
    expect(reseed.length).toBeGreaterThan(0);
  });

  it("mistContains reports membership", () => {
    expect(mistContains([[1, 2], [3, 4]], 3, 4)).toBe(true);
    expect(mistContains([[1, 2]], 9, 9)).toBe(false);
    expect(mistContains(undefined, 0, 0)).toBe(false);
  });
});

describe("pink mist — control reversal", () => {
  it("reverses the pressed direction while the hero stands in mist (in the realm)", () => {
    const map = arena(12, 5, 5);
    const state = baseState(map, { inPinkRealm: true, mist: [[5, 5]] });
    const after = movePlayer(state, Direction.UP); // reversed -> DOWN
    expect(after.mapData.subtypes[6][5]).toContain(TileSubtype.PLAYER);
    expect(after.mapData.subtypes[5][5]).not.toContain(TileSubtype.PLAYER);
  });

  it("does NOT reverse when the hero is off the mist", () => {
    const map = arena(12, 5, 5);
    const state = baseState(map, { inPinkRealm: true, mist: [[2, 2]] });
    const after = movePlayer(state, Direction.UP);
    expect(after.mapData.subtypes[4][5]).toContain(TileSubtype.PLAYER); // moved UP normally
  });

  it("does NOT reverse outside the pink realm even if a mist set is present", () => {
    const map = arena(12, 5, 5);
    const state = baseState(map, { inPinkRealm: false, mist: [[5, 5]] });
    const after = movePlayer(state, Direction.UP);
    expect(after.mapData.subtypes[4][5]).toContain(TileSubtype.PLAYER); // normal UP
  });
});

describe("pink mist — enemy blinding", () => {
  function goblinAt(y: number, x: number): Enemy {
    const e = new Enemy({ y, x });
    e.kind = "fire-goblin";
    return e;
  }

  // combatRng 0.5 -> +0 damage variance, so the goblin deals its base hit (not the
  // rng=0 case, which maps to -1 variance and 0 damage). Enemy sits to the LEFT and the
  // hero steps UP (perpendicular) so the move-away attack suppression doesn't fire.
  it("an enemy standing in mist cannot attack", () => {
    const map = arena(12, 5, 5);
    const enemy = goblinAt(5, 4); // adjacent on the left
    const state = baseState(map, {
      inPinkRealm: true,
      mist: [[5, 4]], // mist on the enemy's tile
      enemies: [enemy],
      combatRng: () => 0.5,
    });
    const after = movePlayer(state, Direction.UP); // player not on mist -> moves UP normally
    expect(after.heroHealth).toBe(5); // blinded enemy dealt no damage
  });

  it("the same adjacent enemy attacks when NOT in mist", () => {
    const map = arena(12, 5, 5);
    const enemy = goblinAt(5, 4);
    const state = baseState(map, {
      inPinkRealm: true,
      mist: [], // no mist
      enemies: [enemy],
      combatRng: () => 0.5,
    });
    const after = movePlayer(state, Direction.UP);
    expect(after.heroHealth).toBeLessThan(5); // took a hit
  });

  // Blinding must also hold on THROW turns (regression: it was wired only into movement).
  it("a thrown bomb does not let a mist-blinded enemy attack", () => {
    const map = arena(12, 5, 5);
    const enemy = goblinAt(5, 4); // adjacent on the left
    const state = baseState(map, {
      inPinkRealm: true,
      mist: [[5, 4]], // mist on the enemy's tile
      enemies: [enemy],
      bombCount: 1,
      combatRng: () => 0.5,
      playerDirection: Direction.RIGHT, // bomb flies away from the enemy
    });
    const after = performThrowBomb(state);
    expect(after.heroHealth).toBe(5); // blinded during the throw tick
  });

  it("a thrown bomb lets an un-misted enemy attack", () => {
    const map = arena(12, 5, 5);
    const enemy = goblinAt(5, 4);
    const state = baseState(map, {
      inPinkRealm: true,
      mist: [],
      enemies: [enemy],
      bombCount: 1,
      combatRng: () => 0.5,
      playerDirection: Direction.RIGHT,
    });
    const after = performThrowBomb(state);
    expect(after.heroHealth).toBeLessThan(5); // attacked during the throw tick
  });
});
