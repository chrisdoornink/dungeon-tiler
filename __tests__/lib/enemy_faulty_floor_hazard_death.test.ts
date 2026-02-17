import { Enemy } from "../../lib/enemy";
import { movePlayer, Direction, TileSubtype } from "../../lib/map";
import type { GameState } from "../../lib/map/game-state";

function createBaseGameState(): GameState {
  const tiles = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const subtypes = [
    [[], [TileSubtype.PLAYER], []],
    [[], [TileSubtype.FAULTY_FLOOR], []],
    [[], [], []],
  ];

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: { tiles, subtypes },
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [],
    npcs: [],
    heroHealth: 5,
    heroAttack: 1,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: undefined,
    },
    recentDeaths: [],
  } as unknown as GameState;
}

function createEnemy(kind: "fire-goblin" | "water-goblin" | "stone-goblin"): Enemy {
  const enemy = new Enemy({ y: 2, x: 1 });
  enemy.kind = kind;
  return enemy;
}

describe("Enemy faulty floor hazard deaths", () => {
  ( ["fire-goblin", "stone-goblin"] as const ).forEach((kind) => {
    test(`${kind} standing on faulty floor is removed and counted as defeated`, () => {
      const base = createBaseGameState();
      const enemy = createEnemy(kind);
      base.enemies = [enemy];

      const next = movePlayer(base, Direction.RIGHT);

      // Enemy should be removed
      expect(next.enemies ?? []).toHaveLength(0);

      // recentDeaths should include the faulty floor position
      expect(next.recentDeaths).toEqual([[1, 1]]);

      // enemiesDefeated and byKind should be incremented
      expect(next.stats.enemiesDefeated).toBe(1);
      const byKind = next.stats.byKind!;
      expect(byKind[kind]).toBe(1);
    });
  });
});
