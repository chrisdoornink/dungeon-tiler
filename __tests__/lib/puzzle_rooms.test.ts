import { PUZZLE_ROOMS, parsePuzzleRoom, describeRoom } from "../../lib/puzzles/rooms";
import { Direction, TileSubtype } from "../../lib/map/constants";
import { platformTile } from "../../lib/map/machinery";
import { movePlayer, performWait, type GameState } from "../../lib/map/game-state";
import { createEmptyByKind } from "../../lib/enemies/registry";

/**
 * Authored rooms have no generator to prove them correct, so the parser's invariants are the only
 * thing standing between a typo and a room that silently cannot be finished.
 */
describe("puzzle rooms", () => {
  it("every room parses", () => {
    for (const spec of PUZZLE_ROOMS) {
      const room = parsePuzzleRoom(spec);
      expect(room.hero).toBeDefined();
      expect(describeRoom(room)).toMatch(/platform/);
    }
  });

  it("every room has a hero, an exit, and a way to finish", () => {
    for (const spec of PUZZLE_ROOMS) {
      const room = parsePuzzleRoom(spec);
      const flat = room.mapData.subtypes.flat();
      expect(flat.filter((c) => c.includes(TileSubtype.PLAYER))).toHaveLength(1);
      expect(flat.filter((c) => c.includes(TileSubtype.EXIT))).toHaveLength(1);
    }
  });

  it("every platform starts on its own track with a slab drawn on it", () => {
    for (const spec of PUZZLE_ROOMS) {
      const room = parsePuzzleRoom(spec);
      for (const p of room.platforms) {
        expect(p.track.length).toBeGreaterThanOrEqual(2);
        const at = platformTile(p)!;
        expect(p.track).toContainEqual(at);
        expect(room.mapData.subtypes[at[0]][at[1]]).toContain(TileSubtype.MOVING_PLATFORM);
        for (const [ty, tx] of p.track) {
          expect(room.mapData.subtypes[ty][tx]).toContain(TileSubtype.PLATFORM_TRACK);
        }
      }
    }
  });

  it("every switch is wired to beds and platforms that exist", () => {
    for (const spec of PUZZLE_ROOMS) {
      const room = parsePuzzleRoom(spec);
      const ids = new Set(room.platforms.map((p) => p.id));
      for (const g of room.toggleGroups) {
        expect(room.mapData.subtypes[g.switchAt[0]][g.switchAt[1]]).toContain(
          TileSubtype.TOGGLE_SWITCH
        );
        for (const [gy, gx] of [...g.gates, ...g.invertedGates]) {
          const cell = room.mapData.subtypes[gy][gx];
          expect(
            cell.includes(TileSubtype.SPIKES) || cell.includes(TileSubtype.SPIKE_HOLES)
          ).toBe(true);
        }
        for (const id of g.platforms) expect(ids.has(id)).toBe(true);
      }
    }
  });

  it("a switch authored ON starts with its beds already in the matching state", () => {
    // Otherwise the room contradicts its own wiring: the lever reads thrown while the bed it
    // controls is still up, and the first throw appears to do nothing.
    for (const spec of PUZZLE_ROOMS) {
      const room = parsePuzzleRoom(spec);
      for (const g of room.toggleGroups) {
        if (!g.on) continue;
        for (const [gy, gx] of g.gates) {
          expect(room.mapData.subtypes[gy][gx]).toContain(TileSubtype.SPIKE_HOLES);
        }
        for (const [gy, gx] of g.invertedGates) {
          expect(room.mapData.subtypes[gy][gx]).toContain(TileSubtype.SPIKES);
        }
      }
    }
  });

  it("rejects a switch wired to nothing", () => {
    expect(() =>
      parsePuzzleRoom({
        name: "bad",
        asks: "-",
        map: ["#####", "#H.T#", "#...#", "#..E#", "#####"],
        trackOver: "lava",
        toggles: [{ switchAt: [1, 3], gates: [[2, 2]] }],
      })
    ).toThrow(/no spike bed/);
  });

  it("rejects a one-tile platform track", () => {
    expect(() =>
      parsePuzzleRoom({
        name: "bad",
        asks: "-",
        map: ["#####", "#H.1#", "#...#", "#..E#", "#####"],
        trackOver: "lava",
      })
    ).toThrow(/at least 2 track tiles/);
  });

  it("rejects a ragged map", () => {
    expect(() =>
      parsePuzzleRoom({
        name: "bad",
        asks: "-",
        trackOver: "lava",
        map: ["#####", "#H.#", "#####"],
      })
    ).toThrow(/rows must all be/);
  });
});

