/**
 * Integration coverage for Hearth & Home that walks the REAL house map —
 * the class of test that was missing and let a greedy-pathfinding bug ship
 * (NPCs froze against the first interior wall, so nobody armed, nobody
 * gathered, and the goblins never came). These drive the actual movePlayer
 * world tick and the actual floor plan, not open grids.
 */

import {
  buildHearthHomeState,
} from "../../lib/story/hearth_home_mode";
import { updateGotoBehavior } from "../../lib/npc_behaviors";
import {
  Direction,
  TileSubtype,
  findPlayerPosition,
  movePlayer,
  type GameState,
} from "../../lib/map";

function ctxFor(state: GameState, npcId: string, player: [number, number]) {
  const npc = state.npcs!.find((n) => n.id === npcId)!;
  return {
    npc,
    grid: state.mapData.tiles,
    subtypes: state.mapData.subtypes,
    player: { y: player[0], x: player[1] },
    npcs: state.npcs!,
    enemies: state.enemies ?? [],
  };
}

describe("family navigation through the walled house", () => {
  it("Chris routes from the living room to the master-bedroom chest", () => {
    // Chris is an NPC (playing as a kid). His home [13,2] and chest [6,10] are
    // in different rooms separated by interior walls — greedy stepping jams on
    // the first wall; BFS must route through the doorways.
    const state = buildHearthHomeState("emerson");
    const chris = state.npcs!.find((n) => n.id === "npc-chris")!;
    expect([chris.y, chris.x]).toEqual([13, 2]); // his home
    chris.metadata = {
      ...chris.metadata,
      behavior: "goto",
      gotoTarget: { y: 6, x: 10 },
    };
    const ctx = ctxFor(state, "npc-chris", [15, 4]);

    let reached = false;
    for (let t = 0; t < 80; t++) {
      updateGotoBehavior(ctx);
      if (Math.abs(chris.y - 6) + Math.abs(chris.x - 10) <= 1) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
  });

  it("Claire routes to her own room chest", () => {
    const state = buildHearthHomeState("emerson");
    const claire = state.npcs!.find((n) => n.id === "npc-claire")!;
    claire.metadata = {
      ...claire.metadata,
      behavior: "goto",
      gotoTarget: { y: 11, x: 9 },
    };
    const ctx = ctxFor(state, "npc-claire", [15, 4]);
    let reached = false;
    for (let t = 0; t < 80; t++) {
      updateGotoBehavior(ctx);
      if (Math.abs(claire.y - 11) + Math.abs(claire.x - 9) <= 1) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
  });
});

describe("full intro plays out in-engine (playing as a kid)", () => {
  it("adults arm, everyone rallies, and the goblins finally come", () => {
    let state = buildHearthHomeState("emerson");
    state.hasKey = true;
    state.scenarioFlags = { hearthKeysFound: true };
    // Simulate the hero (Emerson) having already opened his own chest, so the
    // test isolates the NPC arming + rally + breach chain.
    state.mapData.subtypes[15][9] = [TileSubtype.OPEN_CHEST];
    state.party!.find((p) => p.id === "emerson")!.hasSword = true;

    // Park the hero where they can shuffle to advance world turns.
    const heroStart = findPlayerPosition(state.mapData)!;
    state.mapData.subtypes[heroStart[0]][heroStart[1]] = state.mapData.subtypes[
      heroStart[0]
    ][heroStart[1]].filter((t) => t !== TileSubtype.PLAYER);
    state.mapData.subtypes[14][4] = [
      ...(state.mapData.subtypes[14][4] ?? []),
      TileSubtype.PLAYER,
    ];

    for (let t = 0; t < 120 && !state.scenarioFlags?.hearthBreached; t++) {
      state = movePlayer(state, t % 2 === 0 ? Direction.RIGHT : Direction.LEFT);
    }

    // Both NPC-owned chests were reached and opened.
    expect(state.mapData.subtypes[6][10]).not.toContain(TileSubtype.CHEST); // Chris (master)
    expect(state.mapData.subtypes[11][9]).not.toContain(TileSubtype.CHEST); // Claire
    // The family regrouped, wondered, and the break-in fired.
    expect(state.scenarioFlags?.hearthWondered).toBe(true);
    expect(state.scenarioFlags?.hearthBreached).toBe(true);
    expect(state.enemies?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(state.enemies?.every((e) => e.kind === "fire-goblin")).toBe(true);
  });

  // When the hero is an adult or Opal, EVERY chest owner is an NPC, so the whole
  // intro must complete automatically as the player just moves around.
  for (const hero of ["chris", "opal"] as const) {
    it(`completes automatically when playing as ${hero}`, () => {
      let state = buildHearthHomeState(hero);
      state.hasKey = true;
      state.scenarioFlags = { hearthKeysFound: true };

      // Put the hero where they can shuffle to advance turns.
      const start = findPlayerPosition(state.mapData)!;
      state.mapData.subtypes[start[0]][start[1]] = state.mapData.subtypes[
        start[0]
      ][start[1]].filter((t) => t !== TileSubtype.PLAYER);
      state.mapData.subtypes[14][4] = [
        ...(state.mapData.subtypes[14][4] ?? []),
        TileSubtype.PLAYER,
      ];

      for (let t = 0; t < 160 && !state.scenarioFlags?.hearthBreached; t++) {
        state = movePlayer(
          state,
          t % 2 === 0 ? Direction.RIGHT : Direction.LEFT
        );
      }

      // All three chests opened by the NPC family, with no hero chest action.
      for (const [y, x] of [
        [6, 10],
        [11, 9],
        [15, 9],
      ]) {
        expect(state.mapData.subtypes[y][x]).not.toContain(TileSubtype.CHEST);
      }
      expect(state.scenarioFlags?.hearthWondered).toBe(true);
      expect(state.scenarioFlags?.hearthBreached).toBe(true);
      expect(state.enemies?.length ?? 0).toBeGreaterThanOrEqual(1);
    });
  }
});
