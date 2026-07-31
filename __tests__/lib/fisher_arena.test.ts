import { TileSubtype, Direction, FLOWERS, TREE } from "../../lib/map/constants";
import {
  movePlayer,
  performThrowRock,
  SPIKES_BUMP_DAMAGE,
  type GameState,
} from "../../lib/map/game-state";
import { findPlayerPosition } from "../../lib/map/player";
import {
  buildFisherArena,
  collapseFisherIntoBridge,
  FISHER_LAYOUTS,
  FISHER_ROCK_COUNT,
  SPIKE_MIN_Y,
  SPIKE_MAX_Y,
  HERO_SIDE_MIN_Y,
  BANK_MAX_Y,
  BANK_MIN_Y,
  POTION_POTS,
  FISH_ROW,
  EXIT_Y,
} from "../../lib/bosses/fisher_arena";
import { FISHER_HP, FISHER_SPEAR_RANGE } from "../../lib/bosses/fisher";

const FLOOR = 0;
/** The hero's rock-throw range — the number that decides whether they can reach the boss. */
const HERO_ROCK_RANGE = 4;

function seeded(): () => number {
  let s = 0.777;
  return () => {
    s = (s * 9301 + 0.49297) % 1;
    return s;
  };
}

function build(i = 0): GameState {
  return buildFisherArena(FISHER_LAYOUTS[i], seeded());
}

function countSub(state: GameState, sub: number): number {
  let n = 0;
  for (const row of state.mapData.subtypes) {
    for (const cell of row) if (cell.includes(sub)) n++;
  }
  return n;
}

