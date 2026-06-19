import {
  buildTutorialOpeningRoom,
  assertTutorialRoomShape,
  TUTORIAL_OPENING_DIMENSIONS,
  TUTORIAL_ROOM_ENTER_COL,
} from "../../../lib/tutorial/rooms/opening_room";
import { buildTutorialState } from "../../../lib/tutorial/tutorial_state";
import { applyTutorialDirector } from "../../../lib/tutorial/tutorial_director";
import { buildDailyFloor2FromTutorial } from "../../../lib/tutorial/tutorial_to_daily";
import { FLOOR, WALL, TileSubtype } from "../../../lib/map/constants";
import { Enemy } from "../../../lib/enemy";
import type { GameState, MapData } from "../../../lib/map";

// --- helpers -----------------------------------------------------------------

/** A fresh tutorial state with the welcome dialogue + beats cleared so each
 *  director test starts from a clean slate. */
function baseState(): GameState {
  const s = buildTutorialState();
  s.npcInteractionQueue = [];
  s.tutorialBeats = {};
  return s;
}

/** All-floor map of the given size with empty subtypes. */
function floorMap(h: number, w: number): MapData {
  return {
    tiles: Array.from({ length: h }, () => Array.from({ length: w }, () => FLOOR)),
    subtypes: Array.from({ length: h }, () =>
      Array.from({ length: w }, () => [] as number[])
    ),
    environment: "cave",
  };
}

/** Dialogue ids currently queued on the state. */
function dialogueIds(s: GameState): string[] {
  return (s.npcInteractionQueue ?? []).map((e) => {
    const hook = e.availableHooks[0];
    return (hook?.payload?.dialogueId ?? hook?.id) as string;
  });
}

function fireGoblin(y: number, x: number, frozen = false): Enemy {
  const e = new Enemy({ y, x });
  e.kind = "fire-goblin";
  if (frozen) (e.behaviorMemory as Record<string, unknown>)["frozen"] = true;
  return e;
}

function ghost(y: number, x: number): Enemy {
  const e = new Enemy({ y, x });
  e.kind = "ghost";
  return e;
}

// --- room building -----------------------------------------------------------

describe("buildTutorialOpeningRoom", () => {
  const room = buildTutorialOpeningRoom();
  const roomEnemies = room.enemies ?? [];

  it("has the declared dimensions and passes the shape assertion", () => {
    expect(room.mapData.tiles.length).toBe(TUTORIAL_OPENING_DIMENSIONS.height);
    expect(room.mapData.tiles[0].length).toBe(TUTORIAL_OPENING_DIMENSIONS.width);
    expect(() => assertTutorialRoomShape(room)).not.toThrow();
  });

  it("spawns exactly one fire-goblin and it starts frozen", () => {
    const goblins = roomEnemies.filter((e) => e.kind === "fire-goblin");
    expect(goblins).toHaveLength(1);
    expect(goblins[0].behaviorMemory["frozen"]).toBe(true);
  });

  it("spawns the room-above earth/water goblins active (not frozen)", () => {
    const earth = roomEnemies.find((e) => e.kind === "earth-goblin");
    const water = roomEnemies.find((e) => e.kind === "water-goblin");
    expect(earth).toBeDefined();
    expect(water).toBeDefined();
    expect(earth!.behaviorMemory["frozen"]).toBeFalsy();
    expect(water!.behaviorMemory["frozen"]).toBeFalsy();
  });

  it("places at least one ghost, including one hidden inside a wall", () => {
    const ghosts = roomEnemies.filter((e) => e.kind === "ghost");
    expect(ghosts.length).toBeGreaterThanOrEqual(1);
    // The Q glyph spawns a ghost on a WALL tile (invisible until it emerges).
    const inWall = ghosts.some(
      (g) => room.mapData.tiles[g.y][g.x] === WALL
    );
    expect(inWall).toBe(true);
  });

  it("places exactly one exit door and one exit key", () => {
    let exits = 0;
    let exitKeys = 0;
    for (const row of room.mapData.subtypes) {
      for (const cell of row) {
        if (cell.includes(TileSubtype.EXIT)) exits++;
        if (cell.includes(TileSubtype.EXITKEY)) exitKeys++;
      }
    }
    expect(exits).toBe(1);
    expect(exitKeys).toBe(1);
  });

  it("places a locked sword chest, a locked shield chest, and a loose key", () => {
    let swordChest = false;
    let shieldChest = false;
    let keys = 0;
    for (const row of room.mapData.subtypes) {
      for (const cell of row) {
        if (
          cell.includes(TileSubtype.CHEST) &&
          cell.includes(TileSubtype.LOCK) &&
          cell.includes(TileSubtype.SWORD)
        ) {
          swordChest = true;
        }
        if (
          cell.includes(TileSubtype.CHEST) &&
          cell.includes(TileSubtype.LOCK) &&
          cell.includes(TileSubtype.SHIELD)
        ) {
          shieldChest = true;
        }
        if (cell.includes(TileSubtype.KEY)) keys++;
      }
    }
    expect(swordChest).toBe(true);
    expect(shieldChest).toBe(true);
    expect(keys).toBeGreaterThanOrEqual(1);
  });

  it("reveals every pot as food via potOverrides", () => {
    const overrides = Object.values(room.potOverrides ?? {});
    expect(overrides.length).toBeGreaterThan(0);
    expect(overrides.every((v) => v === TileSubtype.FOOD)).toBe(true);
  });
});

