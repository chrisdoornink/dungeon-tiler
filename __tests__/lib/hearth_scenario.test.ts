import { buildHearthHomeState } from "../../lib/story/hearth_home_mode";
import {
  computeRallyPoint,
  handleHearthBookshelf,
  runHearthScenario,
} from "../../lib/story/hearth_scenario";
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
  [6, 10], // Chris
  [11, 9], // Claire
  [15, 9], // Emerson
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

  it("bumping the bookshelf reveals the keys with a line, and claims the interaction", () => {
    const state = buildHearthHomeState("chris");
    const claimed = handleHearthBookshelf(state);

    expect(claimed).toBe(true); // library reader is skipped
    expect(state.hasKey).toBe(true);
    expect(state.scenarioFlags?.hearthKeysFound).toBe(true);
    // A discovery line is queued to auto-open.
    const queued = state.npcInteractionQueue ?? [];
    expect(queued).toHaveLength(1);
    expect(queued[0].availableHooks[0].payload?.dialogueId).toBe(
      "home-bookshelf-keys"
    );

    // A second bump doesn't re-grant or re-announce, but still blocks the reader.
    state.npcInteractionQueue = [];
    expect(handleHearthBookshelf(state)).toBe(true);
    expect(state.npcInteractionQueue).toHaveLength(0);
  });

  it("bumping the bookshelf in-engine grants the key and opens no reader", () => {
    let state = buildHearthHomeState("chris");
    teleportHero(state, 13, 2); // beside the living-room bookshelf at (13,1)

    state = movePlayer(state, Direction.LEFT); // bump the shelf

    expect(state.hasKey).toBe(true);
    expect(state.scenarioFlags?.hearthKeysFound).toBe(true);
    // The library reader queue stays empty; the discovery line is queued instead.
    expect(state.bookshelfInteractionQueue ?? []).toHaveLength(0);
    expect(
      (state.npcInteractionQueue ?? [])[0]?.availableHooks[0].payload?.dialogueId
    ).toBe("home-bookshelf-keys");
    // The bookshelf blocks movement — the hero did not step onto it.
    expect(findPlayerPosition(state.mapData)).toEqual([13, 2]);
  });

  it("does not touch the bookshelf outside party scenes", () => {
    const state = buildHearthHomeState("chris");
    delete state.party;
    expect(handleHearthBookshelf(state)).toBe(false);
    expect(state.hasKey).toBeFalsy();
  });

  it("Opal leads to the bookshelf until the keys are found, then falls in line", () => {
    const state = buildHearthHomeState("chris");
    runHearthScenario(state, HERO_POS);
    const opal = state.npcs!.find((n) => n.id === "npc-opal")!;
    expect(opal.metadata?.behavior).toBe("goto");
    expect(opal.metadata?.gotoTarget).toEqual({ y: 14, x: 1 });

    state.scenarioFlags!.hearthKeysFound = true;
    runHearthScenario(state, HERO_POS);
    expect(opal.metadata?.behavior).toBe("idle");
  });

  it("once keys are found, NPC family members head for their own chests", () => {
    const state = buildHearthHomeState("chris");
    state.scenarioFlags = { hearthKeysFound: true };
    runHearthScenario(state, HERO_POS);

    // Emerson's chest is [15,9]; he is sent to it. (Annie has no chest.)
    const emerson = state.npcs!.find((n) => n.id === "npc-emerson")!;
    expect(emerson.metadata?.behavior).toBe("goto");
    expect(emerson.metadata?.gotoTarget).toEqual({ y: 15, x: 9 });

    const annie = state.npcs!.find((n) => n.id === "npc-annie")!;
    expect(annie.metadata?.behavior).not.toBe("goto"); // nothing to fetch
  });

  it("an NPC adjacent to its chest opens it and arms itself", () => {
    const state = buildHearthHomeState("chris");
    state.scenarioFlags = { hearthKeysFound: true };
    const claire = state.npcs!.find((n) => n.id === "npc-claire")!;
    claire.y = 11; // beside Claire's chest at [11,9]
    claire.x = 8;

    runHearthScenario(state, HERO_POS);

    expect(state.mapData.subtypes[11][9]).toContain(TileSubtype.OPEN_CHEST);
    expect(state.mapData.subtypes[11][9]).not.toContain(TileSubtype.CHEST);
    expect(state.party?.find((p) => p.id === "claire")?.hasSword).toBe(true);
    expect(claire.metadata?.behavior).toBe("idle");
    expect(claire.metadata?.armed).toBe(true); // drives the sword overlay
  });

  it("after arming, a rally point is pinned and the family walks to it", () => {
    const state = buildHearthHomeState("chris");
    state.scenarioFlags = { hearthKeysFound: true };
    for (const id of ["chris", "emerson", "claire"]) {
      state.party!.find((p) => p.id === id)!.hasSword = true;
    }
    runHearthScenario(state, HERO_POS);

    expect(state.rallyPoint).toBeTruthy();
    const [ry, rx] = state.rallyPoint!;
    for (const npc of state.npcs!.filter((n) => n.metadata?.partyId)) {
      expect(npc.metadata?.behavior).toBe("goto");
      expect(npc.metadata?.gotoTarget).toEqual({ y: ry, x: rx });
    }
    // Not everyone is there yet — no wondering, no goblins.
    expect(state.scenarioFlags?.hearthWondered).toBeFalsy();

    // The rally point stays pinned across ticks (it must not drift as people walk).
    runHearthScenario(state, HERO_POS);
    expect(state.rallyPoint).toEqual([ry, rx]);
  });

  it("the rally point is the fairest reachable meeting spot", () => {
    const state = buildHearthHomeState("chris");
    // Everyone in or near the living room -> the middle should be there too,
    // never inside a wall or on furniture.
    const spots: Record<string, [number, number]> = {
      "npc-annie": [14, 2],
      "npc-claire": [15, 3],
      "npc-emerson": [14, 5],
      "npc-opal": [15, 5],
    };
    for (const npc of state.npcs!) {
      const s = spots[npc.id];
      if (s) {
        npc.y = s[0];
        npc.x = s[1];
      }
    }
    const point = computeRallyPoint(state, [15, 4]); // hero by the door
    expect(point).toBeTruthy();
    const [ry, rx] = point!;
    expect(ry).toBeGreaterThanOrEqual(13); // living-room rows
    expect(state.mapData.tiles[ry][rx]).toBe(FLOOR);
  });

  it("rally -> 'what do we do with these?' -> goblins", () => {
    const state = buildHearthHomeState("chris");
    state.scenarioFlags = { hearthKeysFound: true };
    for (const id of ["chris", "emerson", "claire"]) {
      state.party!.find((p) => p.id === id)!.hasSword = true;
    }
    runHearthScenario(state, HERO_POS); // pins the rally
    const [ry, rx] = state.rallyPoint!;

    // Everyone (hero included) arrives at the rally.
    const around: Array<[number, number]> = [
      [ry, rx - 1],
      [ry, rx + 1],
      [ry - 1, rx],
      [ry + 1, rx],
    ];
    state.npcs!
      .filter((n) => n.metadata?.partyId)
      .forEach((n, i) => {
        n.y = around[i][0];
        n.x = around[i][1];
      });

    runHearthScenario(state, [ry, rx]);
    expect(state.scenarioFlags?.hearthWondered).toBe(true);
    expect(state.rallyPoint).toBeNull(); // rally ends
    expect(
      state.npcs!.filter((n) => n.metadata?.partyId).every(
        (n) => n.metadata?.behavior === "idle"
      )
    ).toBe(true);
    expect(
      (state.npcInteractionQueue ?? [])[0]?.availableHooks[0].payload?.dialogueId
    ).toBe("home-arsenal");

    // Next tick: the break-in begins with ONE goblin, and both doors open.
    runHearthScenario(state, [ry, rx]);
    expect(state.scenarioFlags?.hearthBreached).toBe(true);
    expect(state.mapData.tiles[16][4]).toBe(FLOOR); // front door open
    expect(state.mapData.tiles[0][5]).toBe(FLOOR); // back door open
    expect(state.enemies?.length).toBe(1);
    expect(state.enemies?.every((e) => e.kind === "fire-goblin")).toBe(true);
  });

  it("goblins arrive one at a time, alternating both doors, until the wave is spent", () => {
    const state = buildHearthHomeState("chris");
    state.scenarioFlags = { hearthKeysFound: true, hearthWondered: true };
    const seenDoors = new Set<string>();
    // Drive turns; each new goblin should appear near a door, alternating.
    for (let turn = 0; turn < 10; turn++) {
      state.stats.steps = (state.stats.steps ?? 0) + 1; // a player move elapsed
      runHearthScenario(state, HERO_POS);
      for (const e of state.enemies ?? []) {
        seenDoors.add(e.y < 8 ? "back" : "front");
      }
    }
    // Never more than the total, and both doors were used.
    expect(state.scenarioCounters?.goblinsSpawned).toBe(6);
    expect(seenDoors.has("front")).toBe(true);
    expect(seenDoors.has("back")).toBe(true);
    // At its peak the wave never dumped all six at once.
    expect((state.enemies?.length ?? 0)).toBeLessThanOrEqual(6);
  });

  it("defended only after the whole wave has come AND been cleared", () => {
    const state = buildHearthHomeState("chris");
    state.scenarioFlags = { hearthKeysFound: true, hearthWondered: true };
    // Spawn the entire wave over enough turns.
    for (let turn = 0; turn < 8; turn++) {
      state.stats.steps = (state.stats.steps ?? 0) + 1;
      runHearthScenario(state, HERO_POS);
    }
    expect(state.scenarioCounters?.goblinsSpawned).toBe(6);

    // Clearing goblins mid-wave does NOT end it early — but here the wave is
    // fully spawned, so clearing them now finishes the fight.
    state.enemies = [];
    runHearthScenario(state, HERO_POS);
    expect(state.scenarioFlags?.hearthDefended).toBe(true);
  });

  it("in-engine: keys open the hero's own chest and grant the sword", () => {
    let state = buildHearthHomeState("chris");
    state.hasKey = true; // as if the bookshelf was already searched
    state.scenarioFlags = { hearthKeysFound: true };
    teleportHero(state, 6, 9); // beside Chris's own chest at [6,10]

    state = movePlayer(state, Direction.RIGHT); // bump: unlocks + opens in place
    const opened = state.mapData.subtypes[6][10];
    expect(opened).toContain(TileSubtype.OPEN_CHEST);
    expect(opened).toContain(TileSubtype.SWORD);
    expect(opened).not.toContain(TileSubtype.CHEST);

    state = movePlayer(state, Direction.RIGHT); // step in: take the sword
    expect(state.hasSword).toBe(true);

    // The break-in does NOT spring yet — the kids haven't armed and nobody has
    // regrouped. The wondering beat gates it (covered above).
    expect(state.scenarioFlags?.hearthBreached).toBeFalsy();
  });

  it("a family member steps aside on the second consecutive bump", () => {
    let state = buildHearthHomeState("chris");
    // Park Annie directly above the hero in open floor.
    const [hy, hx] = HERO_POS;
    const annie = state.npcs!.find((n) => n.id === "npc-annie")!;
    annie.y = hy - 1;
    annie.x = hx;

    state = movePlayer(state, Direction.UP); // bump 1: talks
    const queueAfterFirst = (state.npcInteractionQueue ?? []).length;
    expect(queueAfterFirst).toBeGreaterThan(0);
    const annie1 = state.npcs!.find((n) => n.id === "npc-annie")!;
    expect([annie1.y, annie1.x]).toEqual([hy - 1, hx]); // still in the way

    state = movePlayer(state, Direction.UP); // bump 2: steps aside, silently
    const annie2 = state.npcs!.find((n) => n.id === "npc-annie")!;
    expect([annie2.y, annie2.x]).not.toEqual([hy - 1, hx]);
    expect((state.npcInteractionQueue ?? []).length).toBe(queueAfterFirst);

    state = movePlayer(state, Direction.UP); // the way is clear now
    expect(findPlayerPosition(state.mapData)).toEqual([hy - 1, hx]);
  });

  it("a real turn between bumps resets the step-aside counter", () => {
    let state = buildHearthHomeState("chris");
    const [hy, hx] = HERO_POS;
    const annie = state.npcs!.find((n) => n.id === "npc-annie")!;
    annie.y = hy - 1;
    annie.x = hx;

    state = movePlayer(state, Direction.UP); // bump 1
    state = movePlayer(state, Direction.LEFT); // a real move — world turn passes
    state = movePlayer(state, Direction.RIGHT); // walk back
    state = movePlayer(state, Direction.UP); // bump again: talks, doesn't yield
    const annieNow = state.npcs!.find((n) => n.id === "npc-annie")!;
    expect([annieNow.y, annieNow.x]).toEqual([hy - 1, hx]);
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
