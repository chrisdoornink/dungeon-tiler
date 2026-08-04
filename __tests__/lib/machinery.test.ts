import {
  movePlayer,
  performThrowRockCore,
  performWait,
  type GameState,
} from "../../lib/map/game-state";
import { Direction, FLOOR, TileSubtype } from "../../lib/map/constants";
import type { MapData, Platform, ToggleGroup } from "../../lib/map/types";
import {
  advanceMachinery,
  nextPlatformTile,
  platformTile,
  stampPlatform,
  throwToggle,
} from "../../lib/map/machinery";
import { Enemy } from "../../lib/enemy";
import { createEmptyByKind } from "../../lib/enemies/registry";

/**
 * Toggle switches and moving platforms. The properties that matter are the ones a puzzle room
 * depends on being true every time: a toggle must be re-throwable, a platform must always come
 * back, and neither may ever kill the hero for something they could not see coming.
 */

function blankMap(h = 9, w = 9): MapData {
  return {
    tiles: Array.from({ length: h }, () => Array(w).fill(FLOOR)),
    subtypes: Array.from({ length: h }, () =>
      Array.from({ length: w }, () => [] as number[])
    ),
  };
}

function baseState(mapData: MapData, overrides: Partial<GameState> = {}): GameState {
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 0,
    runeCount: 0,
    foodCount: 0,
    potionCount: 0,
    mapData,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: createEmptyByKind(),
    },
    ...overrides,
  } as GameState;
}

function putHero(mapData: MapData, y: number, x: number): void {
  mapData.subtypes[y][x].push(TileSubtype.PLAYER);
}

function heroAt(state: GameState): [number, number] | null {
  for (let y = 0; y < state.mapData.subtypes.length; y++) {
    for (let x = 0; x < state.mapData.subtypes[y].length; x++) {
      if (state.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x];
    }
  }
  return null;
}

/** A 4-tile lava channel across row 4, with a slab that ferries columns 2..5. */
function lavaCrossing(): { state: GameState; platform: Platform } {
  const map = blankMap();
  for (let x = 2; x <= 5; x++) map.subtypes[4][x].push(TileSubtype.LAVA);
  const platform: Platform = {
    id: "ferry",
    track: [
      [4, 2],
      [4, 3],
      [4, 4],
      [4, 5],
    ],
    index: 0,
    dir: 1,
    running: true,
  };
  stampPlatform(map, platform);
  const state = baseState(map, { platforms: [platform] });
  return { state, platform };
}

