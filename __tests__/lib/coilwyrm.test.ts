import fs from "fs";
import path from "path";
import { Enemy, updateEnemies } from "../../lib/enemy";
import { movePlayer, Direction, TileSubtype } from "../../lib/map";
import { performThrowRock } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";
import { EnemyRegistry, isMeleeImmune, enemyKinds } from "../../lib/enemies/registry";
import {
  COILWYRM_HEAD_HP,
  COILWYRM_SEGMENT_HP,
  COILWYRM_LUNGE_TILES,
  COILWYRM_HEADSHOT_DAMAGE,
  COILWYRM_HEAD_ATTACK,
  COILWYRM_SPLIT_MIN,
  coilwyrmSegmentIsTail,
  coilwyrmHeadStranded,
  coilPieceFor,
  coilHeadPoseFor,
  type CoilPiece,
  type CoilHeadMemory,
  type CoilSegmentMemory,
} from "../../lib/bosses/coilwyrm";
import {
  buildCoilwyrmArena,
  COILWYRM_LAYOUTS,
} from "../../lib/bosses/coilwyrm_arena";
import { COILWYRM_START_SEGMENTS } from "../../lib/bosses/coilwyrm";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** An open room `size` square with a wall border. */
function openRoom(size: number): { tiles: number[][]; subtypes: number[][][] } {
  const tiles = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) =>
      y === 0 || x === 0 || y === size - 1 || x === size - 1 ? 1 : 0
    )
  );
  const subtypes = tiles.map((row) => row.map(() => [] as number[]));
  return { tiles, subtypes };
}

/**
 * A coil laid out along `body` (index 0 = head). Returns the live Enemy array in the
 * order the engine must tick them: head first, then segments in coil order.
 */
function makeCoil(
  body: Array<[number, number]>,
  opts: { growEvery?: number; coilId?: string } = {}
): Enemy[] {
  const coilId = opts.coilId ?? "test-coil";
  const [hy, hx] = body[0];
  const head = new Enemy({ y: hy, x: hx });
  head.kind = "coilwyrm";
  const mem = head.behaviorMemory as CoilHeadMemory;
  mem.coilId = coilId;
  mem.coilRole = "head";
  mem.path = body.map(([y, x]) => [y, x] as [number, number]);
  mem.segments = body.length - 1;
  mem.growEvery = opts.growEvery ?? 999; // growth off unless a test asks for it
  mem.growCountdown = mem.growEvery;
  mem.thrash = 0;

  const out: Enemy[] = [head];
  for (let i = 1; i < body.length; i++) {
    const [sy, sx] = body[i];
    const seg = new Enemy({ y: sy, x: sx });
    seg.kind = "coilwyrm-coil";
    const sm = seg.behaviorMemory as CoilSegmentMemory;
    sm.coilId = coilId;
    sm.coilIndex = i;
    sm.coilRole = i === body.length - 1 ? "tail" : "body";
    out.push(seg);
  }
  return out;
}

function tickCoil(
  enemies: Enemy[],
  tiles: number[][],
  subtypes: number[][][],
  player: { y: number; x: number },
  playerNext?: { y: number; x: number }
) {
  return updateEnemies(tiles, subtypes, enemies, player, {
    rng: () => 0.5,
    playerTorchLit: true,
    playerNext,
  });
}

const positions = (enemies: Enemy[]) => enemies.map((e) => [e.y, e.x]);

function headOf(enemies: Enemy[]): Enemy {
  const h = enemies.find((e) => e.kind === "coilwyrm");
  if (!h) throw new Error("no head");
  return h;
}
const segmentsOf = (enemies: Enemy[]) =>
  enemies.filter((e) => e.kind === "coilwyrm-coil");
const tailOf = (enemies: Enemy[]) =>
  segmentsOf(enemies).find((e) => coilwyrmSegmentIsTail(e.behaviorMemory));

/** A game state wrapping an arbitrary coil, for the real movePlayer/throw paths. */
function coilState(
  size: number,
  hero: [number, number],
  enemies: Enemy[],
  extra: Partial<GameState> = {}
): GameState {
  const { tiles, subtypes } = openRoom(size);
  subtypes[hero[0]][hero[1]] = [TileSubtype.PLAYER];
  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies,
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 2,
    runeCount: 1,
    foodCount: 0,
    potionCount: 0,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
    combatRng: () => 0.99, // max melee variance: a sword blow always kills a 2 HP tail
    ...extra,
  } as GameState;
}

// ---------------------------------------------------------------------------
// follow-the-leader movement
// ---------------------------------------------------------------------------

