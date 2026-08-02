// The Quarrymaster's arena: one hall, hand-authored, with the boss penned at the north end
// behind three stacked beds of spikes.
//
// THE `X` TILES ARE CRACKS (FAULTY_FLOOR), NOT HOLES. The player sees them (crack decal) and
// simply walks around them — falling in is not meant to be how the player dies. What they do
// is catch goblins: the engine already makes a goblin avoid a crack while patrolling and step
// on one while CHASING, so a chased goblin falls, the crack gives way, and the tile becomes a
// permanently open hole everything routes around afterwards. Each run therefore de-mines the
// room differently depending on where the player drew the chase.
//
// THE DIFFICULTY IS THE CROWD. Goblins amass from the two pods while you manoeuvre to the
// switches. The cracks shape that manoeuvring; they are not the threat.
//
// LAYOUTS ARE THE VARIETY. Several authored maps with different switch and crack placement
// live in QUARRYMASTER_LAYOUTS; a run picks one. Add a layout by adding a map — no code.
//
// EDIT THE MAP, NOT THE CODE. `assertLayout` re-checks every invariant after any edit: all
// switches reachable without crossing a crack, the exit reachable, the pods able to reach the
// hero, and the boss reachable ONLY once all three spike beds are down. A bad edit throws with a
// specific message instead of shipping an invisible soft-lock.
//
// Split from quarrymaster.ts for the same reason shaper_arena.ts is split from shaper.ts:
// the behavior file stays free of Enemy/GameState value imports so nothing cycles back
// through the registry.
import { Enemy } from "../enemy";
import { TileSubtype, Direction } from "../map/constants";
import type { GameState } from "../map/game-state";
import type { GateGroup } from "../map/types";

const FLOOR = 0;
const WALL = 1;

type Grid = number[][];
type Subs = number[][][];

/**
 * Map legend — one character per tile, square, fully walled.
 *
 *   `#` wall            `.` floor           `X` crack (goblin-trap, hero walks around)
 *   `Q` the boss        `S` spawn pod       `H` hero start      `E` exit
 *   `1` `2` `3` field switches — each drops one row of the boss's cage
 *   `4` the switch INSIDE his chamber — unseals the exit (see GATE_CHAR_FOR_PLATE)
 *   `a` `b` `c` spike beds across the chamber mouth (answer switches 1-3)
 *   `d` the spike bed sealing the exit (answers switch 4)
 *   `r` a rock to pick up          `p` a pot          `T` wall torch (needs floor below)
 *   `L` lava — light + instant death (must sit DIAGONALLY from `H`, see assertLayout 5b/5c)
 *
 * In every layout the chamber sits at the top behind its three gate rows, and the two pods
 * sit high and outside the chamber walls so goblins come down into the hall. Every layout
 * also owes a light source within 2 tiles of `H`, because the hero can arrive with a doused
 * torch and the wall torches are up at the chamber mouth.
 */
export interface QuarrymasterLayout {
  name: string;
  map: readonly string[];
}