describe("moving platforms", () => {
  it("stamps its whole track so the route is readable before you board", () => {
    const { state, platform } = lavaCrossing();
    for (const [ty, tx] of platform.track) {
      expect(state.mapData.subtypes[ty][tx]).toContain(TileSubtype.PLATFORM_TRACK);
    }
    expect(state.mapData.subtypes[4][2]).toContain(TileSubtype.MOVING_PLATFORM);
  });

  it("advances one tile per turn and ping-pongs instead of wrapping", () => {
    const { state } = lavaCrossing();
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const at = platformTile(state.platforms![0])!;
      seen.push(`${at[1]}`);
      advanceMachinery(state, null);
    }
    // Out to the far end, then back — never a jump from column 5 to column 2.
    expect(seen).toEqual(["2", "3", "4", "5", "4", "3", "2", "3"]);
  });

  it("keeps exactly one slab tile on the map as it moves", () => {
    const { state } = lavaCrossing();
    for (let i = 0; i < 10; i++) {
      const slabs = state.mapData.subtypes
        .flatMap((row, y) => row.map((cell, x) => ({ y, x, cell })))
        .filter(({ cell }) => cell.includes(TileSubtype.MOVING_PLATFORM));
      expect(slabs).toHaveLength(1);
      advanceMachinery(state, null);
    }
  });

  it("nextPlatformTile predicts the move without making it", () => {
    const { state } = lavaCrossing();
    const p = state.platforms![0];
    const predicted = nextPlatformTile(p);
    advanceMachinery(state, null);
    expect(platformTile(state.platforms![0])).toEqual(predicted);
  });

  it("carries the hero across lava without killing them", () => {
    const { state } = lavaCrossing();
    // Board the slab from the near bank. Boarding COSTS a turn, so the slab advances that same
    // turn and takes the hero with it — they step onto column 2 and end the turn on column 3.
    putHero(state.mapData, 3, 2);
    let s = movePlayer(state, Direction.DOWN);
    expect(heroAt(s)).toEqual([4, 3]);
    expect(s.heroHealth).toBe(5);

    // Ride it. Waiting is the only way to do this, which is why performWait exists.
    s = performWait(s);
    expect(heroAt(s)).toEqual([4, 4]);
    s = performWait(s);
    expect(heroAt(s)).toEqual([4, 5]);
    expect(s.heroHealth).toBe(5);

    // Step off onto the far bank.
    s = movePlayer(s, Direction.UP);
    expect(heroAt(s)).toEqual([3, 5]);
    expect(s.heroHealth).toBe(5);
  });

  it("puts the hero somewhere safe on the turn they board the slab they can see", () => {
    // The fairness property, and the one the first implementation got wrong: machinery used to
    // advance during the enemy phase, so the slab left before the hero's step resolved and
    // boarding a visible platform dropped them in the lava it had just vacated.
    const { state } = lavaCrossing();
    putHero(state.mapData, 3, 2);
    const s = movePlayer(state, Direction.DOWN);
    const at = heroAt(s)!;
    expect(s.mapData.subtypes[at[0]][at[1]]).toContain(TileSubtype.MOVING_PLATFORM);
    expect(s.heroHealth).toBe(5);
    expect(s.deathCause).toBeUndefined();
  });

  it("lets lava kill again the moment the slab has moved on", () => {
    const { state } = lavaCrossing();
    putHero(state.mapData, 3, 3);
    // The slab is at column 2; column 3 is bare lava under a track decal.
    const s = movePlayer(state, Direction.DOWN);
    expect(s.heroHealth).toBe(0);
    expect(s.deathCause?.type).toBe("lava");
  });

  it("keeps the torch lit while riding across deep water", () => {
    const map = blankMap();
    for (let x = 2; x <= 4; x++) map.subtypes[4][x].push(TileSubtype.DEEP_WATER);
    const platform: Platform = {
      id: "raft",
      track: [
        [4, 2],
        [4, 3],
        [4, 4],
      ],
      index: 0,
      dir: 1,
      running: true,
    };
    stampPlatform(map, platform);
    const state = baseState(map, { platforms: [platform] });
    putHero(map, 3, 2);

    let s = movePlayer(state, Direction.DOWN);
    expect(heroAt(s)).toEqual([4, 3]);
    // Swimming snuffs the torch; riding must not, or the slab is just a slower swim.
    expect(s.heroTorchLit).toBe(true);
    s = performWait(s);
    expect(heroAt(s)).toEqual([4, 4]);
    expect(s.heroTorchLit).toBe(true);
  });

  it("snuffs the torch if the hero swims the same channel instead", () => {
    const map = blankMap();
    for (let x = 2; x <= 4; x++) map.subtypes[4][x].push(TileSubtype.DEEP_WATER);
    const state = baseState(map);
    putHero(map, 3, 3);
    const s = movePlayer(state, Direction.DOWN);
    expect(heroAt(s)).toEqual([4, 3]);
    expect(s.heroTorchLit).toBe(false);
  });

  it("stalls rather than shoving anything off its destination", () => {
    const { state } = lavaCrossing();
    // Park the hero on the slab's next tile without them being aboard (authoring mistake).
    putHero(state.mapData, 4, 3);
    advanceMachinery(state, [9, 9]);
    expect(platformTile(state.platforms![0])).toEqual([4, 2]);
  });

  it("does not move while parked", () => {
    const { state } = lavaCrossing();
    state.platforms![0].running = false;
    advanceMachinery(state, null);
    expect(platformTile(state.platforms![0])).toEqual([4, 2]);
  });
});

/** A toggle at (1,1) that raises one bed and lowers another, plus a parked platform. */
function toggleRoom(): GameState {
  const map = blankMap();
  map.subtypes[1][1].push(TileSubtype.TOGGLE_SWITCH);
  // Bed A starts UP, bed B starts DOWN — throwing the switch trades one route for the other.
  map.subtypes[5][5].push(TileSubtype.SPIKES);
  map.subtypes[6][6].push(TileSubtype.SPIKE_HOLES);
  const group: ToggleGroup = {
    switchAt: [1, 1],
    gates: [[5, 5]],
    invertedGates: [[6, 6]],
    platforms: ["ferry"],
    on: false,
  };
  const platform: Platform = {
    id: "ferry",
    track: [
      [4, 2],
      [4, 3],
    ],
    index: 0,
    dir: 1,
    running: false,
  };
  return baseState(map, { toggleGroups: [group], platforms: [platform] });
}

