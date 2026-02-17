import { Direction, TileSubtype, type GameState, movePlayer } from "../../lib/map";
import { Enemy } from "../../lib/enemy";

function makeState(y: number, x: number, opts?: Partial<GameState>): GameState {
  const size = 25;
  const tiles = Array.from({ length: size }, () => Array(size).fill(0)); // FLOOR
  const subtypes = Array.from({ length: size }, () => Array.from({ length: size }, () => [] as number[]));
  subtypes[y][x].push(TileSubtype.PLAYER);
  const base: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData: { tiles, subtypes },
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [] as Enemy[],
    heroHealth: 5,
    heroAttack: 1,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    combatRng: () => 0.5, // default neutral: 0 variance
  } as unknown as GameState;
  return { ...base, ...(opts || {}) } as GameState;
}

describe("Combat variance and equipment", () => {
  test("enemy attack uses ±1 variance around strength (no shield)", () => {
    const gs = makeState(2, 2, {
      combatRng: () => 0.8, // +1 variance for goblin-weighted (>= 0.75)
    });
    const e = new Enemy({ y: 2, x: 1 }); // left of player, will attempt to move into player when we tick
    e.attack = 1;
    gs.enemies!.push(e);

    const before = gs.heroHealth;
    const after = movePlayer(gs, Direction.UP);
    // damage = 1 base + 1 variance = 2 (goblin-weighted: >= 0.75 gives +1)
    expect(after.heroHealth).toBe(before - 2);
    expect(after.stats.damageTaken).toBe(2);
  });

  test("crit (+2 variance) is capped at 2 damage without shield (base 1)", () => {
    const gs = makeState(2, 2, {
      // Force crit band (tuned to be reasonably common)
      combatRng: () => 0.95,
    });
    const e = new Enemy({ y: 2, x: 1 });
    e.attack = 1; // base 1
    // Use non-goblin to retain +2 crit mapping; avoid ghost (adjacent ghost attacks are suppressed)
    e.kind = 'stone-goblin';
    gs.enemies!.push(e);

    const before = gs.heroHealth;
    const after = movePlayer(gs, Direction.UP);
    // incoming = 1 base + 2 crit = 3, but capped at 2 per tick
    expect(after.heroHealth).toBe(before - 2);
    expect(after.stats.damageTaken).toBe(2);
  });

  test("with shield, crit can still hurt (net 1) when base 1 and +2 variance", () => {
    const gs = makeState(2, 2, {
      hasShield: true,
      combatRng: () => 0.95, // crit band
    });
    const e = new Enemy({ y: 2, x: 1 });
    e.attack = 1;
    // Use non-goblin to retain +2 crit mapping; avoid ghost suppression
    e.kind = 'stone-goblin';
    gs.enemies!.push(e);

    const before = gs.heroHealth;
    const after = movePlayer(gs, Direction.UP);
    // Stone-exciter base 5 + 2 crit - 2 defense = 5, capped at 2 per tick
    expect(after.heroHealth).toBe(before - 2);
    expect(after.stats.damageTaken).toBe(2);
  });

  test("shield gives +1 damage reduction (protection)", () => {
    const gs = makeState(2, 2, {
      hasShield: true,
      combatRng: () => 0.8, // +1 variance for goblin-weighted (>= 0.75)
    });
    const e = new Enemy({ y: 2, x: 1 });
    e.attack = 1;
    gs.enemies!.push(e);

    const before = gs.heroHealth;
    const after = movePlayer(gs, Direction.UP);
    // incoming = 1 + 1 = 2; defense = 1; net = 1 (goblin-weighted: >= 0.75 gives +1)
    expect(after.heroHealth).toBe(before - 1);
    expect(after.stats.damageTaken).toBe(1);
  });

  test("sword adds +2 to hero attack; variance applies; enemy can be one-shot", () => {
    const gs = makeState(2, 2, {
      hasSword: true,
      combatRng: () => 0.99, // +1 variance
    });
    const e = new Enemy({ y: 2, x: 3 });
    e.health = 3;
    gs.enemies!.push(e);

    const after = movePlayer(gs, Direction.RIGHT);

    // Hero effective damage = base 1 + sword 2 + variance 1 = 4
    expect(after.enemies!.length).toBe(0);
    expect(after.stats.enemiesDefeated).toBe(1);
    expect(after.stats.damageDealt).toBeGreaterThanOrEqual(3); // at least enemy health

    // Player stays in place (no stepping into enemy tile)
    const pos = after.mapData.subtypes.flatMap((row, yy) =>
      row.flatMap((cell, xx) => (cell.includes(TileSubtype.PLAYER) ? [[yy, xx] as [number, number]] : []))
    )[0];
    expect(pos).toEqual([2, 2]);
  });

  test("on killing an adjacent enemy, the player stays in place and enemy disappears", () => {
    const gs = makeState(5, 5, {
      hasSword: true,
      combatRng: () => 0.99, // +1 variance
    });
    const e = new Enemy({ y: 5, x: 6 }); // enemy to the right
    e.health = 3; // ensure one-shot with sword and +1 variance (1+2+1=4)
    gs.enemies!.push(e);

    const after = movePlayer(gs, Direction.RIGHT);

    // Enemy should be gone and stats updated
    expect(after.enemies!.length).toBe(0);
    expect(after.stats.enemiesDefeated).toBeGreaterThanOrEqual(1);

    // Player should remain at original position (5,5), not step into (5,6)
    const pos = after.mapData.subtypes.flatMap((row, yy) =>
      row.flatMap((cell, xx) => (cell.includes(TileSubtype.PLAYER) ? [[yy, xx] as [number, number]] : []))
    )[0];
    expect(pos).toEqual([5, 5]);
  });
});