export const QUARRYMASTER_LAYOUTS: QuarrymasterLayout[] = [
  {
    // Switches at the two south corners plus one under the chamber mouth. Crossing the hall
    // means committing to a left or right lane past the crack ridges.
    name: "The Long Lanes",
    map: [
      "#################",
      "#.....#.4.#.....#",
      "#..S..#.Q.#..S..#",
      "#.....#...#.....#",
      "#.....#aaa#.....#",
      "#.....#bbb#.....#",
      "#..X..TcccT..X..#",
      "#.......3.......#",
      "#.XXXXXXXXXXXXX.#",
      "#...............#",
      "#.XXXXX.r.XXXXX.#",
      "#.....X...X.....#",
      "#.1.X.X...X.X.p.#",
      "#...X.XXXXX.X...#",
      "#.X.X.L...L.X.X##",
      "#.2.X...H...X.dE#",
      "#################",
    ],
  },
  {
    // Switches strung up the middle. The crack field is broken into islands, so the crowd
    // can come at you from more angles and there is no safe lane to hug.
    name: "The Broken Yard",
    map: [
      "#################",
      "#.....#.4.#.....#",
      "#..S..#.Q.#..S..#",
      "#.....#...#.....#",
      "#.....#aaa#.....#",
      "#..X..#bbb#..X..#",
      "#.....TcccT.....#",
      "#...X.....X.....#",
      "#.2...XXX...X.3.#",
      "#..X...........X#",
      "#.....XX.XX.....#",
      "#.X..1.X.X....X.#",
      "#...XX.....XX..##",
      "#.p...X...X...dE#",
      "#.X...L...L...X##",
      "#.......H.......#",
      "#################",
    ],
  },
  {
    // A tight centre. Two big crack masses squeeze the middle to narrow throats, so goblins
    // bunch up in the gaps and the switch run is all about timing when to slip through.
    name: "The Throat",
    map: [
      "#################",
      "#.....#.4.#.....#",
      "#..S..#.Q.#..S..#",
      "#.....#...#.....#",
      "#.....#aaa#.....#",
      "#.....#bbb#.....#",
      "#.....TcccT.....#",
      "#...2.....r.3...#",
      "#..XXXX.XXXX....#",
      "#..XXXX.XXXX..X.#",
      "#.......X.......#",
      "#.X..XXXXXXX..X.#",
      "#....XXXXXXX....#",
      "#.......X.....p##",
      "#.1...L...L...dE#",
      "#.......H......##",
      "#################",
    ],
  },
];

/** The layout used when a caller doesn't pick one. */
export const QUARRYMASTER_MAP = QUARRYMASTER_LAYOUTS[0].map;

/**
 * Which spike bed each switch retracts, by map character. `1`-`3` are the field switches that
 * peel back the beds across his chamber mouth; `4` is the switch INSIDE the chamber that
 * retracts the bed sealing the way to the exit.
 *
 * Switch 4 exists to close a real loophole: the arena exit only checks `hasExitKey`, so a
 * hero who walked in already carrying a key from the run could stroll straight to the exit
 * and end the run without fighting. Sealing a key away wouldn't help — they have their own.
 * Sealing the exit PASSAGE does: the carried key stays valid but useless until you have
 * reached the boss, killed him, thrown his switch, and walked back out through the crowd.
 */
const GATE_CHAR_FOR_PLATE: Record<string, string> = {
  "1": "a",
  "2": "b",
  "3": "c",
  "4": "d",
};
/** The switch inside the chamber, and the gate it opens. */
const EXIT_PLATE_CHAR = "4";

export interface QuarrymasterArenaOptions {
  /** Hero starting health. See the note on the default below before lowering it. */
  heroHealth?: number;
  /** Which entry of QUARRYMASTER_LAYOUTS to build. Wraps, so any integer is valid. */
  layoutIndex?: number;
  /** Override the map outright (tests). Takes precedence over layoutIndex. */
  map?: readonly string[];
}

export const QUARRYMASTER_ARENA_DEFAULTS = {
  /**
   * Deliberately higher than the Shaper's 5 or the Coilwyrm's 6. Those bosses are one entity
   * you can disengage from and re-approach; this is a long traverse against summons that
   * always know where you are. At 6 HP the switch-runner bot lost every fight having taken
   * only 6-7 total damage — it was never overwhelmed, it just had no runway for the tour.
   */
  heroHealth: 12,
} as const;

export interface QuarrymasterArena {
  state: GameState;
  layoutName: string;
  boss: [number, number];
  hero: [number, number];
  plates: Array<[number, number]>;
  pods: Array<[number, number]>;
  /** Every crack tile as authored. Goblins convert these to holes by falling in. */
  cracks: Array<[number, number]>;
  /** Wall torches — the hero's way back from a ghost snuffing their light. */
  torches: Array<[number, number]>;
  /** Lava pools — the light a hero who arrives doused can actually see, and a hazard. */
  lava: Array<[number, number]>;
}

const ORTHO: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

interface ParsedMap {
  tiles: Grid;
  subtypes: Subs;
  boss: [number, number];
  hero: [number, number];
  exit: [number, number];
  plates: Array<[number, number]>;
  /** Index into gateGroups of the chamber switch that unseals the exit. */
  exitGroupIndex: number;
  pods: Array<[number, number]>;
  cracks: Array<[number, number]>;
  torches: Array<[number, number]>;
  lava: Array<[number, number]>;
  gateGroups: GateGroup[];
}

