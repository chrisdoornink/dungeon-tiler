import {
  ENDLESS_MAX_FLOORS,
  advanceToNextEndlessFloor,
  endlessAllocationForFloor,
  endlessEnemyCountForFloor,
  endlessGhostCountForFloor,
  endlessGridSizeForFloor,
  endlessPhaseFloor,
  initializeGameStateForEndless,
  rollEndlessItemPlan,
} from "../../lib/map/endless";
import { TileSubtype } from "../../lib/map/constants";
import { findPlayerPosition } from "../../lib/map/player";

describe("endless mode scaling", () => {
  it("grows the grid from 16x16 by +2 per floor, capped at 28x28", () => {
    expect(endlessGridSizeForFloor(1)).toEqual([16, 16]);
    expect(endlessGridSizeForFloor(2)).toEqual([18, 18]);
    expect(endlessGridSizeForFloor(7)).toEqual([28, 28]);
    expect(endlessGridSizeForFloor(30)).toEqual([28, 28]);
  });

  it("ramps enemy count with depth and caps it", () => {
    for (let i = 0; i < 20; i++) {
      const f1 = endlessEnemyCountForFloor(1);
      expect(f1).toBeGreaterThanOrEqual(2);
      expect(f1).toBeLessThanOrEqual(3);
      const f20 = endlessEnemyCountForFloor(20);
      expect(f20).toBeGreaterThanOrEqual(12);
      expect(f20).toBeLessThanOrEqual(13);
    }
  });

  it("spawns more ghosts than the daily at every depth", () => {
    for (let i = 0; i < 20; i++) {
      const early = endlessGhostCountForFloor(3);
      expect(early).toBeGreaterThanOrEqual(1);
      expect(early).toBeLessThanOrEqual(2);
      const deep = endlessGhostCountForFloor(9);
      expect(deep).toBeGreaterThanOrEqual(2);
      expect(deep).toBeLessThanOrEqual(3);
    }
    // Floor 1's pair is placed explicitly in the corners, not by this rule
    expect(endlessGhostCountForFloor(1)).toBe(0);
  });

  it("maps endless floors onto the daily difficulty phases", () => {
    expect(endlessPhaseFloor(1)).toBe(1);
    expect(endlessPhaseFloor(2)).toBe(1);
    expect(endlessPhaseFloor(3)).toBe(2);
    expect(endlessPhaseFloor(6)).toBe(2);
    expect(endlessPhaseFloor(7)).toBe(3);
    expect(endlessPhaseFloor(50)).toBe(3);
  });
});

describe("endless item plan", () => {
  it("puts the sword on floors 2-4 and the shield on 3-6, never together", () => {
    for (let i = 0; i < 200; i++) {
      const plan = rollEndlessItemPlan();
      expect(plan.swordFloor).toBeGreaterThanOrEqual(2);
      expect(plan.swordFloor).toBeLessThanOrEqual(4);
      expect(plan.shieldFloor).toBeGreaterThanOrEqual(3);
      expect(plan.shieldFloor).toBeLessThanOrEqual(6);
      expect(plan.shieldFloor).not.toBe(plan.swordFloor);
      expect(plan.medallionFloor).toBeGreaterThanOrEqual(6);
      expect(plan.medallionFloor).toBeLessThanOrEqual(9);
    }
  });

  it("never allocates chests to floor 1 and always matches keys to chests", () => {
    for (let i = 0; i < 50; i++) {
      const plan = rollEndlessItemPlan();
      const f1 = endlessAllocationForFloor(1, plan);
      expect(f1.chests).toBe(0);
      for (let floor = 1; floor <= 20; floor++) {
        const alloc = endlessAllocationForFloor(floor, plan);
        expect(alloc.keys).toBe(alloc.chests);
        expect(alloc.chestContents.length).toBe(alloc.chests);
      }
    }
  });

  it("adds an extra-heart chest every 5th floor", () => {
    const plan = { swordFloor: 2, shieldFloor: 3, medallionFloor: 7 };
    expect(endlessAllocationForFloor(5, plan).chestContents).toContain(TileSubtype.EXTRA_HEART);
    expect(endlessAllocationForFloor(10, plan).chestContents).toContain(TileSubtype.EXTRA_HEART);
    expect(endlessAllocationForFloor(4, plan).chestContents).not.toContain(TileSubtype.EXTRA_HEART);
  });
});

