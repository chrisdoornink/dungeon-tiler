import {
  Direction,
  TileSubtype,
  movePlayer,
  reviveFromLastCheckpoint,
  type GameState,
} from "../../lib/map";
import { Enemy } from "../../lib/enemy";

describe("checkpoint system", () => {
  const baseStats = () => ({
    damageDealt: 0,
    damageTaken: 0,
    enemiesDefeated: 0,
    steps: 0,
  });

  const buildState = (): GameState => ({
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: {
      tiles: [
        [0, 0],
        [0, 0],
      ],
      subtypes: [
        [[], []],
        [[TileSubtype.PLAYER], [TileSubtype.CHECKPOINT]],
      ],
    },
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 3,
    heroAttack: 1,
    rockCount: 0,
    runeCount: 0,
    stats: baseStats(),
    recentDeaths: [],
    heroTorchLit: true,
  });

  xit("records a snapshot when stepping on a checkpoint", () => {
    const moved = movePlayer(buildState(), Direction.RIGHT);

    expect(moved.lastCheckpoint).toBeDefined();
    expect(moved.stats.steps).toBe(1);
    expect(moved.lastCheckpoint?.stats.steps).toBe(1);
    expect(moved.lastCheckpoint?.mapData.subtypes[1][1]).toEqual([
      TileSubtype.CHECKPOINT,
      TileSubtype.PLAYER,
    ]);
    expect(moved.lastCheckpoint?.heroHealth).toBe(3);
  });

  xit("revives from checkpoint state with rehydrated enemies", () => {
    const moved = movePlayer(buildState(), Direction.RIGHT);
    const checkpoint = { ...moved.lastCheckpoint! };
    checkpoint.enemies = [
      {
        y: 0,
        x: 0,
        kind: "snake",
        health: 1,
        attack: 1,
        facing: "UP",
      },
    ];

    const deadState: GameState = {
      ...moved,
      heroHealth: 0,
      enemies: undefined,
      lastCheckpoint: checkpoint,
    };

    const revived = reviveFromLastCheckpoint(deadState);
    expect(revived).not.toBeNull();
    expect(revived?.heroHealth).toBe(3);
    expect(revived?.stats.steps).toBe(1);
    expect(revived?.enemies).toHaveLength(1);
    expect(revived?.enemies?.[0]).toBeInstanceOf(Enemy);
    // Ensure stored checkpoint remains plain data (no Enemy instance leaked)
    expect(Array.isArray(revived?.lastCheckpoint?.enemies)).toBe(true);
    if (revived?.lastCheckpoint?.enemies?.[0]) {
      expect(revived.lastCheckpoint.enemies[0]).not.toBeInstanceOf(Enemy);
    }
  });
});