function parseMap(map: readonly string[]): ParsedMap {
  const size = map.length;
  const tiles: Grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => FLOOR)
  );
  const subtypes: Subs = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );
  let boss: [number, number] | null = null;
  let hero: [number, number] | null = null;
  let exit: [number, number] | null = null;
  const plates: Array<{ pos: [number, number]; ch: string }> = [];
  const pods: Array<[number, number]> = [];
  const cracks: Array<[number, number]> = [];
  const torches: Array<[number, number]> = [];
  const lava: Array<[number, number]> = [];
  const gatesByChar: Record<string, Array<[number, number]>> = {};

  for (let y = 0; y < size; y++) {
    const row = map[y];
    if (row.length !== size) {
      throw new Error(
        `quarrymaster map row ${y} is ${row.length} chars, expected ${size} (map must be square)`
      );
    }
    for (let x = 0; x < size; x++) {
      const ch = row[x];
      switch (ch) {
        case "#":
          tiles[y][x] = WALL;
          break;
        case "T":
          // A wall torch. Ghosts are in the summon pool and snuff the hero's torch on
          // contact, so the room has to offer a way to relight — stepping adjacent to one of
          // these does it. Only ever authored onto a wall with FLOOR below (validated in
          // assertLayout), because that is the only wall the forced perspective gives a
          // visible face to.
          tiles[y][x] = WALL;
          subtypes[y][x] = [TileSubtype.WALL_TORCH];
          torches.push([y, x]);
          break;
        case ".":
          break;
        case "X":
          // A CRACK, not a hole. Visible to the player (crack decal) so they route around
          // it; a goblin avoids it while patrolling and steps on it while chasing, at which
          // point it gives way and becomes a permanent OPEN_ABYSS. See applyEnemyHazardDeaths.
          subtypes[y][x] = [TileSubtype.FAULTY_FLOOR];
          cracks.push([y, x]);
          break;
        case "Q":
          boss = [y, x];
          break;
        case "H":
          hero = [y, x];
          break;
        case "E":
          subtypes[y][x] = [TileSubtype.EXIT];
          exit = [y, x];
          break;
        case "S":
          subtypes[y][x] = [TileSubtype.SPAWN_POD];
          pods.push([y, x]);
          break;
        case "L":
          // A pool of molten rock, and the arena's only light the hero arrives with.
          // enterBossRoom carries the live run's torch state in, and the douse-to-see
          // DARK_PORTAL entrance only appears while the torch is OUT — so on those days the
          // hero lands here in the dark, and the wall torches are up at the chamber mouth
          // across the crack field. Lava glows on its own (see computeTorchGlow, the same
          // area the render layer lights), so it is visible from arrival, and ending a move
          // inside that glow relights the torch. It also kills instantly, which is the
          // point: light you have to stand next to. Placed DIAGONALLY from the hero start,
          // never orthogonally — movement is orthogonal-only, so the first keypress out of
          // the gate can never walk into it blind.
          subtypes[y][x] = [TileSubtype.LAVA];
          lava.push([y, x]);
          break;
        case "r":
          subtypes[y][x] = [TileSubtype.ROCK];
          break;
        case "p":
          subtypes[y][x] = [TileSubtype.POT];
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          subtypes[y][x] = [TileSubtype.PRESSURE_PLATE];
          plates.push({ pos: [y, x], ch });
          break;
        case "a":
        case "b":
        case "c":
        case "d":
          // A bed of spikes standing out of the floor. Stays FLOOR underneath on purpose:
          // SPIKES is an overlay, so thrown rocks sail over it (the throw scan only breaks
          // on non-FLOOR tiles) while nothing — hero or goblin — can walk through.
          subtypes[y][x] = [TileSubtype.SPIKES];
          (gatesByChar[ch] ??= []).push([y, x]);
          break;
        default:
          throw new Error(`quarrymaster map: unknown character "${ch}" at ${y},${x}`);
      }
    }
  }

  if (!boss) throw new Error("quarrymaster map has no boss (Q)");
  if (!hero) throw new Error("quarrymaster map has no hero start (H)");
  if (!exit) throw new Error("quarrymaster map has no exit (E)");

  const sorted = plates.sort((a, b) => a.ch.localeCompare(b.ch));
  const exitGroupIndex = sorted.findIndex((pl) => pl.ch === EXIT_PLATE_CHAR);
  if (exitGroupIndex < 0) {
    throw new Error(
      `quarrymaster map: no chamber switch ("${EXIT_PLATE_CHAR}") — without it a hero carrying an exit key can leave without fighting`
    );
  }
  const gateGroups: GateGroup[] = sorted
    .map(({ pos, ch }) => {
      const gateChar = GATE_CHAR_FOR_PLATE[ch];
      const gates = gatesByChar[gateChar] ?? [];
      if (gates.length === 0) {
        throw new Error(`quarrymaster map: switch "${ch}" has no "${gateChar}" gate row`);
      }
      return { plate: pos, gates, open: false };
    });

  return {
    tiles,
    subtypes,
    boss,
    hero,
    exit,
    plates: sorted.map((p) => p.pos),
    exitGroupIndex,
    pods,
    cracks,
    torches,
    lava,
    gateGroups,
  };
}