describe("endless run initialization (the blind floor)", () => {
  it("starts on floor 1 of a 16x16 map with the torch OUT", () => {
    const state = initializeGameStateForEndless();
    expect(state.mode).toBe("endless");
    expect(state.currentFloor).toBe(1);
    expect(state.maxFloors).toBe(ENDLESS_MAX_FLOORS);
    expect(state.heroTorchLit).toBe(false);
    expect(state.mapData.tiles.length).toBe(16);
    expect(state.mapData.tiles[0].length).toBe(16);
    expect(typeof state.endlessSeed).toBe("number");
    expect(state.endlessPlan).toBeDefined();
  });

  it("spawns only fire goblins plus exactly 2 corner wisps on floor 1", () => {
    for (let i = 0; i < 5; i++) {
      const state = initializeGameStateForEndless();
      const goblins = state.enemies!.filter((e) => e.kind !== "ghost");
      const ghosts = state.enemies!.filter((e) => e.kind === "ghost");
      expect(goblins.length).toBeGreaterThan(0);
      for (const e of goblins) {
        expect(e.kind).toBe("fire-goblin");
      }
      expect(ghosts.length).toBe(2);
    }
  });

  it("starts the corner wisps far from the hero", () => {
    for (let i = 0; i < 10; i++) {
      const state = initializeGameStateForEndless();
      const player = findPlayerPosition(state.mapData)!;
      const ghosts = state.enemies!.filter((e) => e.kind === "ghost");
      for (const g of ghosts) {
        const d = Math.hypot(g.y - player[0], g.x - player[1]);
        // Far corners of a 16x16 map: never breathing down the hero's neck
        expect(d).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("has no faulty floors and at most 2 wall torches on floor 1", () => {
    for (let i = 0; i < 5; i++) {
      const state = initializeGameStateForEndless();
      let faulty = 0;
      let torches = 0;
      for (const row of state.mapData.subtypes) {
        for (const cell of row) {
          if (cell.includes(TileSubtype.FAULTY_FLOOR)) faulty++;
          if (cell.includes(TileSubtype.WALL_TORCH)) torches++;
        }
      }
      expect(faulty).toBe(0);
      expect(torches).toBeGreaterThanOrEqual(1);
      expect(torches).toBeLessThanOrEqual(2);
    }
  });

  it("spawns the hero away from every wall torch", () => {
    for (let i = 0; i < 10; i++) {
      const state = initializeGameStateForEndless();
      const player = findPlayerPosition(state.mapData);
      expect(player).not.toBeNull();
      const [py, px] = player!;
      for (let y = 0; y < state.mapData.subtypes.length; y++) {
        for (let x = 0; x < state.mapData.subtypes[y].length; x++) {
          if (state.mapData.subtypes[y][x].includes(TileSubtype.WALL_TORCH)) {
            const d = Math.hypot(y - py, x - px);
            // 6 when the map allows it; the fallback picks the farthest tile,
            // which on a 16x16 grid with 2 torches should still clear 4.
            expect(d).toBeGreaterThanOrEqual(4);
          }
        }
      }
    }
  });
});

describe("advancing endless floors", () => {
  it("advances to bigger floors, preserving inventory and resetting the exit key", () => {
    const state = initializeGameStateForEndless();
    state.hasSword = true;
    state.rockCount = 4;
    state.hasExitKey = true;
    state.heroHealth = 3;

    const next = advanceToNextEndlessFloor(state);
    expect(next.currentFloor).toBe(2);
    expect(next.mapData.tiles.length).toBe(18);
    expect(next.hasSword).toBe(true);
    expect(next.rockCount).toBe(4);
    expect(next.heroHealth).toBe(3);
    expect(next.hasExitKey).toBe(false);
    expect(next.endlessSeed).toBe(state.endlessSeed);
  });

  it("generates floors deterministically from the run seed", () => {
    const state = initializeGameStateForEndless();
    const a = advanceToNextEndlessFloor(state);
    const b = advanceToNextEndlessFloor(state);
    expect(JSON.stringify(a.mapData.tiles)).toBe(JSON.stringify(b.mapData.tiles));
    expect(a.enemies!.map((e) => `${e.y},${e.x},${e.kind}`).join("|")).toBe(
      b.enemies!.map((e) => `${e.y},${e.x},${e.kind}`).join("|")
    );
  });

  it("keeps floor 2 sword-free when the plan says the sword is deeper", () => {
    for (let i = 0; i < 10; i++) {
      const state = initializeGameStateForEndless();
      const next = advanceToNextEndlessFloor(state);
      const plan = state.endlessPlan!;
      let chests = 0;
      for (const row of next.mapData.subtypes) {
        for (const cell of row) {
          if (cell.includes(TileSubtype.CHEST)) chests++;
        }
      }
      const expected = plan.swordFloor === 2 ? 1 : 0;
      expect(chests).toBe(expected);
    }
  });
});