/**
 * Scripted walkthroughs. Authored rooms have no solver behind them, so "is this finishable" is
 * otherwise just an assumption — and the geometry mistakes that break a room (a rail that does not
 * span its hazard, a bed wired to the wrong side) all present as a room that looks fine and cannot
 * be completed.
 */
describe("walkthroughs", () => {
  function load(name: string) {
    const spec = PUZZLE_ROOMS.find((r) => r.name === name)!;
    expect(spec).toBeDefined();
    const room = parsePuzzleRoom(spec);
    const state: GameState = {
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
      rockCount: room.rocks,
      runeCount: 0,
      foodCount: 0,
      potionCount: 0,
      mapData: room.mapData,
      toggleGroups: room.toggleGroups,
      platforms: room.platforms,
      stats: {
        damageDealt: 0,
        damageTaken: 0,
        enemiesDefeated: 0,
        steps: 0,
        byKind: createEmptyByKind(),
      },
    } as unknown as GameState;
    return state;
  }

  function at(state: GameState): [number, number] {
    for (let y = 0; y < state.mapData.subtypes.length; y++) {
      for (let x = 0; x < state.mapData.subtypes[y].length; x++) {
        if (state.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x];
      }
    }
    throw new Error("hero not on the map");
  }

  /** Walk `n` steps in a direction, failing loudly if the hero dies on the way. */
  function go(state: GameState, dir: Direction, n = 1): GameState {
    let s = state;
    for (let i = 0; i < n; i++) {
      s = movePlayer(s, dir);
      expect(s.heroHealth).toBeGreaterThan(0);
    }
    return s;
  }

  /**
   * Wait until a slab is standing on `tile`, then hand back the state so the caller can board.
   *
   * This exists because boarding is a TIMING problem, which is the whole substance of the
   * mechanic: the slab keeps cycling while the hero walks over to it, so you cannot simply arrive
   * and step on. Every one of these walkthroughs failed on the first attempt for exactly that
   * reason, which is a good sign for the mechanic and was a bad sign for the test.
   */
  function waitForSlab(
    state: GameState,
    id: string,
    tile: [number, number],
    maxTurns = 16
  ): GameState {
    let s = state;
    for (let i = 0; i <= maxTurns; i++) {
      const p = s.platforms!.find((pp) => pp.id === id)!;
      const where = platformTile(p)!;
      if (where[0] === tile[0] && where[1] === tile[1]) return s;
      s = performWait(s);
      expect(s.heroHealth).toBeGreaterThan(0);
    }
    throw new Error(`slab ${id} never reached ${tile} within ${maxTurns} turns`);
  }

  it("The Ferry can be crossed and finished", () => {
    let s = load("The Ferry");
    expect(at(s)).toEqual([1, 1]);

    // Grab the key on the near bank, then line up above the rail at column 5.
    s = go(s, Direction.RIGHT, 8);
    expect(s.hasExitKey).toBe(true);
    s = go(s, Direction.LEFT, 4);
    s = go(s, Direction.DOWN, 1);
    expect(at(s)).toEqual([2, 5]);

    // Wait for the slab to come back to the near end of the rail, THEN step on. Arriving and
    // stepping straight down walks into the lava the slab has already left.
    s = waitForSlab(s, "1", [3, 5]);
    s = go(s, Direction.DOWN, 1);
    // Boarding costs a turn, so the slab carries the hero one tile on the same move.
    expect(at(s)).toEqual([4, 5]);
    expect(s.heroHealth).toBe(5);

    // One more wait carries them to the far end of the rail.
    s = performWait(s);
    expect(at(s)).toEqual([5, 5]);

    // Off onto the far bank, then to the exit.
    s = go(s, Direction.DOWN, 2);
    expect(at(s)).toEqual([7, 5]);
    s = go(s, Direction.RIGHT, 4);
    expect(s.win).toBe(true);
  });

  it("The Ferry kills a hero who walks into the lava beside the rail", () => {
    // Proves the rail is the only way across, i.e. that track tiles really carry their hazard.
    let s = load("The Ferry");
    s = go(s, Direction.RIGHT, 3);
    s = go(s, Direction.DOWN, 1);
    const dead = movePlayer(s, Direction.DOWN);
    expect(dead.heroHealth).toBe(0);
    expect(dead.deathCause?.type).toBe("lava");
  });

  it("The Trade needs the switch thrown twice, in order", () => {
    let s = load("The Trade");
    expect(at(s)).toEqual([1, 1]);

    // As it starts: the left bed is UP over the key, the right bed is DOWN over the exit.
    expect(s.mapData.subtypes[3][2]).toContain(TileSubtype.SPIKES);
    expect(s.mapData.subtypes[3][10]).toContain(TileSubtype.SPIKE_HOLES);

    // Throw the switch: the key opens and the exit closes. That trade is the room.
    s = go(s, Direction.RIGHT, 3);
    expect(s.toggleGroups![0].on).toBe(true);
    expect(s.mapData.subtypes[3][2]).toContain(TileSubtype.SPIKE_HOLES);
    expect(s.mapData.subtypes[3][10]).toContain(TileSubtype.SPIKES);

    // Fetch the key through the now-open left bed.
    s = go(s, Direction.LEFT, 2);
    s = go(s, Direction.DOWN, 3);
    expect(at(s)).toEqual([4, 2]);
    expect(s.hasExitKey).toBe(true);

    // Back up to the switch and throw it again to reopen the exit side. The switch is at (1,4),
    // so the hero has to actually step onto that tile again — leaving and returning is how a
    // toggle is re-thrown.
    s = go(s, Direction.UP, 3);
    s = go(s, Direction.RIGHT, 2);
    s = go(s, Direction.UP, 1);
    expect(at(s)).toEqual([1, 4]);
    expect(s.toggleGroups![0].on).toBe(false);
    expect(s.mapData.subtypes[3][10]).toContain(TileSubtype.SPIKE_HOLES);

    // Cross to the exit.
    s = go(s, Direction.DOWN, 1);
    s = go(s, Direction.RIGHT, 6);
    s = go(s, Direction.DOWN, 2);
    expect(at(s)).toEqual([4, 10]);
    expect(s.win).toBe(true);
  });

  it("The Raft can be crossed dry, or swum wet", () => {
    // Riding keeps the torch; swimming the same channel does not. That contrast IS the room.
    let dry = load("The Raft");
    dry = go(dry, Direction.RIGHT, 5);
    dry = go(dry, Direction.DOWN, 1);
    expect(at(dry)).toEqual([2, 6]);
    dry = waitForSlab(dry, "4", [3, 6]);
    dry = go(dry, Direction.DOWN, 1);
    expect(dry.heroTorchLit).toBe(true);
    dry = performWait(dry);
    expect(dry.heroTorchLit).toBe(true);
    // Still dry all the way to the far bank.
    dry = go(dry, Direction.DOWN, 1);
    expect(dry.heroTorchLit).toBe(true);

    // The same channel, swum two columns over: the torch goes out. That contrast is the room.
    let wet = load("The Raft");
    wet = go(wet, Direction.RIGHT, 2);
    wet = go(wet, Direction.DOWN, 2);
    expect(at(wet)).toEqual([3, 3]);
    expect(wet.heroTorchLit).toBe(false);
  });
});