/** Walk the arena from `from`, optionally treating closed cage gates as already dropped. */
function reachable(
  tiles: Grid,
  subtypes: Subs,
  from: [number, number],
  openGates: Set<string>
): Set<string> {
  const passable = (y: number, x: number) => {
    const subs = subtypes[y]?.[x];
    if (!subs) return false;
    // A spike bed is walkable only once its switch has retracted it.
    if (subs.includes(TileSubtype.SPIKES)) return openGates.has(`${y},${x}`);
    if (subs.includes(TileSubtype.FAULTY_FLOOR)) return false;
    // Lava is instant death on entry, so it is a wall for routing purposes. It is a FLOOR
    // overlay, not a wall tile, so without this line every check below would happily
    // certify a layout whose only path to a switch or the exit runs through it — the exact
    // invisible soft-lock this validator exists to catch. (OBSIDIAN, a rock-cooled lava
    // tile, is safe and walkable, but no layout authors one: it only appears at runtime.)
    if (subs.includes(TileSubtype.LAVA) && !subs.includes(TileSubtype.OBSIDIAN)) return false;
    return tiles[y]?.[x] === FLOOR && !subs.includes(TileSubtype.OPEN_ABYSS);
  };
  const seen = new Set<string>([`${from[0]},${from[1]}`]);
  const q: Array<[number, number]> = [from];
  while (q.length) {
    const [y, x] = q.shift()!;
    for (const [dy, dx] of ORTHO) {
      const k = `${y + dy},${x + dx}`;
      if (seen.has(k) || !passable(y + dy, x + dx)) continue;
      seen.add(k);
      q.push([y + dy, x + dx]);
    }
  }
  return seen;
}

const canStandBeside = (seen: Set<string>, [y, x]: [number, number]) =>
  seen.has(`${y},${x}`) || ORTHO.some(([dy, dx]) => seen.has(`${y + dy},${x + dx}`));

/**
 * Every invariant the layout owes, checked against the parsed map rather than trusted.
 *
 * A hand-authored maze is one typo away from a soft-lock, and the failure mode (a switch
 * walled off behind pits) is invisible until someone plays it. Throws with a specific
 * message so a bad map edit fails loudly at build time instead of quietly at the keyboard.
 */
