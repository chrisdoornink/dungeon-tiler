import { Direction, TileSubtype, type GameState, movePlayer } from "../../lib/map";
import { Enemy } from "../../lib/enemy";

describe("Goblin mirror variance with Math.random fallback", () => {
  function makeState(y: number, x: number, opts?: Partial<GameState>): GameState {
    const size = 25; // match GRID_SIZE in lib/map.ts
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
      // Important: leave combatRng undefined to exercise Math.random fallback
    } as unknown as GameState;
    return { ...base, ...(opts || {}) } as GameState;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.skip("goblin enemy contact damage uses -1/0/+1 around base 1 via Math.random", () => {
    // Set up: player at (2,2), goblin at (2,1) left of player
    const gs = makeState(2, 2);
    const e = new Enemy({ y: 2, x: 1 });
    e.kind = 'goblin';
    gs.enemies!.push(e);

    // Mock Math.random sequence: 0.1 (-1) -> 0 damage; 0.5 (0) -> 1; 0.9 (+1) -> 2
    const rnd = jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1) // -1 -> 0
      .mockReturnValueOnce(0.5) // 0 -> 1
      .mockReturnValueOnce(0.9); // +1 -> 2

    // Tick 1: move UP to avoid axis-away suppression; enemy should attack from left
    let before = gs.heroHealth;
    let after = movePlayer(gs, Direction.UP);
    expect(after.heroHealth).toBe(before - 0);

    // Tick 2
    before = after.heroHealth;
    after = movePlayer(after, Direction.DOWN);
    expect(after.heroHealth).toBe(before - 1);

    // Tick 3
    before = after.heroHealth;
    after = movePlayer(after, Direction.LEFT);
    // Per-tick cap is 2, expected 2 here
    expect(after.heroHealth).toBe(before - 2);

    // Ensure our mock was used
    expect(rnd).toHaveBeenCalled();
  });

  test("hero melee vs goblin uses -1/0/+1 around base 1 via Math.random", () => {
    // Player at (4,4), goblin at (4,5). Attack by moving RIGHT.
    const base = makeState(4, 4);
    const g = new Enemy({ y: 4, x: 5 });
    g.kind = 'goblin';
    g.health = 5;
    const gs: GameState = { ...base, enemies: [g] } as GameState;

    // Mock Math.random with pairs: first per case consumed by enemy tick, second used by hero melee variance
    // Cases desired for hero melee: -1 (0 dmg), 0 (1 dmg), +1 (2 dmg)
    const rnd = jest.spyOn(Math, 'random');

    // Case 1: -1 -> 0 damage
    // Case 1: enemy tick consumes 0.5; hero melee sees 0.1 (-1 -> 0 dmg)
    rnd.mockReturnValueOnce(0.5).mockReturnValueOnce(0.1);
    let after = movePlayer(gs, Direction.RIGHT);
    expect(after.stats.damageDealt).toBe(0);
    expect(after.enemies![0].health).toBe(5);

    // Reset for next case
    const base2 = makeState(4, 4);
    const g2 = new Enemy({ y: 4, x: 5 });
    g2.kind = 'goblin';
    g2.health = 5;
    const gs2: GameState = { ...base2, enemies: [g2] } as GameState;

    // Case 2: 0 -> 1 damage
    // Case 2: enemy tick consumes 0.5; hero melee sees 0.5 (0 -> 1 dmg)
    rnd.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
    after = movePlayer(gs2, Direction.RIGHT);
    expect(after.stats.damageDealt).toBe(1);
    expect(after.enemies![0].health).toBe(4);

    // Reset for next case
    const base3 = makeState(4, 4);
    const g3 = new Enemy({ y: 4, x: 5 });
    g3.kind = 'goblin';
    g3.health = 5;
    const gs3: GameState = { ...base3, enemies: [g3] } as GameState;

    // Case 3: +1 -> 2 damage
    // Case 3: enemy tick consumes 0.5; hero melee sees 0.9 (+1 -> 2 dmg)
    rnd.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9);
    after = movePlayer(gs3, Direction.RIGHT);
    expect(after.stats.damageDealt).toBe(2);
    expect(after.enemies![0].health).toBe(3);
  });
});