// --- initial tutorial state --------------------------------------------------

describe("buildTutorialState", () => {
  it("starts in tutorial mode with full health, lit torch, no beats", () => {
    const s = buildTutorialState();
    expect(s.mode).toBe("tutorial");
    expect(s.heroHealth).toBe(5);
    expect(s.heroTorchLit).toBe(true);
    expect(s.tutorialBeats).toEqual({});
    expect(s.allowCheckpoints).toBe(false);
  });

  it("queues the welcome dialogue on load", () => {
    const s = buildTutorialState();
    expect(dialogueIds(s)).toContain("tutorial-welcome");
  });

  it("places the player on the map", () => {
    const s = buildTutorialState();
    const hasPlayer = s.mapData.subtypes.some((row) =>
      row.some((cell) => cell.includes(TileSubtype.PLAYER))
    );
    expect(hasPlayer).toBe(true);
  });
});

// --- director beats ----------------------------------------------------------

describe("applyTutorialDirector", () => {
  it("is a no-op outside tutorial mode", () => {
    const s = baseState();
    s.mode = "daily";
    s.mapData = floorMap(3, 14);
    s.enemies = [];
    applyTutorialDirector(s, { y: 1, x: 12 });
    expect(dialogueIds(s)).toHaveLength(0);
  });

  it("arms goblin-intro on first sight, then fires and thaws on the next step", () => {
    const s = baseState();
    s.mapData = floorMap(1, 10);
    const g = fireGoblin(0, 4, true);
    s.enemies = [g];
    // First step in sight: arm only — no dialogue yet, goblin stays frozen so
    // the "A goblin!" line waits until he's actually drawn on screen.
    applyTutorialDirector(s, { y: 0, x: 1 });
    expect(dialogueIds(s)).not.toContain("tutorial-goblin-intro");
    expect(s.tutorialBeats?.["goblin-intro"]).not.toBe(true);
    expect(g.behaviorMemory["frozen"]).toBe(true);
    // Next director call: fire the intro and thaw the goblin.
    applyTutorialDirector(s, { y: 0, x: 1 });
    expect(dialogueIds(s)).toContain("tutorial-goblin-intro");
    expect(s.tutorialBeats?.["goblin-intro"]).toBe(true);
    expect(g.behaviorMemory["frozen"]).toBe(false);
  });

  it("arms then fires goblin-intro via the room-entry fallback even out of sight", () => {
    const s = baseState();
    s.mapData = floorMap(1, 26);
    // Goblin parked far away (distance > HUD sight) so the fallback path is
    // what triggers; it stays alive so goblin-defeated can't also fire.
    s.enemies = [fireGoblin(0, 25, true)];
    applyTutorialDirector(s, { y: 0, x: TUTORIAL_ROOM_ENTER_COL }); // arm
    expect(dialogueIds(s)).not.toContain("tutorial-goblin-intro");
    applyTutorialDirector(s, { y: 0, x: TUTORIAL_ROOM_ENTER_COL }); // fire
    expect(dialogueIds(s)).toContain("tutorial-goblin-intro");
  });

  it("fires goblin-defeated once the goblin is gone (after intro)", () => {
    const s = baseState();
    s.mapData = floorMap(3, 3);
    s.enemies = [];
    s.tutorialBeats = { "goblin-intro": true };
    applyTutorialDirector(s, { y: 0, x: 0 });
    expect(dialogueIds(s)).toContain("tutorial-goblin-defeated");
  });

  it("fires rock-pickup once the hero has a rock", () => {
    const s = baseState();
    s.mapData = floorMap(3, 3);
    s.enemies = [];
    s.rockCount = 1;
    applyTutorialDirector(s, { y: 0, x: 0 });
    expect(dialogueIds(s)).toContain("tutorial-rock-pickup");
  });

  it("fires sword-pickup and shield-pickup when equipped", () => {
    const sword = baseState();
    sword.mapData = floorMap(3, 3);
    sword.enemies = [];
    sword.hasSword = true;
    applyTutorialDirector(sword, { y: 0, x: 0 });
    expect(dialogueIds(sword)).toContain("tutorial-sword-pickup");

    const shield = baseState();
    shield.mapData = floorMap(3, 3);
    shield.enemies = [];
    shield.hasShield = true;
    applyTutorialDirector(shield, { y: 0, x: 0 });
    expect(dialogueIds(shield)).toContain("tutorial-shield-pickup");
  });

  it("fires chest-locked when stepping on a locked chest without a key", () => {
    const s = baseState();
    s.mapData = floorMap(3, 3);
    s.enemies = [];
    s.hasKey = false;
    s.mapData.subtypes[0][0] = [TileSubtype.CHEST, TileSubtype.LOCK];
    applyTutorialDirector(s, { y: 0, x: 0 });
    expect(dialogueIds(s)).toContain("tutorial-chest-locked");
  });

  it("picks the low-health dialogue variant based on food held", () => {
    const noFood = baseState();
    noFood.mapData = floorMap(3, 3);
    noFood.enemies = [];
    noFood.heroHealth = 1;
    noFood.foodCount = 0;
    applyTutorialDirector(noFood, { y: 0, x: 0 });
    expect(dialogueIds(noFood)).toContain("tutorial-low-health-no-food");

    const withFood = baseState();
    withFood.mapData = floorMap(3, 3);
    withFood.enemies = [];
    withFood.heroHealth = 1;
    withFood.foodCount = 2;
    applyTutorialDirector(withFood, { y: 0, x: 0 });
    expect(dialogueIds(withFood)).toContain("tutorial-low-health-with-food");
  });

  it("floors heroHealth at 1 so the guided run is non-lethal", () => {
    const s = baseState();
    s.mapData = floorMap(3, 3);
    s.enemies = [];
    s.heroHealth = 0; // a hit that would otherwise be fatal
    const out = applyTutorialDirector(s, { y: 0, x: 0 });
    expect(out.heroHealth).toBe(1);
  });

  it("still fires the low-health beat when a fatal hit is floored to 1 HP", () => {
    const s = baseState();
    s.mapData = floorMap(3, 3);
    s.enemies = [];
    s.heroHealth = -3; // overkill hit
    s.foodCount = 0;
    applyTutorialDirector(s, { y: 0, x: 0 });
    expect(s.heroHealth).toBe(1);
    expect(dialogueIds(s)).toContain("tutorial-low-health-no-food");
  });

  it("fires the ghost spotted / snuffed / relit sequence", () => {
    const spotted = baseState();
    spotted.mapData = floorMap(1, 5);
    spotted.enemies = [ghost(0, 2)];
    spotted.heroTorchLit = true;
    applyTutorialDirector(spotted, { y: 0, x: 0 });
    expect(dialogueIds(spotted)).toContain("tutorial-ghost-spotted");

    const snuffed = baseState();
    snuffed.mapData = floorMap(3, 3);
    snuffed.enemies = [];
    snuffed.heroTorchLit = false;
    applyTutorialDirector(snuffed, { y: 0, x: 0 });
    expect(dialogueIds(snuffed)).toContain("tutorial-ghost-snuffed");

    const relit = baseState();
    relit.mapData = floorMap(3, 3);
    relit.enemies = [];
    relit.heroTorchLit = true;
    relit.tutorialBeats = { "ghost-snuffed": true };
    applyTutorialDirector(relit, { y: 0, x: 0 });
    expect(dialogueIds(relit)).toContain("tutorial-light-relit");
  });

  it("does NOT fire ghost-spotted for a ghost still hidden in a wall", () => {
    const s = baseState();
    s.mapData = floorMap(1, 5);
    s.mapData.tiles[0][2] = WALL; // ghost is on a wall tile -> invisible
    s.enemies = [ghost(0, 2)];
    s.heroTorchLit = true;
    applyTutorialDirector(s, { y: 0, x: 1 });
    expect(dialogueIds(s)).not.toContain("tutorial-ghost-spotted");
  });

  it("fires exit-locked when adjacent to the exit without the exit key", () => {
    const s = baseState();
    s.mapData = floorMap(1, 3);
    s.enemies = [];
    s.hasExitKey = false;
    s.mapData.subtypes[0][1] = [TileSubtype.EXIT];
    applyTutorialDirector(s, { y: 0, x: 0 });
    expect(dialogueIds(s)).toContain("tutorial-exit-locked");
    expect(dialogueIds(s)).not.toContain("tutorial-exit-approach");
  });

  it("fires exit-approach (not exit-locked) when holding the exit key", () => {
    const s = baseState();
    s.mapData = floorMap(1, 3);
    s.enemies = [];
    s.hasExitKey = true;
    s.mapData.subtypes[0][1] = [TileSubtype.EXIT];
    applyTutorialDirector(s, { y: 0, x: 0 });
    expect(dialogueIds(s)).toContain("tutorial-exit-approach");
    expect(dialogueIds(s)).not.toContain("tutorial-exit-locked");
  });

  it("fires each beat at most once across repeated calls", () => {
    const s = baseState();
    s.mapData = floorMap(3, 3);
    s.enemies = [];
    s.rockCount = 1;
    applyTutorialDirector(s, { y: 0, x: 0 });
    applyTutorialDirector(s, { y: 0, x: 0 });
    const rockBeats = dialogueIds(s).filter(
      (id) => id === "tutorial-rock-pickup"
    );
    expect(rockBeats).toHaveLength(1);
  });
});

// --- tutorial -> daily handoff ----------------------------------------------

describe("buildDailyFloor2FromTutorial", () => {
  it("carries inventory into a fresh daily floor 2", () => {
    const tut = buildTutorialState();
    tut.heroHealth = 4;
    tut.hasSword = true;
    tut.hasShield = true;
    tut.foodCount = 3;
    tut.rockCount = 2;

    const floor2 = buildDailyFloor2FromTutorial(tut);

    expect(floor2.currentFloor).toBe(2);
    expect(floor2.mode).toBe("daily");
    expect(floor2.allowCheckpoints).toBe(false);
    expect(floor2.hasSword).toBe(true);
    expect(floor2.hasShield).toBe(true);
    expect(floor2.foodCount).toBe(3);
    expect(floor2.rockCount).toBe(2);
    expect(floor2.heroHealth).toBe(4);
    expect(floor2.hasExitKey).toBe(false);
    expect(floor2.win).toBe(false);
  });
});