describe("the Fisher's arena", () => {
  it.each(FISHER_LAYOUTS.map((l, i) => [l.name, i] as const))(
    "%s: seals the spike band across the full width",
    (_name, i) => {
      const state = build(i);
      const w = state.mapData.tiles[0].length;
      for (let y = SPIKE_MIN_Y; y <= SPIKE_MAX_Y; y++) {
        for (let x = 1; x < w - 1; x++) {
          expect(state.mapData.subtypes[y][x]).toContain(TileSubtype.SPIKES);
        }
      }
    }
  );

  it("puts the hero on the near bank and the Fisher on the far one", () => {
    const state = build();
    const hero = findPlayerPosition(state.mapData)!;
    expect(hero[0]).toBeGreaterThan(SPIKE_MAX_Y);
    const fisher = state.enemies!.find((e) => e.kind === "fisher")!;
    expect(fisher).toBeDefined();
    expect(fisher.y).toBeLessThan(SPIKE_MIN_Y);
    expect(fisher.health).toBe(FISHER_HP);
  });

  it("starts the Fisher out of rock range, so the player opens the fight", () => {
    const state = build();
    const fisher = state.enemies!.find((e) => e.kind === "fisher")!;
    expect(fisher.y).toBe(FISH_ROW);
    // Even standing right at the barrier, a thrown ROCK cannot reach its start row. Note
    // this is the HERO's range, not FISHER_SPEAR_RANGE — the spear is unlimited now, and
    // what keeps the fight honest is the brace rule, not symmetry of reach.
    expect(HERO_SIDE_MIN_Y - fisher.y).toBeGreaterThan(HERO_ROCK_RANGE);
  });

  it("keeps the Fisher's roam box clear of the spikes", () => {
    expect(BANK_MAX_Y).toBeLessThan(SPIKE_MIN_Y);
  });

  it("scatters the full rock quota on the hero's side only", () => {
    const state = build();
    expect(countSub(state, TileSubtype.ROCK)).toBe(FISHER_ROCK_COUNT);
    for (let y = 0; y < HERO_SIDE_MIN_Y; y++) {
      for (const cell of state.mapData.subtypes[y]) {
        expect(cell).not.toContain(TileSubtype.ROCK);
      }
    }
  });

  it("stocks a dozen snakes, all inside the Fisher's reachable bank", () => {
    // The count is the length of both the mid-fight snake pressure and the whole panic
    // act, so it is asserted rather than left to whatever the spot list happens to hold.
    // Every one must be inside the roam box: a snake it cannot walk to is not ammunition,
    // and one off-camera is a threat the player never sees coming.
    for (let i = 0; i < FISHER_LAYOUTS.length; i++) {
      const state = build(i);
      const snakes = state.enemies!.filter((e) => e.kind === "snake");
      expect(snakes.length).toBe(12);
      for (const s of snakes) {
        expect(s.y).toBeGreaterThanOrEqual(BANK_MIN_Y);
        expect(s.y).toBeLessThanOrEqual(BANK_MAX_Y);
        // Snakes won't enter deep water, so one spawned in it could never be fetched.
        expect(state.mapData.subtypes[s.y][s.x]).not.toContain(TileSubtype.DEEP_WATER);
      }
      // No two share a tile (the engine reverts colliding moves, which would strand them).
      const keys = new Set(snakes.map((s) => `${s.y},${s.x}`));
      expect(keys.size).toBe(snakes.length);
    }
  });

  it("gives the Fisher enough snakes to make the panic act last", () => {
    const state = build();
    const snakes = state.enemies!.filter((e) => e.kind === "snake").length;
    // It panics below half health and throws until dry, so the stock has to outlast the
    // couple of rocks it takes to finish it — otherwise the act is over before it reads.
    expect(snakes).toBeGreaterThan(FISHER_HP / 2);
  });

  it("rings the hero's perimeter with pots that are GUARANTEED potions, never food", () => {
    // Food does not answer a snake bite, so this is load-bearing, not flavour. The MED tag
    // lives ON the tile rather than in potOverrides so nothing downstream can separate a
    // pot from its contents.
    for (let i = 0; i < FISHER_LAYOUTS.length; i++) {
      const state = build(i);
      const pots: Array<[number, number]> = [];
      state.mapData.subtypes.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (cell.includes(TileSubtype.POT)) pots.push([y, x]);
        })
      );
      expect(pots.length).toBe(POTION_POTS.length);
      for (const [y, x] of pots) {
        expect(y).toBeGreaterThanOrEqual(HERO_SIDE_MIN_Y); // hero's side only
        expect(state.mapData.subtypes[y][x]).toContain(TileSubtype.MED);
        expect(state.mapData.subtypes[y][x]).not.toContain(TileSubtype.FOOD);
      }
    }
  });

  it("spreads the pots around the perimeter — back wall AND both side walls", () => {
    const state = build();
    const w = state.mapData.tiles[0].length;
    const pots = POTION_POTS.filter(([y, x]) =>
      state.mapData.subtypes[y][x].includes(TileSubtype.POT)
    );
    expect(pots.length).toBe(POTION_POTS.length); // none skipped by the placement guard
    // At least one against each of the three walls the hero can retreat to.
    expect(pots.some(([y]) => y >= state.mapData.tiles.length - 2)).toBe(true);
    expect(pots.some(([, x]) => x <= 2)).toBe(true);
    expect(pots.some(([, x]) => x >= w - 3)).toBe(true);
    // Actually spread, not clustered: the widest pair spans most of the map.
    const xs = pots.map(([, x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(w / 2);
  });

  it("keeps the potion pots clear of rocks and flowers", () => {
    // Pots are placed before both scatters; if that order ever flips, the pots would be
    // silently overwritten and the healing would quietly vanish.
    const state = build();
    for (const [y, x] of POTION_POTS) {
      const cell = state.mapData.subtypes[y][x];
      expect(cell).toContain(TileSubtype.POT);
      expect(cell).not.toContain(TileSubtype.ROCK);
      expect(state.mapData.tiles[y][x]).toBe(FLOOR);
    }
  });

  it("opening a potion pot actually gives a POTION (walk-in and from range)", () => {
    // The end-to-end check the earlier unit tests missed: pot contents only matter if the
    // reveal + pickup path turns them into potionCount, not foodCount.
    for (const [py, px] of [POTION_POTS[0], POTION_POTS[3]]) {
      const base = build();
      const subs = base.mapData.subtypes;
      subs.forEach((row) =>
        row.forEach((c, i) => {
          if (c.includes(TileSubtype.PLAYER)) row[i] = c.filter((v) => v !== TileSubtype.PLAYER);
        })
      );
      // Stand the hero on an open neighbour and walk into the pot.
      const nx = px > 1 ? px - 1 : px + 1;
      base.mapData.tiles[py][nx] = FLOOR;
      subs[py][nx] = [TileSubtype.PLAYER];
      let s: GameState = { ...base, enemies: [], potionCount: 0, foodCount: 0 };
      const dir = px > 1 ? Direction.RIGHT : Direction.LEFT;
      s = movePlayer(s, dir); // shatters the pot, revealing the contents
      s = movePlayer(s, dir); // steps on and collects
      expect(s.potionCount).toBe(1);
      expect(s.foodCount).toBe(0);
    }
  });

  it("places the exit behind the Fisher, locked", () => {
    const state = build();
    expect(state.mapData.subtypes[EXIT_Y].some((c) => c.includes(TileSubtype.EXIT))).toBe(
      true
    );
    expect(state.hasExitKey).toBe(false);
  });

  it("leaves at least one clear firing lane from the near bank to the strike rows", () => {
    // The whole fight is impossible if the treeline accidentally walls off every column.
    for (let i = 0; i < FISHER_LAYOUTS.length; i++) {
      const state = build(i);
      const tiles = state.mapData.tiles;
      const w = tiles[0].length;
      let lanes = 0;
      for (let x = 1; x < w - 1; x++) {
        // A hero standing at HERO_SIDE_MIN_Y throwing north covers the next 4 rows.
        const clear = [0, 1, 2, 3, 4].every((d) => {
          const y = HERO_SIDE_MIN_Y - d;
          return tiles[y][x] === FLOOR || tiles[y][x] === FLOWERS;
        });
        if (clear) lanes++;
      }
      expect(lanes).toBeGreaterThan(0);
    }
  });
});

describe("spikes as a barrier", () => {
  it("refuses the move and costs HP instead of letting the hero through", () => {
    // Enemies stripped: this is a test about the BARRIER, and with the spear now unlimited
    // the Fisher kills the hero during the walk-up, which made the assertion measure combat
    // damage instead of the spike bump.
    const state: GameState = { ...build(), enemies: [] };
    // Walk the hero north until it is standing against the spikes.
    let s: GameState = state;
    for (let i = 0; i < 20; i++) {
      const before = findPlayerPosition(s.mapData)!;
      if (before[0] === HERO_SIDE_MIN_Y) break;
      const next = movePlayer(s, Direction.UP);
      const after = findPlayerPosition(next.mapData)!;
      if (after[0] === before[0]) break; // blocked by a tree/rock; good enough
      s = next;
    }
    const posBefore = findPlayerPosition(s.mapData)!;
    if (posBefore[0] !== HERO_SIDE_MIN_Y) return; // path was blocked; covered below
    const hpBefore = s.heroHealth;
    const bumped = movePlayer(s, Direction.UP);
    expect(findPlayerPosition(bumped.mapData)).toEqual(posBefore); // did NOT move
    expect(bumped.heroHealth).toBe(hpBefore - SPIKES_BUMP_DAMAGE);
  });

  it("cannot be crossed at full health, no matter how many times you push", () => {
    const state = build();
    // Synthetic: hero directly below a spike tile with plenty of HP.
    const s: GameState = {
      ...state,
      heroHealth: 99,
      heroMaxHealth: 99,
      enemies: [],
    };
    const tiles = s.mapData.tiles;
    const subs = s.mapData.subtypes;
    for (const row of subs) row.forEach((c, i) => {
      const idx = c.indexOf(TileSubtype.PLAYER);
      if (idx !== -1) row[i] = c.filter((v) => v !== TileSubtype.PLAYER);
    });
    tiles[HERO_SIDE_MIN_Y][5] = FLOOR;
    subs[HERO_SIDE_MIN_Y][5] = [TileSubtype.PLAYER];
    let cur = s;
    for (let i = 0; i < 10; i++) cur = movePlayer(cur, Direction.UP);
    expect(findPlayerPosition(cur.mapData)).toEqual([HERO_SIDE_MIN_Y, 5]);
    expect(cur.heroHealth).toBe(99 - 10 * SPIKES_BUMP_DAMAGE);
  });

  it("lets a thrown rock fly OVER it — the barrier stops feet, not reach", () => {
    const state = build();
    const s: GameState = { ...state, enemies: [], rockCount: 1 };
    const subs = s.mapData.subtypes;
    for (const row of subs) row.forEach((c, i) => {
      const idx = c.indexOf(TileSubtype.PLAYER);
      if (idx !== -1) row[i] = c.filter((v) => v !== TileSubtype.PLAYER);
    });
    // Clear a lane so only the spikes are in the way.
    for (let d = 0; d <= 4; d++) {
      s.mapData.tiles[HERO_SIDE_MIN_Y - d][5] = FLOOR;
      if (d > 0) {
        s.mapData.subtypes[HERO_SIDE_MIN_Y - d][5] =
          HERO_SIDE_MIN_Y - d >= SPIKE_MIN_Y ? [TileSubtype.SPIKES] : [];
      }
    }
    s.mapData.subtypes[HERO_SIDE_MIN_Y][5] = [TileSubtype.PLAYER];
    const thrown = performThrowRock({ ...s, playerDirection: Direction.UP });
    // The rock cleared both spike rows and came to rest beyond them.
    const landed = thrown.mapData.subtypes[HERO_SIDE_MIN_Y - 4][5];
    expect(landed).toContain(TileSubtype.ROCK);
    expect(HERO_SIDE_MIN_Y - 4).toBeLessThan(SPIKE_MIN_Y);
  });
});

describe("collapsing into a bridge", () => {
  it("clears a walkable crossing in the death column and hands over the key", () => {
    const state = build();
    expect(state.hasExitKey).toBe(false);
    collapseFisherIntoBridge(state, 12);
    for (let y = SPIKE_MIN_Y; y <= SPIKE_MAX_Y; y++) {
      for (const x of [11, 12, 13]) {
        expect(state.mapData.subtypes[y][x]).not.toContain(TileSubtype.SPIKES);
      }
    }
    expect(state.hasExitKey).toBe(true);
  });

  it("leaves the rest of the barrier intact", () => {
    const state = build();
    collapseFisherIntoBridge(state, 12);
    expect(state.mapData.subtypes[SPIKE_MIN_Y][3]).toContain(TileSubtype.SPIKES);
    expect(state.mapData.subtypes[SPIKE_MAX_Y][20]).toContain(TileSubtype.SPIKES);
  });

  it("stays inside the map when the boss dies against a side wall", () => {
    const state = build();
    const w = state.mapData.tiles[0].length;
    expect(() => collapseFisherIntoBridge(state, 1)).not.toThrow();
    expect(() => collapseFisherIntoBridge(state, w - 2)).not.toThrow();
  });

  it("the hero can actually walk from the bridge to the exit", () => {
    const state = build();
    collapseFisherIntoBridge(state, 12);
    // BFS north from the bridge mouth to the exit tile over walkable ground.
    const tiles = state.mapData.tiles;
    const subs = state.mapData.subtypes;
    const h = tiles.length;
    const w = tiles[0].length;
    const walkable = (y: number, x: number) => {
      if (y < 0 || x < 0 || y >= h || x >= w) return false;
      if (tiles[y][x] !== FLOOR && tiles[y][x] !== FLOWERS) return false;
      const c = subs[y][x];
      return !c.includes(TileSubtype.SPIKES) && !c.includes(TileSubtype.DEEP_WATER);
    };
    const start: [number, number] = [SPIKE_MAX_Y, 12];
    expect(walkable(...start)).toBe(true);
    const seen = new Set<string>([`${start[0]},${start[1]}`]);
    const q: Array<[number, number]> = [start];
    let reached = false;
    while (q.length) {
      const [y, x] = q.shift()!;
      if (subs[y][x].includes(TileSubtype.EXIT)) {
        reached = true;
        break;
      }
      for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ny = y + dy;
        const nx = x + dx;
        const k = `${ny},${nx}`;
        if (seen.has(k) || !walkable(ny, nx)) continue;
        seen.add(k);
        q.push([ny, nx]);
      }
    }
    expect(reached).toBe(true);
  });
});