export function assertLayout(parsed: ParsedMap): void {
  const { tiles, subtypes, hero, boss, exit, plates, pods, gateGroups, exitGroupIndex } = parsed;
  const keysOf = (indices: number[]) => {
    const open = new Set<string>();
    for (const i of indices) {
      for (const [gy, gx] of gateGroups[i].gates) open.add(`${gy},${gx}`);
    }
    return open;
  };
  const bossGroups = gateGroups.map((_, i) => i).filter((i) => i !== exitGroupIndex);
  const nothingOpen = new Set<string>();
  const fromHero = reachable(tiles, subtypes, hero, nothingOpen);

  // 1. Every FIELD switch must be walkable to from the door, without crossing a crack.
  for (const [i, plate] of plates.entries()) {
    if (i === exitGroupIndex) continue;
    if (!fromHero.has(`${plate[0]},${plate[1]}`)) {
      throw new Error(
        `quarrymaster map: switch at ${plate} is unreachable from the hero's start`
      );
    }
  }

  // 2. The boss stays sealed until EVERY field switch is thrown — check that dropping any
  //    proper subset leaves him unreachable, so no single switch can be the whole puzzle.
  for (let n = 0; n < bossGroups.length; n++) {
    const partial = reachable(tiles, subtypes, hero, keysOf(bossGroups.slice(0, n)));
    if (canStandBeside(partial, boss)) {
      throw new Error(
        `quarrymaster map: boss is reachable with only ${n} of ${bossGroups.length} cage gates down`
      );
    }
  }
  const cageOpen = reachable(tiles, subtypes, hero, keysOf(bossGroups));
  if (!canStandBeside(cageOpen, boss)) {
    throw new Error("quarrymaster map: boss is unreachable even with every cage gate down");
  }

  // 3. The chamber switch must be standable once the cage is open (it is inside with him).
  const exitPlate = plates[exitGroupIndex];
  if (!cageOpen.has(`${exitPlate[0]},${exitPlate[1]}`)) {
    throw new Error(
      `quarrymaster map: the chamber switch at ${exitPlate} is unreachable even with the cage open`
    );
  }

  // 4. THE LOOPHOLE CHECK. The exit must be unreachable until the chamber switch is thrown,
  //    even with every cage gate already down — otherwise a hero carrying a key from the run
  //    can walk out the moment they arrive, and the whole fight is optional.
  if (canStandBeside(cageOpen, exit)) {
    throw new Error(
      "quarrymaster map: exit is reachable before the chamber switch is thrown — a hero arriving with an exit key could leave without fighting"
    );
  }
  const allOpen = reachable(tiles, subtypes, hero, keysOf(gateGroups.map((_, i) => i)));
  if (!canStandBeside(allOpen, exit)) {
    throw new Error("quarrymaster map: exit is unreachable even with every gate down");
  }

  // 5. A ghost can snuff the hero's torch anywhere, so every layout owes a relight. And a
  //    torch on a wall with no floor below is invisible (the perspective only draws a face on
  //    down-facing walls), which would be a silent trap.
  if (parsed.torches.length === 0) {
    throw new Error(
      "quarrymaster map: no wall torches (T) — ghosts are in the summon pool and snuff the hero's torch, so every layout needs a relight"
    );
  }
  for (const [ty, tx] of parsed.torches) {
    if (tiles[ty + 1]?.[tx] !== FLOOR) {
      throw new Error(
        `quarrymaster map: wall torch at ${[ty, tx]} has no floor below it, so it would render invisible`
      );
    }
  }

  // 5b. A light source must be visible FROM THE HERO'S START, not merely somewhere in the
  //     room. enterBossRoom carries the live run's torch state in, and the douse-to-see
  //     DARK_PORTAL entrance only appears while the torch is OUT — so on those days the hero
  //     lands here blind, with a doused FOV of their own tile plus dim neighbours. Every
  //     layout used to put both torches at the chamber mouth, nine tiles away across the
  //     crack field, which made a doused arrival a death sentence: you could not see far
  //     enough to route around the cracks, and standing still let the pods bury you.
  //
  //     GLOW_RADIUS is Chebyshev 2 because that is what computeTorchGlow lights (an octagon,
  //     far corners dropped) and also the range at which ending a move relights the torch.
  //     So a source inside it is both visible on arrival and one step from a relight.
  const GLOW_RADIUS = 2;
  const [hy, hx] = hero;
  const nearStart = [...parsed.lava, ...parsed.torches].some(([ly, lx]) => {
    const dy = Math.abs(ly - hy);
    const dx = Math.abs(lx - hx);
    // The octagon: Chebyshev 2 minus the four far corners.
    return Math.max(dy, dx) <= GLOW_RADIUS && !(dy === GLOW_RADIUS && dx === GLOW_RADIUS);
  });
  if (!nearStart) {
    throw new Error(
      `quarrymaster map: no light source (L or T) within ${GLOW_RADIUS} tiles of the hero start ${[hy, hx]} — a hero arriving with a doused torch (the DARK_PORTAL entrance requires one) would be blind in a crack field`
    );
  }

  // 5c. Lava must never sit ORTHOGONALLY adjacent to the hero start. Movement is
  //     orthogonal-only, so an adjacent pool means the very first keypress — pressed in the
  //     dark, before the torch relights — can be instant death with no tell. Diagonal is
  //     fine and is the intended placement: visible and lighting, but unreachable in one move.
  for (const [ly, lx] of parsed.lava) {
    if (Math.abs(ly - hy) + Math.abs(lx - hx) === 1) {
      throw new Error(
        `quarrymaster map: lava at ${[ly, lx]} is orthogonally adjacent to the hero start ${[hy, hx]} — the first keypress out of the gate would be instant death. Place it diagonally instead.`
      );
    }
  }

  // 6. Pods must be able to field monsters that can actually reach the hero, or there is no
  //    pressure at all. Checked with gates SHUT, which is the state for most of the fight.
  for (const pod of pods) {
    if (!fromHero.has(`${pod[0]},${pod[1]}`)) {
      throw new Error(
        `quarrymaster map: spawn pod at ${pod} cannot reach the hero with the gates shut`
      );
    }
  }
}

