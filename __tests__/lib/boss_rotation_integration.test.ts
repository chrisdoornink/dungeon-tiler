import { movePlayer, Direction, TileSubtype } from "../../lib/map";
import type { GameState } from "../../lib/map/game-state";
import { BOSS_KINDS } from "../../lib/bosses/boss_roster";

/** A 5x5 room with the hero one step west of a boss-room entrance. */
function roomWithEntrance(bossKind: string): GameState {
  const tiles = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  const subtypes: number[][][] = tiles.map((r) => r.map(() => [] as number[]));
  subtypes[2][1] = [TileSubtype.PLAYER];
  subtypes[2][2] = [TileSubtype.BOSS_ENTRANCE];
  return {
    hasKey: false, hasExitKey: false, hasSword: true, hasShield: false,
    showFullMap: true, win: false, playerDirection: Direction.RIGHT,
    enemies: [], heroHealth: 5, heroMaxHealth: 5, heroAttack: 1, heroTorchLit: true,
    rockCount: 0, runeCount: 0, foodCount: 0, potionCount: 0,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [], mode: "normal",
    dailyBossKind: bossKind,
  } as unknown as GameState;
}

describe("every rostered boss can actually be entered", () => {
  test.each(BOSS_KINDS)("%s builds its arena on entry", (kind) => {
    const after = movePlayer(roomWithEntrance(kind), Direction.RIGHT);

    expect(after.inBossRoom).toBe(true);
    expect(after.bossKind).toBe(kind);
    // A real arena, not the 5x5 room we came from, with something alive in it.
    expect(after.mapData.tiles.length).toBeGreaterThan(5);
    expect((after.enemies ?? []).length).toBeGreaterThan(0);
    // And a way back out.
    const cells = after.mapData.subtypes.flat();
    expect(cells.some((c) => c.includes(TileSubtype.BOSS_ENTRANCE))).toBe(true);
  });

  test("the Quarrymaster arrives with his switch wiring intact", () => {
    // enterBossRoom deliberately takes only a few fields from the arena builder, so gate
    // wiring is easy to drop — and if it were dropped the switches would be inert and the
    // fight unwinnable, with nothing erroring to say so.
    const after = movePlayer(roomWithEntrance("quarrymaster"), Direction.RIGHT);

    expect(after.gateGroups).toBeDefined();
    expect(after.gateGroups).toHaveLength(4);
    for (const g of after.gateGroups!) {
      expect(g.open).toBe(false);
      expect(g.gates.length).toBeGreaterThan(0);
      const [py, px] = g.plate;
      expect(after.mapData.subtypes[py][px]).toContain(TileSubtype.PRESSURE_PLATE);
    }
    expect((after.enemies ?? []).some((e) => e.kind === "quarrymaster")).toBe(true);
  });

  test("bosses without plates carry no gate wiring", () => {
    const after = movePlayer(roomWithEntrance("shaper"), Direction.RIGHT);
    expect(after.gateGroups).toBeUndefined();
  });
});
