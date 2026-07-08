import {
  generateMapWithSubtypes,
  Direction,
  TileSubtype,
  movePlayer,
  type GameState,
} from "../../lib/map";
import { Enemy } from "../../lib/enemy";

// Pink goblins flee point-blank, vacating their tile before the hero's strike resolves.
// That made them un-catchable for a melee-only hero (chase forever, never connect). A
// "chase hit" now gives the pursuit a reduced-but-real chance to clip the fleer so a
// full-health pink goblin (4 HP) dies within roughly 5-10 tiles of chasing.

// Build an open horizontal corridor with the hero at (5,5) and a pink goblin one tile to
// the right at (5,6), with open space to the right for it to retreat into.
function chaseState(overrides: Partial<GameState> = {}): GameState {
  const base = generateMapWithSubtypes();
  for (let y = 0; y < base.tiles.length; y++) {
    for (let x = 0; x < base.tiles[y].length; x++) {
      base.tiles[y][x] = 1;
      base.subtypes[y][x] = [];
    }
  }
  const py = 5;
  for (let x = 3; x <= 11; x++) {
    base.tiles[py][x] = 0;
    base.subtypes[py][x] = [];
  }
  base.subtypes[py][5] = [TileSubtype.PLAYER];

  const goblin = new Enemy({ y: py, x: 6 });
  goblin.kind = "pink-goblin";
  goblin.health = 4;
  goblin.behaviorMemory.aware = true;

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: base,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [goblin],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
    ...overrides,
  } as GameState;
}

describe("pink goblin chase hit", () => {
  test("lunging at a fleeing pink goblin can land a clipping blow", () => {
    // rng() < 0.5 -> chase hit connects; second draw picks damage variance.
    const state = chaseState({ combatRng: () => 0.1 });
    const goblinBefore = state.enemies![0];
    expect(goblinBefore.health).toBe(4);

    const after = movePlayer(state, Direction.RIGHT);
    const goblinAfter = after.enemies?.find((e) => e.kind === "pink-goblin");

    // The goblin fled its tile...
    expect(goblinAfter && (goblinAfter.y !== 5 || goblinAfter.x !== 6)).toBe(true);
    // ...and still took chase damage on the way out.
    expect(goblinAfter!.health).toBeLessThan(4);
    expect(after.stats.damageDealt).toBeGreaterThan(0);
  });

  test("a missed chase roll leaves the fleeing goblin unharmed", () => {
    // rng() >= 0.5 -> chase hit misses.
    const state = chaseState({ combatRng: () => 0.9 });
    const after = movePlayer(state, Direction.RIGHT);
    const goblinAfter = after.enemies?.find((e) => e.kind === "pink-goblin");

    expect(goblinAfter).toBeDefined();
    expect(goblinAfter!.health).toBe(4);
    expect(after.stats.damageDealt).toBe(0);
  });

  test("a determined chase kills a full-health pink goblin within ~10 tiles", () => {
    let state = chaseState({ combatRng: () => 0.1 }); // always connect, small damage
    let killed = false;
    for (let i = 0; i < 10; i++) {
      state = movePlayer(state, Direction.RIGHT);
      if (!state.enemies?.some((e) => e.kind === "pink-goblin")) {
        killed = true;
        break;
      }
    }
    expect(killed).toBe(true);
    expect(state.stats.enemiesDefeated).toBeGreaterThanOrEqual(1);
  });
});
