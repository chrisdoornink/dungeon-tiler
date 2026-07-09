import {
  ENDLESS_MAX_FLOORS,
  advanceToNextEndlessFloor,
  endlessAllocationForFloor,
  endlessEnemyCountForFloor,
  endlessGhostCountForFloor,
  endlessGoblinWeights,
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

  it("maps endless floors onto the daily swarm-odds phases", () => {
    expect(endlessPhaseFloor(1)).toBe(1);
    expect(endlessPhaseFloor(3)).toBe(1);
    expect(endlessPhaseFloor(4)).toBe(2);
    expect(endlessPhaseFloor(7)).toBe(2);
    expect(endlessPhaseFloor(8)).toBe(3);
    expect(endlessPhaseFloor(50)).toBe(3);
  });

  it("ramps the goblin mix gradually: no pink/stone before floor 6, no armed goblins before 4", () => {
    const kindsAt = (floor: number) => endlessGoblinWeights(floor).map((w) => w.kind);
    for (const f of [1, 2, 3]) {
      expect(kindsAt(f)).toEqual(
        expect.not.arrayContaining([
          "earth-goblin-knives",
          "water-goblin-spear",
          "pink-goblin",
          "stone-goblin",
        ])
      );
    }
    for (const f of [4, 5]) {
      expect(kindsAt(f)).toContain("earth-goblin-knives");
      expect(kindsAt(f)).toEqual(expect.not.arrayContaining(["pink-goblin", "stone-goblin"]));
    }
    for (const f of [6, 7, 8, 20]) {
      expect(kindsAt(f)).toContain("pink-goblin");
      expect(kindsAt(f)).toContain("stone-goblin");
    }
  });
});

describe("endless item plan", () => {
  const STARTER = [
    TileSubtype.SWORD,
    TileSubtype.SHIELD,
    TileSubtype.BOMB,
    TileSubtype.SNAKE_MEDALLION,
    TileSubtype.EXTRA_HEART,
  ];

  it("places all five starter items on distinct floors within 2-10", () => {
    for (let i = 0; i < 200; i++) {
      const plan = rollEndlessItemPlan();
      const floors = Object.keys(plan.floorItems).map(Number);
      const placed = floors.flatMap((f) => plan.floorItems[f]);
      // Every starter item appears exactly once
      for (const item of STARTER) {
        expect(placed.filter((x) => x === item).length).toBe(1);
      }
      expect(placed.length).toBe(5);
      // On distinct floors, all within 2-10, never on the blind floor 1
      expect(new Set(floors).size).toBe(floors.length);
      for (const f of floors) {
        expect(f).toBeGreaterThanOrEqual(2);
        expect(f).toBeLessThanOrEqual(10);
      }
    }
  });

  it("never allocates chests to floor 1 and always matches keys to chests", () => {
    for (let i = 0; i < 50; i++) {
      const plan = rollEndlessItemPlan();
      expect(endlessAllocationForFloor(1, plan).chests).toBe(0);
      for (let floor = 1; floor <= 20; floor++) {
        const alloc = endlessAllocationForFloor(floor, plan);
        expect(alloc.keys).toBe(alloc.chests);
        expect(alloc.chestContents.length).toBe(alloc.chests);
      }
    }
  });

  it("mirrors the plan's floor items on floors 2-10", () => {
    const plan = rollEndlessItemPlan();
    for (let floor = 2; floor <= 10; floor++) {
      const expected = plan.floorItems[floor] ?? [];
      expect(endlessAllocationForFloor(floor, plan).chestContents).toEqual(expected);
    }
  });

  it("keeps an extra-heart chest on the 5-floor cadence past floor 10", () => {
    const plan = rollEndlessItemPlan();
    // rng that never triggers the bomb/weapon chances, isolating the heart cadence
    const noChance = () => 0.99;
    expect(
      endlessAllocationForFloor(15, plan, { rng: noChance }).chestContents
    ).toContain(TileSubtype.EXTRA_HEART);
    expect(
      endlessAllocationForFloor(20, plan, { rng: noChance }).chestContents
    ).toContain(TileSubtype.EXTRA_HEART);
    expect(
      endlessAllocationForFloor(13, plan, { rng: noChance }).chestContents
    ).not.toContain(TileSubtype.EXTRA_HEART);
  });

  it("offers bombs by chance and a sword only when the hero lacks one, past floor 10", () => {
    const plan = rollEndlessItemPlan();
    const always = () => 0.0; // every chance fires
    const missing = endlessAllocationForFloor(12, plan, {
      hasSword: false,
      hasShield: false,
      rng: always,
    }).chestContents;
    expect(missing).toContain(TileSubtype.BOMB);
    expect(missing).toContain(TileSubtype.SWORD);
    expect(missing).toContain(TileSubtype.SHIELD);

    const equipped = endlessAllocationForFloor(12, plan, {
      hasSword: true,
      hasShield: true,
      rng: always,
    }).chestContents;
    expect(equipped).toContain(TileSubtype.BOMB);
    expect(equipped).not.toContain(TileSubtype.SWORD);
    expect(equipped).not.toContain(TileSubtype.SHIELD);
  });
});

describe("endless run initialization (floor 1)", () => {
  it("starts on floor 1 of a 16x16 map with the torch LIT", () => {
    const state = initializeGameStateForEndless();
    expect(state.mode).toBe("endless");
    expect(state.currentFloor).toBe(1);
    expect(state.maxFloors).toBe(ENDLESS_MAX_FLOORS);
    // The hero can see from the first step; the corner wisps take the light soon.
    expect(state.heroTorchLit).toBe(true);
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

  it("lays floor 2's chests out to match its slot in the item plan", () => {
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
      // Floor 2 carries exactly the items the plan assigned to floor 2 (0 or 1
      // — the plan gives each floor at most one starter item).
      const expected = (plan.floorItems[2] ?? []).length;
      expect(chests).toBe(expected);
    }
  });
});
