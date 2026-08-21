import { buildHearthHomeState } from "../../lib/story/hearth_home_mode";
import { runHearthScenario } from "../../lib/story/hearth_scenario";
import { resolveNpcDialogueScript } from "../../lib/story/npc_script_registry";
import {
  Direction,
  FLOOR,
  TileSubtype,
  findPlayerPosition,
  movePlayer,
  type GameState,
} from "../../lib/map";

const HERO_POS: [number, number] = [15, 4];
const CHEST_TILES: Array<[number, number]> = [
  [7, 10],
  [11, 9],
  [15, 9],
];

function teleportHero(state: GameState, y: number, x: number) {
  const pos = findPlayerPosition(state.mapData)!;
  state.mapData.subtypes[pos[0]][pos[1]] = state.mapData.subtypes[pos[0]][
    pos[1]
  ].filter((t) => t !== TileSubtype.PLAYER);
  state.mapData.subtypes[y][x] = [
    ...(state.mapData.subtypes[y][x] ?? []),
    TileSubtype.PLAYER,
  ];
}

describe("hearth intro scenario", () => {
  it("places a locked chest with a sword in every bedroom", () => {
    const state = buildHearthHomeState("chris");
    for (const [y, x] of CHEST_TILES) {
      const subtypes = state.mapData.subtypes[y][x];
      expect(subtypes).toContain(TileSubtype.CHEST);
      expect(subtypes).toContain(TileSubtype.LOCK);
      expect(subtypes).toContain(TileSubtype.SWORD);
    }
  });

  it("the bookshelf gives up the chest keys (and never opens the library)", () => {
    const state = buildHearthHomeState("chris");
    state.bookshelfInteractionQueue = [
      { bookshelfId: "home-shelf", position: [13, 1] },
    ];
    runHearthScenario(state, HERO_POS);
    expect(state.hasKey).toBe(true);
    expect(state.scenarioFlags?.hearthKeysFound).toBe(true);
    expect(state.bookshelfInteractionQueue).toHaveLength(0);
  });

  it("Opal leads to the bookshelf until the keys are found, then falls in line", () => {
    const state = buildHearthHomeState("chris");
    runHearthScenario(state, HERO_POS);
    const opal = state.npcs!.find((n) => n.id === "npc-opal")!;
    expect(opal.metadata?.behavior).toBe("goto");
    expect(opal.metadata?.gotoTarget).toEqual({ y: 14, x: 1 });

    state.scenarioFlags!.hearthKeysFound = true;
    runHearthScenario(state, HERO_POS);
    expect(opal.metadata?.behavior).toBe("follow");
  });

  it("the first sword springs the break-in, exactly once", () => {
    const state = buildHearthHomeState("chris");
    state.hasSword = true;
    runHearthScenario(state, HERO_POS);

    expect(state.scenarioFlags?.hearthBreached).toBe(true);
    expect(state.mapData.tiles[16][4]).toBe(FLOOR); // the door burst open
    const wave = state.enemies?.length ?? 0;
    expect(wave).toBeGreaterThanOrEqual(3);
    expect(state.enemies?.every((e) => e.kind === "fire-goblin")).toBe(true);

    runHearthScenario(state, HERO_POS);
    expect(state.enemies?.length).toBe(wave); // no second wave
  });

  it("clearing every goblin marks the house defended", () => {
    const state = buildHearthHomeState("chris");
    state.hasSword = true;
    runHearthScenario(state, HERO_POS);
    state.enemies = [];
    runHearthScenario(state, HERO_POS);
    expect(state.scenarioFlags?.hearthDefended).toBe(true);
  });

  it("full loop: keys open the chest, stepping in grabs the sword, goblins arrive", () => {
    let state = buildHearthHomeState("chris");
    state.hasKey = true; // as if the bookshelf was already searched
    state.scenarioFlags = { hearthKeysFound: true };
    teleportHero(state, 7, 9); // beside the master-bedroom chest

    state = movePlayer(state, Direction.RIGHT); // bump: unlocks + opens in place
    const opened = state.mapData.subtypes[7][10];
    expect(opened).toContain(TileSubtype.OPEN_CHEST);
    expect(opened).toContain(TileSubtype.SWORD);
    expect(opened).not.toContain(TileSubtype.CHEST);

    state = movePlayer(state, Direction.RIGHT); // step in: take the sword
    expect(state.hasSword).toBe(true);

    state = movePlayer(state, Direction.LEFT); // one more step — the door bursts
    expect(state.scenarioFlags?.hearthBreached).toBe(true);
    expect(state.enemies?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("family dialogue tracks the scenario stages", () => {
    const state = buildHearthHomeState("chris");
    expect(
      resolveNpcDialogueScript("npc-annie", state.storyFlags, state)
    ).toBe("home-annie-chest-hint");

    state.scenarioFlags = { hearthKeysFound: true, hearthBreached: true };
    expect(
      resolveNpcDialogueScript("npc-claire", state.storyFlags, state)
    ).toBe("home-claire-battle");

    state.scenarioFlags.hearthDefended = true;
    expect(
      resolveNpcDialogueScript("npc-emerson", state.storyFlags, state)
    ).toBe("home-emerson-defended");
  });
});