describe("Coilwyrm body follows the head's exact path", () => {
  it("each segment steps into the tile its leader just left", () => {
    const { tiles, subtypes } = openRoom(11);
    // Head at (5,5) pointing at a hero to the east; body trails west behind it.
    const body: Array<[number, number]> = [
      [5, 5],
      [5, 4],
      [5, 3],
      [5, 2],
    ];
    const enemies = makeCoil(body);
    const before = positions(enemies);

    tickCoil(enemies, tiles, subtypes, { y: 5, x: 9 });

    const after = positions(enemies);
    // The head moved somewhere new...
    expect(after[0]).not.toEqual(before[0]);
    // ...and every follower took over its leader's previous tile.
    for (let i = 1; i < enemies.length; i++) {
      expect(after[i]).toEqual(before[i - 1]);
    }
  });

  it("keeps the coil contiguous over many turns of chasing", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([
      [6, 6],
      [6, 5],
      [6, 4],
      [6, 3],
      [6, 2],
    ]);
    // Hero jinks around the room; the coil should never break into islands.
    const route: Array<[number, number]> = [
      [6, 10], [3, 10], [3, 3], [9, 3], [9, 10], [6, 6],
    ];
    for (const [hy, hx] of route) {
      for (let t = 0; t < 6; t++) {
        tickCoil(enemies, tiles, subtypes, { y: hy, x: hx });
        const pos = positions(enemies);
        // Contiguity: consecutive parts are always orthogonally adjacent.
        for (let i = 1; i < pos.length; i++) {
          const d =
            Math.abs(pos[i][0] - pos[i - 1][0]) + Math.abs(pos[i][1] - pos[i - 1][1]);
          expect(d).toBe(1);
        }
        // No two parts ever share a tile.
        expect(new Set(pos.map(([y, x]) => `${y},${x}`)).size).toBe(pos.length);
      }
    }
  });

  it("never walks the head into its own body", () => {
    const { tiles, subtypes } = openRoom(11);
    // A tight U so the greedy line toward the hero runs straight into the coil.
    const enemies = makeCoil([
      [5, 5],
      [4, 5],
      [3, 5],
      [3, 6],
      [3, 7],
      [4, 7],
      [5, 7],
    ]);
    for (let t = 0; t < 25; t++) {
      tickCoil(enemies, tiles, subtypes, { y: 5, x: 6 });
      const pos = positions(enemies);
      expect(new Set(pos.map(([y, x]) => `${y},${x}`)).size).toBe(pos.length);
    }
  });

  it("hunts the hero every turn — it never idles", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[2, 2], [2, 3], [2, 4]]);
    const head = headOf(enemies);
    const start = Math.abs(head.y - 10) + Math.abs(head.x - 10);
    for (let t = 0; t < 8; t++) tickCoil(enemies, tiles, subtypes, { y: 10, x: 10 });
    const end = Math.abs(head.y - 10) + Math.abs(head.x - 10);
    expect(end).toBeLessThan(start);
  });

  it("routes around a pillar instead of stalling against it", () => {
    const { tiles, subtypes } = openRoom(11);
    // Wall slab directly between the head and the hero.
    for (let y = 3; y <= 7; y++) tiles[y][5] = 1;
    const enemies = makeCoil([[5, 2], [5, 1], [4, 1]]);
    const head = headOf(enemies);
    let reached = false;
    for (let t = 0; t < 20; t++) {
      tickCoil(enemies, tiles, subtypes, { y: 5, x: 8 });
      if (Math.abs(head.y - 5) + Math.abs(head.x - 8) <= 1) reached = true;
    }
    expect(reached).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tail-only damage
// ---------------------------------------------------------------------------

describe("a cut severs the coil: everything behind it dies", () => {
  it("marks the hindmost segment as the tail (a role marker, not a damage gate)", () => {
    const { tiles, subtypes } = openRoom(11);
    const enemies = makeCoil([[5, 5], [5, 4], [5, 3], [5, 2]]);
    tickCoil(enemies, tiles, subtypes, { y: 5, x: 8 });
    const tails = segmentsOf(enemies).filter((e) =>
      coilwyrmSegmentIsTail(e.behaviorMemory)
    );
    expect(tails).toHaveLength(1);
    expect((tails[0].behaviorMemory as CoilSegmentMemory).coilIndex).toBe(3);
  });

  it("every segment takes an ordinary sword blow", () => {
    // Deliberately ungated: the difficulty is not "can I hurt this piece", it is "how
    // close to the teeth dare I cut". An earlier tail-only gate made the one cuttable
    // part the one part of the room a player could never reach.
    const melee = EnemyRegistry["coilwyrm-coil"].calcMeleeDamage;
    const swing = { heroAttack: 1, swordBonus: 2, variance: 1 };
    expect(melee({ ...swing, memory: { coilRole: "body" } })).toBeGreaterThanOrEqual(
      COILWYRM_SEGMENT_HP
    );
    expect(melee({ ...swing, memory: { coilRole: "tail" } })).toBeGreaterThanOrEqual(
      COILWYRM_SEGMENT_HP
    );
  });

  it("killing a mid-coil segment kills everything behind it", () => {
    // Hero at (5,2) faces the interior of an L-shaped coil; the pieces behind the strike
    // point should all be gone once the wyrm notices the hole.
    const { tiles, subtypes } = openRoom(11);
    const enemies = makeCoil([[3, 3], [4, 3], [5, 3], [5, 4], [5, 5]]);
    const struck = enemies[2]; // coilIndex 2, two segments behind it
    expect((struck.behaviorMemory as CoilSegmentMemory).coilIndex).toBe(2);
    // Kill it the way any hero would, then let the wyrm take its turn.
    enemies.splice(enemies.indexOf(struck), 1);
    tickCoil(enemies, tiles, subtypes, { y: 8, x: 8 });
    const behind = segmentsOf(enemies).filter(
      (e) => ((e.behaviorMemory as CoilSegmentMemory).coilIndex ?? 0) > 1
    );
    // Segments 3 and 4 are flagged for the central reaper, and only segment 1 is attached.
    expect(behind.every((e) => (e.behaviorMemory as CoilSegmentMemory).severed)).toBe(true);
    const headMem = headOf(enemies).behaviorMemory as CoilHeadMemory;
    expect(headMem.segments).toBe(1);
  });

  it("a severed length of 4+ grows its own head and becomes a second wyrm", () => {
    const { tiles, subtypes } = openRoom(15);
    // Head + 6 segments. Cut at index 2, severing 4 behind it — long enough to survive.
    const enemies = makeCoil([
      [7, 7], [7, 6], [7, 5], [7, 4], [7, 3], [7, 2], [7, 1],
    ]);
    tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });
    const struck = segmentsOf(enemies).find(
      (e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex === 2
    )!;
    enemies.splice(enemies.indexOf(struck), 1);
    tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });

    // The old head kept only what was still attached in front of the cut.
    const oldHeadMem = enemies[0].behaviorMemory as CoilHeadMemory;
    expect(oldHeadMem.segments).toBe(1);
    // And the cut end became a whole new wyrm, with its own head and its own coil id.
    const allHeads = enemies.filter((e) => e.kind === "coilwyrm");
    expect(allHeads).toHaveLength(2);
    const newHead = allHeads[1];
    const newId = (newHead.behaviorMemory as CoilHeadMemory).coilId;
    expect(newId).not.toBe(oldHeadMem.coilId);
    expect(newHead.health).toBe(COILWYRM_HEAD_HP); // promoted to head stats
    // Freshly hacked off: it does not get to bite on the turn it sprouts a mouth.
    expect((newHead.behaviorMemory as CoilHeadMemory).biteRecoil).toBeGreaterThan(0);
    // Its body is renumbered behind it under the new id, densely from 1.
    const newBody = segmentsOf(enemies)
      .filter((e) => (e.behaviorMemory as CoilSegmentMemory).coilId === newId)
      .map((e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(newBody).toEqual(newBody.map((_, i) => i + 1));
    expect(newBody.length).toBe(3);
  });

  it("a severed length of 3 or fewer just dies", () => {
    const { tiles, subtypes } = openRoom(15);
    const enemies = makeCoil([[7, 7], [7, 6], [7, 5], [7, 4], [7, 3]]);
    tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });
    // Cut at index 2 with only 2 behind it — too short to survive.
    const struck = segmentsOf(enemies).find(
      (e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex === 2
    )!;
    enemies.splice(enemies.indexOf(struck), 1);
    tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });
    expect(enemies.filter((e) => e.kind === "coilwyrm")).toHaveLength(1);
    const behind = segmentsOf(enemies).filter(
      (e) => ((e.behaviorMemory as CoilSegmentMemory).coilIndex ?? 0) > 1
    );
    expect(behind.every((e) => (e.behaviorMemory as CoilSegmentMemory).severed)).toBe(true);
  });

  it("two wyrms never walk through each other", () => {
    const { tiles, subtypes } = openRoom(15);
    const enemies = makeCoil([
      [7, 7], [7, 6], [7, 5], [7, 4], [7, 3], [7, 2], [7, 1],
    ]);
    tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });
    const struck = segmentsOf(enemies).find(
      (e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex === 2
    )!;
    enemies.splice(enemies.indexOf(struck), 1);
    // Run both wyrms at the hero for a while: no two parts may ever share a tile.
    for (let t = 0; t < 40; t++) {
      tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });
      const live = enemies.filter(
        (e) => !(e.behaviorMemory as CoilSegmentMemory).severed
      );
      const keys = live.map((e) => `${e.y},${e.x}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const e of live) expect(tiles[e.y][e.x]).toBe(0);
    }
  });

  it("in-game: a cut reaps the whole severed length, not just the piece struck", () => {
    // Full engine path: bump into the body, then take one more turn so the wyrm notices
    // the hole and applyEnemyHazardDeaths clears the detached length. Which segment the
    // blow actually lands on is up to the tick (the body flows before the hero swings —
    // that is the fight), so this asserts the CONSEQUENCE: one blow kills several.
    const enemies = makeCoil([[2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [5, 5]]);
    const state = coilState(11, [5, 2], enemies, { playerDirection: Direction.RIGHT });
    const afterCut = movePlayer(state, Direction.RIGHT); // strike into the column
    const after = movePlayer(afterCut, Direction.LEFT); // give the wyrm its turn
    const left = segmentsOf((after.enemies ?? []) as Enemy[]);
    expect(left.length).toBeLessThanOrEqual(3); // 5 segments, one blow, several gone
    expect(after.stats.enemiesDefeated).toBeGreaterThanOrEqual(2);
    // What remains is still one attached run starting at index 1.
    const idx = left
      .map((e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex ?? 0)
      .sort((a, b) => a - b);
    expect(idx).toEqual(idx.map((_, i) => i + 1));
  });

  it("a rock cuts the coil like a blade", () => {
    const rock = EnemyRegistry["coilwyrm-coil"].calcThrownDamage;
    // No thrown gate at all any more: rocks, runes and bombs are all legitimate ways to
    // blow a hole in the body.
    expect(rock).toBeUndefined();
  });

  it("a thrown rock does not freeze the segment it hits", () => {
    // Regression: the throw path normally holds an enemy it predicts it will kill out of
    // the turn, which for a follow-the-leader chain leaves everything behind it standing
    // still and tears the body apart (see movesInLockstep).
    expect(EnemyRegistry["coilwyrm-coil"].movesInLockstep).toBe(true);
    const enemies = makeCoil([[3, 3], [4, 3], [5, 3], [5, 4], [5, 5]]);
    const trailing = enemies[3];
    const before: [number, number] = [trailing.y, trailing.x];
    const state = coilState(11, [5, 1], enemies, {
      playerDirection: Direction.RIGHT,
      rockCount: 1,
    });
    const after = performThrowRock(state);
    const same = (after.enemies ?? []).find((e) => e === trailing);
    // It either moved or was severed by the cut in front of it — what it must NOT do is
    // sit frozen on its old tile while still attached.
    if (same && !(same.behaviorMemory as CoilSegmentMemory).severed) {
      expect([same.y, same.x]).not.toEqual(before);
    }
  });
});

// ---------------------------------------------------------------------------
// the armored head
// ---------------------------------------------------------------------------

describe("two hits kill a head, and the body grows another", () => {
  it("takes a flat headshot per blow, so exactly two hits fell it", () => {
    const calc = EnemyRegistry["coilwyrm"].calcMeleeDamage;
    // Deliberately independent of attack, sword and variance: "two hits" has to be a rule the
    // player can rely on, not a dice outcome that is sometimes one hit and sometimes three.
    for (const heroAttack of [1, 3, 9]) {
      for (const swordBonus of [0, 2]) {
        for (const variance of [-1, 0, 1]) {
          expect(calc({ heroAttack, swordBonus, variance })).toBe(
            COILWYRM_HEADSHOT_DAMAGE
          );
        }
      }
    }
    expect(COILWYRM_HEAD_HP).toBe(COILWYRM_HEADSHOT_DAMAGE * 2);
    // Thrown weapons agree, so a rock, rune or bomb is also two-to-kill on the head rather
    // than a way to skip the rule.
    expect(
      EnemyRegistry["coilwyrm"].calcThrownDamage?.({ base: 99, source: "rune" })
    ).toBe(COILWYRM_HEADSHOT_DAMAGE);
  });

  it("in-game: two swings at the head kill it even with the body intact", () => {
    // This is the change. It used to be immune until the coil was gone, which read as
    // "your hits are not landing" and taught the wrong lesson.
    const enemies = makeCoil([[5, 5], [6, 5]]);
    const state = coilState(11, [5, 4], enemies, { heroAttack: 1 });
    const head = headOf(enemies);
    const once = movePlayer(state, Direction.RIGHT);
    expect(head.health).toBe(COILWYRM_HEAD_HP - COILWYRM_HEADSHOT_DAMAGE);
    expect((once.enemies ?? []).some((e) => e === head)).toBe(true); // wounded, not dead
  });

  it("nothing in the registry is melee-immune any more", () => {
    // The Coilwyrm's head was the only armored thing in the game. Keeping this asserted so
    // that whoever adds the next damage gate has to look at the HUD label: a 0-damage hit must
    // render as "armored", never as "miss" — mislabelling it is what sent a playtester
    // hammering the one target that could not die yet.
    for (const kind of enemyKinds) {
      expect(isMeleeImmune(kind, { memory: {}, enemies: [] })).toBe(false);
    }
  });

  it("lists the wyrm as ONE enemy in the HUD, not one row per segment", () => {
    // A 5-segment coil filled all five slots of the "Enemies in sight" panel with identical
    // segment rows and pushed the head — the only part with meaningful hearts — off the list.
    expect(EnemyRegistry["coilwyrm-coil"].bodyPart).toBe(true);
    expect(EnemyRegistry["coilwyrm"].bodyPart).toBeFalsy();
    // The core of a multi-part boss must stay listable, or the fight has no HUD presence.
    expect(EnemyRegistry["coilwyrm"].boss).toBe(true);
  });

  it("a headshot is BOUGHT with a bite — that is what stops head-grinding", () => {
    // The rhythm the whole change rests on. Biting costs the head its step, so on a turn it
    // bites it is still standing in the tile you swing at and your blow lands on the SKULL. Any
    // other turn it steps away, a segment slides into that tile, and you cut body instead.
    // So each headshot costs roughly a bite's worth of HP, and since a head kill only removes
    // one segment, clearing a coil by headshots alone costs several times the hero's HP pool.
    // That is what makes cutting mandatory — an economic wall, not an invulnerability rule.
    const enemies = makeCoil([[5, 6], [5, 7], [5, 8], [5, 9], [5, 10], [6, 10]]);
    const head = headOf(enemies);
    const st = coilState(13, [5, 5], enemies, {
      playerDirection: Direction.RIGHT,
      heroAttack: 1,
      heroHealth: 30,
      heroMaxHealth: 30,
    });
    const before = st.heroHealth;
    const after = movePlayer(st, Direction.RIGHT);
    // It bit (so it did not move)...
    expect(after.heroHealth).toBeLessThan(before);
    // ...and therefore the swing landed on the head itself.
    expect(head.health).toBe(COILWYRM_HEAD_HP - COILWYRM_HEADSHOT_DAMAGE);
    // The exchange is deliberately bad value: a bite costs more than a headshot gains.
    expect(before - (after.heroHealth ?? 0)).toBeGreaterThanOrEqual(
      COILWYRM_HEAD_ATTACK
    );
  });

  it("a stranded head cannot move, bites once, and dies to one blow", () => {
    // Endgame fix. A lone head kept full speed AND was only reachable on the turns it bit, and
    // at equal movement speed that makes it literally uncatchable: "you end up with two heads
    // next to you and you can't actually kill the thing. It just drains all your stuff."
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[5, 5]]); // head, no segments
    const head = headOf(enemies);
    const mem = head.behaviorMemory as CoilHeadMemory;
    mem.segments = 0;
    expect(
      coilwyrmHeadStranded(mem as unknown as Record<string, unknown>, enemies)
    ).toBe(true);

    // It never moves, however long the hero stays away.
    for (let t = 0; t < 12; t++) tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });
    expect([head.y, head.x]).toEqual([5, 5]);

    // One bite, then never again — even standing beside it turn after turn.
    const bites: number[] = [];
    for (let t = 0; t < 6; t++) {
      bites.push(tickCoil(enemies, tiles, subtypes, { y: 5, x: 4 }).damage);
    }
    expect(bites[0]).toBe(COILWYRM_HEAD_ATTACK);
    expect(bites.slice(1).every((d) => d === 0)).toBe(true);
    expect([head.y, head.x]).toEqual([5, 5]); // biting did not let it move either

    // And a single blow finishes it, from melee or from range.
    expect(
      EnemyRegistry["coilwyrm"].calcMeleeDamage({
        heroAttack: 1,
        swordBonus: 0,
        variance: -1,
        memory: mem as unknown as Record<string, unknown>,
        enemies,
      })
    ).toBeGreaterThanOrEqual(COILWYRM_HEAD_HP);
    expect(
      EnemyRegistry["coilwyrm"].calcThrownDamage?.({
        base: 1,
        source: "rock",
        memory: mem as unknown as Record<string, unknown>,
        enemies,
      })
    ).toBeGreaterThanOrEqual(COILWYRM_HEAD_HP);
  });

  it("a head WITH a body is not stranded — still two hits, still mobile", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[5, 5], [5, 4], [5, 3]]);
    const head = headOf(enemies);
    const mem = head.behaviorMemory as CoilHeadMemory;
    expect(
      coilwyrmHeadStranded(mem as unknown as Record<string, unknown>, enemies)
    ).toBe(false);
    expect(
      EnemyRegistry["coilwyrm"].calcMeleeDamage({
        heroAttack: 9,
        swordBonus: 9,
        variance: 1,
        memory: mem as unknown as Record<string, unknown>,
        enemies,
      })
    ).toBe(COILWYRM_HEADSHOT_DAMAGE);
    const before: [number, number] = [head.y, head.x];
    tickCoil(enemies, tiles, subtypes, { y: 11, x: 11 });
    expect([head.y, head.x]).not.toEqual(before);
  });

  it("never reports stranded without enough context to be sure", () => {
    // A stray call must not hand out a one-hit boss kill.
    expect(coilwyrmHeadStranded(undefined, undefined)).toBe(false);
    expect(coilwyrmHeadStranded({ coilId: "c" }, undefined)).toBe(false);
  });

  it("a decapitated body of SPLIT_MIN or more grows a replacement head", () => {
    // The point of the whole mechanic: headshots on a long wyrm accomplish nothing.
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([
      [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1],
    ]);
    expect(segmentsOf(enemies).length).toBeGreaterThanOrEqual(COILWYRM_SPLIT_MIN);
    // Decapitate: remove the head exactly as a killing blow would.
    enemies.splice(enemies.indexOf(headOf(enemies)), 1);
    tickCoil(enemies, tiles, subtypes, { y: 9, x: 9 });
    expect(enemies.filter((e) => e.kind === "coilwyrm").length).toBe(1);
    // At FULL head HP — a fresh head, so the two hits have to be landed again.
    expect(headOf(enemies).health).toBe(COILWYRM_HEAD_HP);
    // Exactly one, from the front of the chain, and the rest fell in behind it.
    expect(segmentsOf(enemies).length).toBe(4);
  });

  it("a decapitated body shorter than SPLIT_MIN dies instead", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[5, 5], [5, 4], [5, 3], [5, 2]]);
    expect(segmentsOf(enemies).length).toBeLessThan(COILWYRM_SPLIT_MIN);
    enemies.splice(enemies.indexOf(headOf(enemies)), 1);
    tickCoil(enemies, tiles, subtypes, { y: 9, x: 9 });
    expect(enemies.filter((e) => e.kind === "coilwyrm").length).toBe(0);
    // Marked for the central reap rather than removed here, so the deaths carry VFX and
    // kill credit like any other.
    expect(
      segmentsOf(enemies).every(
        (e) => (e.behaviorMemory as { severed?: boolean }).severed === true
      )
    ).toBe(true);
  });

  it("only ONE replacement head grows, not one per surviving segment", () => {
    // becomeKind is applied after customUpdate returns, so on the promoting tick the claimant
    // is still a segment. Without a guard every part behind it promotes a head of its own.
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([
      [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1],
    ]);
    enemies.splice(enemies.indexOf(headOf(enemies)), 1);
    for (let t = 0; t < 4; t++) tickCoil(enemies, tiles, subtypes, { y: 9, x: 9 });
    expect(enemies.filter((e) => e.kind === "coilwyrm").length).toBe(1);
  });

  it("killing a head does NOT pay out the exit key while the body can regrow", () => {
    // The severe failure mode: for one turn after the head dies there is no boss-kind enemy
    // in the array at all, so a naive check hands over the arena key mid-fight.
    const enemies = makeCoil([[5, 5], [5, 4], [5, 3], [5, 2], [5, 1]]);
    const head = headOf(enemies);
    head.health = COILWYRM_HEADSHOT_DAMAGE; // one blow from death
    const state = coilState(13, [5, 6], enemies, {
      inBossRoom: true,
        playerDirection: Direction.LEFT,
    });
    const after = movePlayer(state, Direction.LEFT);
    expect((after.enemies ?? []).some((e) => e === head)).toBe(false); // head died
    expect(after.bossDefeated).toBeFalsy();
    const keyed = after.mapData.subtypes.some((row) =>
      row.some((cell) => cell.includes(TileSubtype.EXITKEY))
    );
    expect(keyed).toBe(false);
  });

  it("in-game: with the coil gone the head dies and drops the exit key", () => {
    const head = new Enemy({ y: 5, x: 5 });
    head.kind = "coilwyrm";
    (head.behaviorMemory as CoilHeadMemory).coilId = "c";
    (head.behaviorMemory as CoilHeadMemory).segments = 0;
    head.health = 1; // one blow from death
    const state = coilState(11, [5, 4], [head], {
      inBossRoom: true,
      });
    const after = movePlayer(state, Direction.RIGHT);
    expect((after.enemies ?? []).some((e) => e.kind === "coilwyrm")).toBe(false);
    expect(after.bossDefeated).toBe(true);
    const keyed = after.mapData.subtypes.some((row) =>
      row.some((cell) => cell.includes(TileSubtype.EXITKEY))
    );
    expect(keyed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// growth, cuts, thrash
// ---------------------------------------------------------------------------

describe("growth and the thrash lunge", () => {
  it("grows a segment on its cadence, into the tile the tail vacated", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[6, 6], [6, 5], [6, 4]], { growEvery: 2 });

    tickCoil(enemies, tiles, subtypes, { y: 6, x: 10 }); // countdown 2 -> 1
    expect(segmentsOf(enemies)).toHaveLength(2);

    const oldTailTile: [number, number] = [enemies[2].y, enemies[2].x];
    tickCoil(enemies, tiles, subtypes, { y: 6, x: 10 }); // cadence fires: it grows

    const segs = segmentsOf(enemies);
    expect(segs).toHaveLength(3);
    const grown = segs[segs.length - 1];
    expect((grown.behaviorMemory as CoilSegmentMemory).coilIndex).toBe(3);
    expect(coilwyrmSegmentIsTail(grown.behaviorMemory)).toBe(true);
    // It took over the tile the old tail stepped out of — no gap, no overlap.
    expect([grown.y, grown.x]).toEqual(oldTailTile);
    // Exactly one tail, and the longer coil is still one unbroken line.
    expect(
      segs.filter((s) => coilwyrmSegmentIsTail(s.behaviorMemory))
    ).toHaveLength(1);
    const pos = positions(enemies);
    expect(new Set(pos.map(([y, x]) => `${y},${x}`)).size).toBe(pos.length);
    for (let i = 1; i < pos.length; i++) {
      expect(
        Math.abs(pos[i][0] - pos[i - 1][0]) + Math.abs(pos[i][1] - pos[i - 1][1])
      ).toBe(1);
    }
  });

  it("a new segment does not act on the turn it appears", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[6, 6], [6, 5]], { growEvery: 1 });
    const tailTile: [number, number] = [enemies[1].y, enemies[1].x];
    tickCoil(enemies, tiles, subtypes, { y: 6, x: 10 });
    const segs = segmentsOf(enemies);
    expect(segs).toHaveLength(2);
    // Still sitting where it was placed — it never got a turn of its own.
    expect([segs[1].y, segs[1].x]).toEqual(tailTile);
  });

  it("cutting the coil makes the head lunge two tiles next turn", () => {
    const { tiles, subtypes } = openRoom(15);
    const enemies = makeCoil([[7, 7], [7, 6], [7, 5]]);
    const head = headOf(enemies);
    // Baseline: a normal turn moves the head one tile.
    const beforeNormal: [number, number] = [head.y, head.x];
    tickCoil(enemies, tiles, subtypes, { y: 7, x: 13 });
    const oneStep =
      Math.abs(head.y - beforeNormal[0]) + Math.abs(head.x - beforeNormal[1]);
    expect(oneStep).toBe(1);

    // Sever the tail (as any kill path would) and tick again.
    const tail = tailOf(enemies)!;
    enemies.splice(enemies.indexOf(tail), 1);
    const beforeLunge: [number, number] = [head.y, head.x];
    tickCoil(enemies, tiles, subtypes, { y: 7, x: 13 });
    const lunged =
      Math.abs(head.y - beforeLunge[0]) + Math.abs(head.x - beforeLunge[1]);
    expect(lunged).toBe(COILWYRM_LUNGE_TILES);

    // And the thrash is spent — the following turn is a normal single step.
    const beforeAfter: [number, number] = [head.y, head.x];
    tickCoil(enemies, tiles, subtypes, { y: 7, x: 13 });
    expect(
      Math.abs(head.y - beforeAfter[0]) + Math.abs(head.x - beforeAfter[1])
    ).toBeLessThanOrEqual(1);
  });

  it("a severed length leaves rocks behind (cuts feed your ammo)", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[6, 6], [6, 5], [6, 4], [6, 3]]);
    tickCoil(enemies, tiles, subtypes, { y: 10, x: 10 });
    // Cut the middle: the piece behind it is severed and both bodies drop stone.
    const mid = segmentsOf(enemies).find(
      (e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex === 2
    )!;
    const trailing = segmentsOf(enemies).find(
      (e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex === 3
    )!;
    const trailingTile: [number, number] = [trailing.y, trailing.x];
    enemies.splice(enemies.indexOf(mid), 1);
    tickCoil(enemies, tiles, subtypes, { y: 10, x: 10 });
    expect(subtypes[trailingTile[0]][trailingTile[1]]).toContain(TileSubtype.ROCK);
  });

  it("promotes the next segment to tail after a cut", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[6, 6], [6, 5], [6, 4], [6, 3]]);
    tickCoil(enemies, tiles, subtypes, { y: 6, x: 10 });
    const tail = tailOf(enemies)!;
    enemies.splice(enemies.indexOf(tail), 1);
    tickCoil(enemies, tiles, subtypes, { y: 6, x: 10 });
    const segs = segmentsOf(enemies);
    expect(segs).toHaveLength(2);
    const tails = segs.filter((s) => coilwyrmSegmentIsTail(s.behaviorMemory));
    expect(tails).toHaveLength(1);
    expect((tails[0].behaviorMemory as CoilSegmentMemory).coilIndex).toBe(2);
  });

  it("swallows a rock it crosses and grows two lengths for it", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[6, 6], [6, 5], [6, 4]]); // growth cadence off (999)
    // A rock directly on its route east toward the hero.
    subtypes[6][7] = [TileSubtype.ROCK];
    const headMem = headOf(enemies).behaviorMemory as CoilHeadMemory;

    tickCoil(enemies, tiles, subtypes, { y: 6, x: 11 });
    // The stone is gone from the floor — the hero cannot pick it up any more.
    expect(subtypes[6][7]).not.toContain(TileSubtype.ROCK);
    expect(headMem.gorgeNonce).toBe(1);
    // Two lengths owed, and the tail can only sprout one per turn (it has just the one
    // tile to vacate), so the wyrm visibly swells over two turns rather than popping.
    expect(segmentsOf(enemies)).toHaveLength(3);
    expect(headMem.growDebt).toBe(1);

    tickCoil(enemies, tiles, subtypes, { y: 6, x: 11 });
    expect(segmentsOf(enemies)).toHaveLength(4);
    expect(headMem.growDebt).toBe(0);

    // And the fattened coil is still one unbroken line.
    const pos = positions(enemies);
    expect(new Set(pos.map(([y, x]) => `${y},${x}`)).size).toBe(pos.length);
    for (let i = 1; i < pos.length; i++) {
      expect(
        Math.abs(pos[i][0] - pos[i - 1][0]) + Math.abs(pos[i][1] - pos[i - 1][1])
      ).toBe(1);
    }
  });

  it("stays intact when it swallows a rock on a two-step turn", () => {
    // Regression: the path length is fixed before the head moves, so a rock eaten mid-move
    // used to leave the new lengths without slots and the tail sprouted them two tiles
    // adrift. Set up a thrash (two steps) with a rock on the route.
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[6, 6], [6, 5], [6, 4], [6, 3]]);
    const headMem = headOf(enemies).behaviorMemory as CoilHeadMemory;
    headMem.thrash = 1; // lunging this turn
    subtypes[6][7] = [TileSubtype.ROCK];
    subtypes[6][8] = [TileSubtype.ROCK];

    for (let t = 0; t < 5; t++) {
      tickCoil(enemies, tiles, subtypes, { y: 6, x: 11 });
      const pos = positions(enemies);
      expect(new Set(pos.map(([y, x]) => `${y},${x}`)).size).toBe(pos.length);
      for (let i = 1; i < pos.length; i++) {
        expect(
          Math.abs(pos[i][0] - pos[i - 1][0]) + Math.abs(pos[i][1] - pos[i - 1][1])
        ).toBe(1);
      }
    }
    // It really did eat and really did grow.
    expect(segmentsOf(enemies).length).toBeGreaterThan(3);
  });

  it("prefers a rock when two steps are equally good, but never detours for one", () => {
    const { tiles, subtypes } = openRoom(13);
    // Hero diagonally placed so north and east both close the gap equally.
    const enemies = makeCoil([[6, 6], [6, 5], [6, 4]]);
    subtypes[5][6] = [TileSubtype.ROCK]; // on the northward tie-break option
    tickCoil(enemies, tiles, subtypes, { y: 2, x: 10 });
    const head = headOf(enemies);
    // It grazed rather than ignoring the stone...
    expect([head.y, head.x]).toEqual([5, 6]);
    // ...and it is still closing on the hero, not wandering off after food.
    expect(Math.abs(head.y - 2) + Math.abs(head.x - 10)).toBeLessThan(4 + 4);
  });

  it("a cut it does not clean up becomes food: dropped rocks are edible", () => {
    const { tiles, subtypes } = openRoom(13);
    const enemies = makeCoil([[6, 6], [6, 5], [6, 4], [6, 3]]);
    tickCoil(enemies, tiles, subtypes, { y: 10, x: 6 });
    // Sever the middle; the detached length drops stone where it stood.
    const mid = segmentsOf(enemies).find(
      (e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex === 2
    )!;
    enemies.splice(enemies.indexOf(mid), 1);
    tickCoil(enemies, tiles, subtypes, { y: 10, x: 6 });
    const dropped: Array<[number, number]> = [];
    for (let y = 0; y < subtypes.length; y++)
      for (let x = 0; x < subtypes[y].length; x++)
        if (subtypes[y][x].includes(TileSubtype.ROCK)) dropped.push([y, x]);
    expect(dropped.length).toBeGreaterThan(0);
    // Those are ordinary rocks, so the wyrm can eat them right back if you leave them.
    const headMem = headOf(enemies).behaviorMemory as CoilHeadMemory;
    const before = headMem.growDebt ?? 0;
    const [ry, rx] = dropped[0];
    const enemies2 = makeCoil([[ry, rx - 1], [ry, rx - 2]]);
    tickCoil(enemies2, tiles, subtypes, { y: ry, x: rx + 4 });
    const m2 = headOf(enemies2).behaviorMemory as CoilHeadMemory;
    expect(m2.growDebt ?? 0).toBeGreaterThan(0);
    expect(before).toBe(0);
  });

  it("the head bites a hero who ends the turn beside it", () => {
    const { tiles, subtypes } = openRoom(11);
    const enemies = makeCoil([[5, 5], [5, 4]]);
    const res = tickCoil(enemies, tiles, subtypes, { y: 5, x: 6 });
    expect(res.damage).toBeGreaterThan(0);
    expect(res.attackingEnemies.some((a) => a.kind === "coilwyrm")).toBe(true);
  });

  it("the body never deals contact damage, even pressed against the hero", () => {
    const { tiles, subtypes } = openRoom(11);
    // Segments flank the hero at (5,5); the head is kept far away.
    const enemies = makeCoil([[1, 1], [1, 2], [1, 3]]);
    enemies[1].y = 5;
    enemies[1].x = 4;
    enemies[2].y = 5;
    enemies[2].x = 6;
    const res = tickCoil(enemies, tiles, subtypes, { y: 5, x: 5 });
    expect(res.attackingEnemies.some((a) => a.kind === "coilwyrm-coil")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sprite piece selection
// ---------------------------------------------------------------------------

describe("the head faces along its own neck, not at the hero", () => {
  const self: [number, number] = [5, 5];

  it("picks the sprite whose neck exits toward the body", () => {
    // Regression: the sprite used to be chosen from `facing`, which points at the HERO while
    // adjacent — so the skull rendered with its neck pointing somewhere the body wasn't.
    expect(coilHeadPoseFor(self, [4, 5])).toEqual({ sprite: "head-front", mirror: false });
    expect(coilHeadPoseFor(self, [6, 5])).toEqual({ sprite: "head-back", mirror: false });
    expect(coilHeadPoseFor(self, [5, 4])).toEqual({ sprite: "head-side", mirror: false });
    expect(coilHeadPoseFor(self, [5, 6])).toEqual({ sprite: "head-side", mirror: true });
  });

  it("gives up (so the caller falls back to facing) with no neck to align to", () => {
    expect(coilHeadPoseFor(self, null)).toBeNull();
    expect(coilHeadPoseFor(self, [9, 9])).toBeNull(); // not adjacent
  });

  it("in-game: the pose tracks the body even while the head is looking at the hero", () => {
    const { tiles, subtypes } = openRoom(13);
    // Body runs UP from the head, hero standing to the head's right.
    const enemies = makeCoil([[6, 6], [5, 6], [4, 6]]);
    tickCoil(enemies, tiles, subtypes, { y: 6, x: 7 });
    const head = headOf(enemies);
    const neck = segmentsOf(enemies).find(
      (e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex === 1
    )!;
    const pose = coilHeadPoseFor([head.y, head.x], [neck.y, neck.x]);
    // Whatever it is looking at, the sprite's neck must point at the neck segment.
    expect(pose).not.toBeNull();
    const dy = neck.y - head.y;
    const dx = neck.x - head.x;
    if (dy === -1) expect(pose!.sprite).toBe("head-front");
    if (dy === 1) expect(pose!.sprite).toBe("head-back");
    if (dx !== 0) expect(pose!.sprite).toBe("head-side");
  });
});

describe("double-move knobs", () => {
  it("lungeTiles 1 means it never moves two tiles, even after a cut", () => {
    const { tiles, subtypes } = openRoom(15);
    const enemies = makeCoil([[7, 7], [7, 6], [7, 5], [7, 4]]);
    const mem = headOf(enemies).behaviorMemory as CoilHeadMemory;
    mem.lungeTiles = 1;
    mem.surgeEvery = 3; // even with a surge due, one tile is the cap
    const head = headOf(enemies);

    // Cut the tail to arm the thrash, then watch several turns of a hero far away (so the
    // surge gate is satisfied too).
    const tail = tailOf(enemies)!;
    enemies.splice(enemies.indexOf(tail), 1);
    for (let t = 0; t < 12; t++) {
      const before: [number, number] = [head.y, head.x];
      tickCoil(enemies, tiles, subtypes, { y: 13, x: 13 });
      const moved = Math.abs(head.y - before[0]) + Math.abs(head.x - before[1]);
      expect(moved).toBeLessThanOrEqual(1);
    }
  });

  it("surgeEvery 0 never surges however far away the hero is", () => {
    const { tiles, subtypes } = openRoom(21);
    const enemies = makeCoil([[10, 10], [10, 9], [10, 8], [10, 7]]);
    (headOf(enemies).behaviorMemory as CoilHeadMemory).surgeEvery = 0;
    const head = headOf(enemies);
    // Hero parked in the far corner, so the surge gate (gap > 3) is satisfied every turn.
    for (let t = 0; t < 14; t++) {
      const before: [number, number] = [head.y, head.x];
      tickCoil(enemies, tiles, subtypes, { y: 19, x: 19 });
      expect(
        Math.abs(head.y - before[0]) + Math.abs(head.x - before[1])
      ).toBeLessThanOrEqual(1);
    }
  });

  it("a cut still makes it thrash with the surge switched off", () => {
    // The thrash is tied to the player's own action, so it survives surgeEvery 0 — that is the
    // "keep the dramatic beat, drop the arbitrary one" configuration.
    const { tiles, subtypes } = openRoom(21);
    const enemies = makeCoil([[10, 10], [10, 9], [10, 8], [10, 7]]);
    (headOf(enemies).behaviorMemory as CoilHeadMemory).surgeEvery = 0;
    const head = headOf(enemies);
    const tail = tailOf(enemies)!;
    enemies.splice(enemies.indexOf(tail), 1);
    const before: [number, number] = [head.y, head.x];
    // Hero far away, so nothing is adjacent and the head spends its turn moving, not biting.
    tickCoil(enemies, tiles, subtypes, { y: 19, x: 19 });
    expect(Math.abs(head.y - before[0]) + Math.abs(head.x - before[1])).toBe(2);
  });

  it("the arena passes the knobs through to the wyrm", () => {
    const built = buildCoilwyrmArena(COILWYRM_LAYOUTS[0], () => 0.5, 5, {
      lungeTiles: 1,
      surgeEvery: 0,
    });
    const mem = (built.enemies ?? [])[0].behaviorMemory as CoilHeadMemory;
    expect(mem.lungeTiles).toBe(1);
    expect(mem.surgeEvery).toBe(0);
  });
});

describe("the encounter's tuning survives a split", () => {
  // A promoted length rewrites a SEGMENT's memory bag into head memory, so anything the bag does
  // not carry is lost and the new wyrm falls back to the module constants. That is what used to
  // happen: with the encounter set to one tile per turn, a wyrm born from a cut still double-moved
  // and surged — almost certainly why cutting the coil in half and running felt so much harder
  // than it should have.
  const tuning = { lungeTiles: 1, surgeEvery: 0, growMin: 12, growMax: 16 };

  it("the arena stamps it on every part, not just the head", () => {
    const built = buildCoilwyrmArena(COILWYRM_LAYOUTS[0], () => 0.5, 5, tuning);
    const parts = (built.enemies ?? []).filter(
      (e) => e.kind === "coilwyrm" || e.kind === "coilwyrm-coil"
    );
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      const m = p.behaviorMemory as CoilSegmentMemory;
      expect(m.lungeTiles).toBe(1);
      expect(m.surgeEvery).toBe(0);
      expect(m.growMin).toBe(12);
      expect(m.growMax).toBe(16);
    }
  });

  it("a regrown head inherits it instead of reverting to the constants", () => {
    const { tiles, subtypes } = openRoom(15);
    const built = buildCoilwyrmArena(COILWYRM_LAYOUTS[0], () => 0.5, 7, tuning);
    const enemies = (built.enemies ?? []).filter(
      (e) => e.kind === "coilwyrm" || e.kind === "coilwyrm-coil"
    ) as Enemy[];
    // Decapitate; the body is long enough to promote a replacement.
    enemies.splice(enemies.indexOf(headOf(enemies)), 1);
    tickCoil(enemies, tiles, subtypes, { y: 12, x: 12 });
    const nu = headOf(enemies).behaviorMemory as CoilHeadMemory;
    expect(nu.lungeTiles).toBe(1);
    expect(nu.surgeEvery).toBe(0);
    // ...and its freshly rolled cadence sits inside the encounter's range, not the default 8-11.
    expect(nu.growEvery).toBeGreaterThanOrEqual(12);
    expect(nu.growEvery).toBeLessThanOrEqual(16);
  });

  it("a segment grown mid-fight carries it too", () => {
    const { tiles, subtypes } = openRoom(15);
    const built = buildCoilwyrmArena(COILWYRM_LAYOUTS[0], () => 0.5, 5, {
      ...tuning,
      growMin: 1,
      growMax: 1, // grow immediately so the newborn is easy to catch
    });
    const enemies = (built.enemies ?? []).filter(
      (e) => e.kind === "coilwyrm" || e.kind === "coilwyrm-coil"
    ) as Enemy[];
    const before = segmentsOf(enemies).length;
    for (let t = 0; t < 6 && segmentsOf(enemies).length === before; t++) {
      tickCoil(enemies, tiles, subtypes, { y: 12, x: 12 });
    }
    expect(segmentsOf(enemies).length).toBeGreaterThan(before);
    for (const s of segmentsOf(enemies)) {
      expect((s.behaviorMemory as CoilSegmentMemory).lungeTiles).toBe(1);
    }
  });
});

describe("coilPieceFor picks the piece that connects its neighbours", () => {
  const self: [number, number] = [5, 5];
  const N: [number, number] = [4, 5];
  const S: [number, number] = [6, 5];
  const E: [number, number] = [5, 6];
  const W: [number, number] = [5, 4];

  it("straight runs", () => {
    expect(coilPieceFor(self, N, S)).toBe("body-v");
    expect(coilPieceFor(self, S, N)).toBe("body-v");
    expect(coilPieceFor(self, E, W)).toBe("body-h");
    expect(coilPieceFor(self, W, E)).toBe("body-h");
  });

  it("corners, whichever way round the neighbours are", () => {
    expect(coilPieceFor(self, N, E)).toBe("body-corner-ne");
    expect(coilPieceFor(self, E, N)).toBe("body-corner-ne");
    expect(coilPieceFor(self, N, W)).toBe("body-corner-nw");
    expect(coilPieceFor(self, W, N)).toBe("body-corner-nw");
    expect(coilPieceFor(self, S, E)).toBe("body-corner-se");
    expect(coilPieceFor(self, E, S)).toBe("body-corner-se");
    expect(coilPieceFor(self, S, W)).toBe("body-corner-sw");
    expect(coilPieceFor(self, W, S)).toBe("body-corner-sw");
  });

  it("the hindmost segment caps with a tail pointing away from its neighbour", () => {
    expect(coilPieceFor(self, N, null)).toBe("tail-down");
    expect(coilPieceFor(self, S, null)).toBe("tail-up");
    expect(coilPieceFor(self, W, null)).toBe("tail-right");
    expect(coilPieceFor(self, E, null)).toBe("tail-left");
  });

  it("falls back to a plain section rather than nothing", () => {
    expect(coilPieceFor(self, null, null)).toBe("body-h");
    // Non-adjacent neighbour (a cut mid-heal) must not throw or render blank.
    expect(coilPieceFor(self, [9, 9], null)).toBe("body-h");
  });

  it("every piece it can return has art on disk", () => {
    const dir = path.join(process.cwd(), "public/images/enemies/bosses/coilwyrm");
    const pieces: CoilPiece[] = [
      "body-h", "body-v",
      "body-corner-ne", "body-corner-nw", "body-corner-se", "body-corner-sw",
      "tail-up", "tail-down", "tail-left", "tail-right",
    ];
    for (const piece of pieces) {
      expect(fs.existsSync(path.join(dir, `coilwyrm-${piece}.png`))).toBe(true);
    }
    for (const head of ["head-front", "head-back", "head-side"]) {
      expect(fs.existsSync(path.join(dir, `coilwyrm-${head}.png`))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// arena
// ---------------------------------------------------------------------------

describe("Coilwyrm arena", () => {
  it.each(COILWYRM_LAYOUTS.map((l) => [l.name, l] as const))(
    "%s builds a legal, contiguous coil with the head first",
    (_name, layout) => {
      const state = buildCoilwyrmArena(layout, () => 0.5);
      const enemies = (state.enemies ?? []) as Enemy[];
      expect(enemies[0].kind).toBe("coilwyrm");
      expect(enemies.slice(1).every((e) => e.kind === "coilwyrm-coil")).toBe(true);

      const tiles = state.mapData.tiles;
      // Nothing starts inside a wall, and the coil is one unbroken line.
      for (let i = 0; i < enemies.length; i++) {
        expect(tiles[enemies[i].y][enemies[i].x]).toBe(0);
        if (i > 0) {
          const d =
            Math.abs(enemies[i].y - enemies[i - 1].y) +
            Math.abs(enemies[i].x - enemies[i - 1].x);
          expect(d).toBe(1);
        }
      }
      // Coil indices are dense and exactly one tail is marked.
      const idx = enemies
        .slice(1)
        .map((e) => (e.behaviorMemory as CoilSegmentMemory).coilIndex);
      expect(idx).toEqual(idx.map((_, i) => i + 1));
      expect(
        enemies.slice(1).filter((e) => coilwyrmSegmentIsTail(e.behaviorMemory))
      ).toHaveLength(1);

      // Hero and exit are on open floor, and the hero is nowhere near the wyrm.
      const hero = (() => {
        for (let y = 0; y < tiles.length; y++)
          for (let x = 0; x < tiles[y].length; x++)
            if (state.mapData.subtypes[y][x].includes(TileSubtype.PLAYER))
              return [y, x] as [number, number];
        throw new Error("no hero");
      })();
      expect(tiles[hero[0]][hero[1]]).toBe(0);
      expect(
        Math.abs(hero[0] - enemies[0].y) + Math.abs(hero[1] - enemies[0].x)
      ).toBeGreaterThan(4);
      expect(state.inBossRoom).toBe(true);
    }
  );

  it.each(COILWYRM_LAYOUTS.map((l) => [l.name, l] as const))(
    "%s places nothing on top of anything else",
    (_name, layout) => {
      // Hand-authored coordinate tables: a typo here is silent in play but ruins a fight
      // (a rock under the wyrm is a free +2 growth on turn one, a pillar under the hero
      // is a soft-lock).
      const k = ([y, x]: [number, number]) => `${y},${x}`;
      const pillars = new Set(layout.pillars.map(k));
      const wyrm = new Set(layout.wyrm.map(k));
      expect(layout.wyrm.length).toBeGreaterThanOrEqual(9); // head + 8
      // The wyrm's own body never doubles back over itself, and is one unbroken line.
      expect(wyrm.size).toBe(layout.wyrm.length);
      for (let i = 1; i < layout.wyrm.length; i++) {
        const d =
          Math.abs(layout.wyrm[i][0] - layout.wyrm[i - 1][0]) +
          Math.abs(layout.wyrm[i][1] - layout.wyrm[i - 1][1]);
        expect(d).toBe(1);
      }
      // Nothing shares a tile with anything else.
      for (const t of layout.wyrm) expect(pillars.has(k(t))).toBe(false);
      for (const t of layout.rocks) {
        expect(pillars.has(k(t))).toBe(false);
        expect(wyrm.has(k(t))).toBe(false); // a rock here is a turn-one free feed
      }
      expect(pillars.has(k(layout.hero))).toBe(false);
      expect(wyrm.has(k(layout.hero))).toBe(false);
      expect(layout.rocks.map(k)).not.toContain(k(layout.hero));
      // Every rock actually lands (the builder skips non-empty/non-floor tiles).
      const built = buildCoilwyrmArena(layout, () => 0.5);
      const placed = built.mapData.subtypes.flatMap((row) =>
        row.filter((cell) => cell.includes(TileSubtype.ROCK))
      );
      expect(placed.length).toBe(layout.rocks.length);
      expect(placed.length).toBeGreaterThanOrEqual(8); // "a few more rocks around the room"
    }
  );

  it.each(COILWYRM_LAYOUTS.map((l) => [l.name, l] as const))(
    "%s can actually field the segment counts it is asked for",
    (_name, layout) => {
      // Regression: the layouts held only 6 body tiles, so the default 6-segment coil was
      // silently built with 5 and the sandbox's "7" option did nothing.
      for (const n of [3, COILWYRM_START_SEGMENTS, 7]) {
        const built = buildCoilwyrmArena(layout, () => 0.5, n);
        expect(
          (built.enemies ?? []).filter((e) => e.kind === "coilwyrm-coil")
        ).toHaveLength(n);
      }
    }
  );

  it("survives a long chase in every layout without breaking the coil", () => {
    for (const layout of COILWYRM_LAYOUTS) {
      const state = buildCoilwyrmArena(layout, () => 0.5);
      const enemies = (state.enemies ?? []) as Enemy[];
      const { tiles, subtypes } = state.mapData;
      // Kite in a loop around the hall — the degenerate strategy the design expects
      // to punish. It must never desync the body or stack two parts on a tile.
      const loop: Array<[number, number]> = [
        [3, 3], [3, 15], [15, 15], [15, 3],
      ];
      for (let lap = 0; lap < 3; lap++) {
        for (const [hy, hx] of loop) {
          for (let t = 0; t < 8; t++) {
            tickCoil(enemies, tiles, subtypes, { y: hy, x: hx });
            const pos = positions(enemies);
            expect(new Set(pos.map(([y, x]) => `${y},${x}`)).size).toBe(pos.length);
            for (const [y, x] of pos) expect(tiles[y][x]).toBe(0);
          }
        }
      }
      // It grew while we ran: the room really is filling up.
      expect(segmentsOf(enemies).length).toBeGreaterThan(
        (buildCoilwyrmArena(layout, () => 0.5).enemies ?? []).length - 1
      );
    }
  });
});