describe("toggle switches", () => {
  it("flips its beds and never latches", () => {
    const state = toggleRoom();
    const occupied = new Set<string>();

    throwToggle(state, 1, 1, occupied);
    expect(state.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKE_HOLES);
    expect(state.mapData.subtypes[5][5]).not.toContain(TileSubtype.SPIKES);
    expect(state.toggleGroups![0].on).toBe(true);

    // Throw it again: back the other way. A PRESSURE_PLATE could never do this.
    throwToggle(state, 1, 1, occupied);
    expect(state.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKES);
    expect(state.toggleGroups![0].on).toBe(false);

    // And again, to be sure nothing is one-shot.
    throwToggle(state, 1, 1, occupied);
    expect(state.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKE_HOLES);
  });

  it("trades one route for another rather than only opening things", () => {
    const state = toggleRoom();
    throwToggle(state, 1, 1, new Set());
    // A went down, B came up: the switch is a choice, not a win.
    expect(state.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKE_HOLES);
    expect(state.mapData.subtypes[6][6]).toContain(TileSubtype.SPIKES);
  });

  it("starts and stops the platforms it is wired to", () => {
    const state = toggleRoom();
    expect(state.platforms![0].running).toBe(false);
    throwToggle(state, 1, 1, new Set());
    expect(state.platforms![0].running).toBe(true);
    throwToggle(state, 1, 1, new Set());
    expect(state.platforms![0].running).toBe(false);
  });

  it("NEVER raises a bed under the hero", () => {
    // The rule that keeps a toggle from feeling like a cheat: throwing a switch across the room
    // must not impale the hero for standing somewhere they had no reason to distrust.
    const state = toggleRoom();
    throwToggle(state, 1, 1, new Set()); // beds now: (5,5) down, (6,6) up
    state.mapData.subtypes[5][5].push(TileSubtype.PLAYER);
    throwToggle(state, 1, 1, new Set()); // would raise (5,5) back up
    expect(state.mapData.subtypes[5][5]).not.toContain(TileSubtype.SPIKES);
    expect(state.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKE_HOLES);
  });

  it("reports enemies crushed by a rising bed", () => {
    const state = toggleRoom();
    throwToggle(state, 1, 1, new Set()); // (5,5) down
    const { crushed } = throwToggle(state, 1, 1, new Set(["5,5"])); // raise it under an enemy
    expect(crushed).toEqual([[5, 5]]);
  });

  it("is thrown by walking onto it, and stays there to be thrown again", () => {
    const state = toggleRoom();
    putHero(state.mapData, 0, 1);

    const after = movePlayer(state, Direction.DOWN);
    expect(after.toggleGroups![0].on).toBe(true);
    expect(after.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKE_HOLES);
    // Unlike a latching plate, the switch keeps its own subtype and shares the tile with the
    // hero — that is what lets the player step off and back on to flip it again.
    expect(after.mapData.subtypes[1][1]).toContain(TileSubtype.TOGGLE_SWITCH);
    expect(after.mapData.subtypes[1][1]).toContain(TileSubtype.PLAYER);
  });

  it("kills an enemy that a rising bed catches", () => {
    // Driven through throwToggle rather than movePlayer on purpose: enemies act BEFORE the
    // player, so a mobile goblin has already stepped off the bed by the time a walked-on switch
    // fires. This is the stationary case the mechanic actually targets.
    const state = toggleRoom();
    throwToggle(state, 1, 1, new Set()); // (5,5) retracts
    const goblin = new Enemy({ y: 5, x: 5 });
    state.enemies = [goblin];
    const { crushed } = throwToggle(state, 1, 1, new Set(["5,5"]));
    expect(crushed).toEqual([[5, 5]]);
    expect(state.mapData.subtypes[5][5]).toContain(TileSubtype.SPIKES);
  });

  it("is thrown by a rock, repeatedly", () => {
    // A toggle on the far side of a hazard is operated entirely by rock. Unlike a latching
    // plate, the second throw has to work too.
    const state = toggleRoom();
    putHero(state.mapData, 1, 4);
    const s1 = performThrowRockCore({
      ...state,
      rockCount: 2,
      playerDirection: Direction.LEFT,
    });
    expect(s1.toggleGroups![0].on).toBe(true);
    expect(s1.rockCount).toBe(1);

    const s2 = performThrowRockCore({ ...s1, playerDirection: Direction.LEFT });
    expect(s2.toggleGroups![0].on).toBe(false);
    expect(s2.rockCount).toBe(0);
  });
});

describe("performWait", () => {
  it("costs a turn: steps tick and machinery advances", () => {
    const { state } = lavaCrossing();
    putHero(state.mapData, 0, 0);
    const before = state.stats.steps;
    const after = performWait(state);
    expect(after.stats.steps).toBe(before + 1);
    expect(platformTile(after.platforms![0])).toEqual([4, 3]);
  });

  it("does nothing once the hero is dead", () => {
    const { state } = lavaCrossing();
    const dead = { ...state, heroHealth: 0 };
    const after = performWait(dead);
    expect(platformTile(after.platforms![0])).toEqual([4, 2]);
  });
});