describe("the kill path (rocks only — melee is unreachable by design)", () => {
  /**
   * Hero on the near bank, Fisher 4 tiles north in the same column with a clear lane.
   * This is the geometry the whole arena exists to produce.
   */
  function duel(): GameState {
    const state = build();
    const s: GameState = {
      ...state,
      enemies: state.enemies!.filter((e) => e.kind === "fisher"),
      rockCount: 12,
      heroHealth: 99,
      heroMaxHealth: 99,
      playerDirection: Direction.UP,
    };
    const tiles = s.mapData.tiles;
    const subs = s.mapData.subtypes;
    for (const row of subs) row.forEach((c, i) => {
      const idx = c.indexOf(TileSubtype.PLAYER);
      if (idx !== -1) row[i] = c.filter((v) => v !== TileSubtype.PLAYER);
    });
    const lane = 5;
    for (let d = 0; d <= 4; d++) {
      const y = HERO_SIDE_MIN_Y - d;
      tiles[y][lane] = FLOOR;
      subs[y][lane] = y >= SPIKE_MIN_Y && d > 0 ? [TileSubtype.SPIKES] : [];
    }
    subs[HERO_SIDE_MIN_Y][lane] = [TileSubtype.PLAYER];
    const fisher = s.enemies![0];
    fisher.y = HERO_SIDE_MIN_Y - 4;
    fisher.x = lane;
    return s;
  }

  it("a thrown rock reaches it across the spikes and wounds it", () => {
    const s = duel();
    const before = s.enemies![0].health;
    const after = performThrowRock(s);
    const fisher = after.enemies!.find((e) => e.kind === "fisher");
    expect(fisher).toBeDefined();
    expect(fisher!.health).toBeLessThan(before);
  });

  it("four clean rocks kill it and collapse it into a bridge", () => {
    let s = duel();
    for (let i = 0; i < 8; i++) {
      if (!s.enemies!.some((e) => e.kind === "fisher")) break;
      // Keep the hero pinned on the firing line and re-aim every turn.
      s = performThrowRock({ ...s, playerDirection: Direction.UP, rockCount: 12 });
    }
    expect(s.enemies!.some((e) => e.kind === "fisher")).toBe(false);
    expect(s.bossDefeated).toBe(true);
    // The crossing opened and the key came with the body.
    expect(s.hasExitKey).toBe(true);
    const bridgeOpen = s.mapData.subtypes[SPIKE_MIN_Y].some(
      (c) => !c.includes(TileSubtype.SPIKES)
    );
    expect(bridgeOpen).toBe(true);
  });

  it("does not fire the payout while it is still standing", () => {
    const s = duel();
    const after = performThrowRock(s);
    expect(after.bossDefeated).toBeFalsy();
    expect(after.hasExitKey).toBe(false);
  });
});

describe("rock economy", () => {
  it("gives enough rocks on the ground to kill the Fisher several times over", () => {
    const state = build();
    const carried = state.rockCount ?? 0;
    const onGround = countSub(state, TileSubtype.ROCK);
    const hitsNeeded = Math.ceil(FISHER_HP / 2); // a thrown rock deals 2
    expect(carried + onGround).toBeGreaterThan(hitsNeeded * 2);
  });
});
