import {
  Direction,
  GameState,
  MapData,
  TileSubtype,
  movePlayer,
} from "../../lib/map";
import { Enemy } from "../../lib/enemy";
import type { EnemyKind } from "../../lib/enemies/registry";

function buildState(enemyKind: EnemyKind, torchLit: boolean): GameState {
  const mapData: MapData = {
    tiles: Array(9)
      .fill(0)
      .map(() => Array(9).fill(0)),
    subtypes: Array(9)
      .fill(0)
      .map(() =>
        Array(9)
          .fill(0)
          .map(() => [] as number[])
      ),
  };
  mapData.subtypes[4][4] = [TileSubtype.PLAYER];

  const enemy = new Enemy({ y: 4, x: 5 });
  enemy.kind = enemyKind;
  enemy.health = 10; // survives the hit; relight must not depend on a kill

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [enemy],
    heroHealth: 5,
    heroAttack: 1,
    combatRng: () => 0.9, // pin variance to +1 so every test hit lands
    heroTorchLit: torchLit,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
  };
}

describe("flame transfer: melee-striking a torch carrier relights the hero", () => {
  it("relights a snuffed torch when attacking a fire goblin", () => {
    const state = buildState("fire-goblin", false);
    const next = movePlayer(state, Direction.RIGHT);
    expect(next.heroTorchLit).toBe(true);
    expect(next.stats.damageDealt).toBeGreaterThan(0); // the attack landed
  });

  it("also works on a killing blow", () => {
    const state = buildState("fire-goblin", false);
    state.enemies![0].health = 1;
    const next = movePlayer(state, Direction.RIGHT);
    expect(next.heroTorchLit).toBe(true);
    expect(next.stats.enemiesDefeated).toBe(1);
  });

  it("does NOT relight when attacking a torchless goblin", () => {
    const state = buildState("earth-goblin", false);
    const next = movePlayer(state, Direction.RIGHT);
    expect(next.heroTorchLit).toBe(false);
  });

  it("leaves an already-lit torch lit", () => {
    const state = buildState("fire-goblin", true);
    const next = movePlayer(state, Direction.RIGHT);
    expect(next.heroTorchLit).toBe(true);
  });
});