export function buildQuarrymasterArena(
  opts: QuarrymasterArenaOptions = {}
): QuarrymasterArena {
  const heroHealth = opts.heroHealth ?? QUARRYMASTER_ARENA_DEFAULTS.heroHealth;
  const layout =
    QUARRYMASTER_LAYOUTS[
      ((opts.layoutIndex ?? 0) % QUARRYMASTER_LAYOUTS.length + QUARRYMASTER_LAYOUTS.length) %
        QUARRYMASTER_LAYOUTS.length
    ];
  const parsed = parseMap(opts.map ?? layout.map);
  assertLayout(parsed);

  const { tiles, subtypes, boss: bossPos, hero, plates, pods, cracks, torches, lava, gateGroups } =
    parsed;
  const [bossY, bossX] = bossPos;

  subtypes[hero[0]][hero[1]] = [TileSubtype.PLAYER];

  const boss = new Enemy({ y: bossY, x: bossX });
  boss.kind = "quarrymaster";
  const mem = boss.behaviorMemory as Record<string, unknown>;
  // Pace inside the chamber only, never into the gated mouth: his job is to summon, and a
  // summoner that kites is a summoner you can never punish. Even with the last row down he
  // won't walk out to meet you — you come to him.
  mem.roamMinY = 1;
  mem.roamMaxY = bossY + 1;
  mem.roamMinX = bossX - 1;
  mem.roamMaxX = bossX + 1;
  mem.pods = pods;

  const state: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    // NO shield, deliberately, and this was measured. A flat -1 per hit took the
    // switch-runner bot to 22/24 but also rescued every do-nothing policy, because blanket
    // damage reduction helps waiting exactly as much as it helps progressing.
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.UP,
    enemies: [boss],
    heroHealth,
    heroMaxHealth: heroHealth,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 4,
    runeCount: 0,
    // Healing is part of the runway, and spending it costs a turn while the summons close,
    // so it stays a real decision rather than free HP.
    foodCount: 3,
    potionCount: 2,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
    inBossRoom: true,
    // Deliberately NOT setting bossKind. That field is typed to BossKind, which main defines
    // as "every boss that can hold the daily boss room" — and this one is prototype-only
    // (/test-quarrymaster, no entry in BOSS_ROSTER, never rolled). Claiming membership would
    // put it in analytics and on the stats page as though it were shippable. Add it to the
    // roster the day it actually joins the rotation.
    gateGroups,
  };

  return { state, layoutName: layout.name, boss: bossPos, hero, plates, pods, cracks, torches, lava };
}
