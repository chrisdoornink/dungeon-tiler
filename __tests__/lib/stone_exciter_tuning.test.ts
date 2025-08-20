jest.mock("../../lib/enemy", () => {
  const actual = jest.requireActual("../../lib/enemy");
  return { ...actual, updateEnemies: jest.fn(() => 0) };
});
import { Enemy } from "../../lib/enemy";
import { Direction, GameState, TileSubtype, movePlayer, performThrowRock } from "../../lib/map";

function makeOpen(n = 25) {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

function makeSubs(n = 25) {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));
}

describe("stone-exciter tuning: health and damage interactions", () => {
  test("stone-exciter initializes with 8 health", () => {
    const e = new Enemy({ y: 4, x: 4 });
    e.kind = "stone-exciter";
    expect(e.health).toBe(8);
  });

  test("sword attacks deal exactly 1 damage to stone-exciters (no variance)", () => {
    const size = 25;
    const tiles = makeOpen(size);
    const subs = makeSubs(size);
    // Place player at center and stone-exciter to the right
    const py = 4, px = 4;
    subs[py][px] = [TileSubtype.PLAYER];

    const exciter = new Enemy({ y: py, x: px + 1 });
    exciter.kind = "stone-exciter"; // should be 8 HP

    const gs: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: true, // sword equipped
      hasShield: false,
      mapData: { tiles, subtypes: subs },
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [exciter],
      heroHealth: 5,
      heroAttack: 1,
      // Deterministic high roll variance; should still be capped to 1 dmg
      combatRng: () => 0.99,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      rockCount: 0,
      heroTorchLit: true,
    };

    // Move right into the enemy to attack
    const after = movePlayer(gs, Direction.RIGHT);

    // Enemy should remain and have lost exactly 1 HP
    expect(after.enemies && after.enemies.length).toBe(1);
    const post = after.enemies![0];
    expect(post.kind).toBe("stone-exciter");
    expect(post.health).toBe(7);
    // Damage dealt stat should increment by 1
    expect(after.stats.damageDealt).toBe(1);
  });

  test("rocks deal 2 damage to stone-exciters on hit", () => {
    const size = 25;
    const tiles = makeOpen(size);
    const subs = makeSubs(size);
    const py = 4, px = 2;
    subs[py][px] = [TileSubtype.PLAYER];

    const exciter = new Enemy({ y: py, x: px + 3 });
    exciter.kind = "stone-exciter"; // 8 HP

    const gs: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: { tiles, subtypes: subs },
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [exciter],
      heroHealth: 5,
      heroAttack: 1,
      combatRng: () => 0.5,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      rockCount: 1,
      heroTorchLit: true,
    };

    const after = performThrowRock(gs);

    expect(after.enemies && after.enemies.length).toBe(1);
    const post = after.enemies![0];
    expect(post.kind).toBe("stone-exciter");
    expect(post.health).toBe(6); // 8 - 2
  });
});
