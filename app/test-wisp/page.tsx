"use client";

import React, { Suspense } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  TileSubtype,
  type GameState,
  Direction,
} from "../../lib/map";
import { Enemy } from "../../lib/enemy";
import {
  WISP_DEFAULT_LIFESPAN,
  WISP_FLASH_MOVES,
  WISP_MAX_COMPANIONS,
  WISP_RESTORE_HEARTS,
  type WildWisp,
} from "../../lib/map/wisp";

const FLOOR = 0;
const WALL = 1;

const ROOM_W = 26;
const ROOM_H = 12;
/** Hero's row. */
const LANE = 6;

/** Fixed perches for the ?wisps=N pre-spawned wild wisps, spread around the room. */
const PRESPAWN_SPOTS: Array<[number, number]> = [
  [3, 10],
  [9, 16],
  [2, 20],
  [10, 6],
  [4, 23],
];

function makeGoblin(y: number, x: number, kind: string): Enemy {
  const g = new Enemy({ y, x });
  g.kind = kind as Enemy["kind"];
  return g;
}

/**
 * Sandbox for the wisp life-regen prototype. See lib/map/wisp.ts and
 * .claude/features/wisp-life-regen/index.md.
 *
 * The room stages every spawn source and both halves of the mechanic:
 *
 *  - WEST: a pot cluster. Walking into a pot smashes it; with the default
 *    potChance=1 every pot releases a wisp that drifts away and gutters out after
 *    its lifespan, flashing for the last few steps.
 *  - MIDDLE: goblins. Kills can leave the enemy's spark behind as a wisp
 *    (sparkChance, default 0.5) at the death tile.
 *  - SOUTH-WEST: a pond with a deep core. Swimming the deep water SNUFFS THE
 *    TORCH — and dark inverts every wild wisp: instead of wandering (and bolting
 *    when you get adjacent), they drift toward you each step until one settles on
 *    you and is caught. Relight at a north-wall torch to watch them turn shy again.
 *  - EAST: a lava pool. Instant death — walk in carrying a wisp to watch the save:
 *    the wisp whirls, restores hearts, and tugs you back off the lava onto its
 *    perch. It also beats goblin deaths, and fires BEFORE an Amber Moth would.
 *  - PITY: with ?pity=1 (default on here), dropping to exactly 1 heart draws a
 *    wisp out of the walls a few tiles away.
 */
function buildWispRoom(opts?: {
  torchLit?: boolean;
  showFullMap?: boolean;
  includeEnemies?: boolean;
  heroHealth?: number;
  heroAt?: [number, number];
  /** Wild wisps already drifting when the room loads. */
  prespawn?: number;
  /** Companions already caught when the room loads. */
  held?: number;
  potChance?: number;
  enemyDropChance?: number;
  pity?: boolean;
  lifespan?: number;
}): GameState {
  const height = ROOM_H + 2;
  const width = ROOM_W + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y <= ROOM_H; y++) {
    for (let x = 1; x <= ROOM_W; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // West: the pot cluster.
  for (const [y, x] of [
    [4, 4],
    [5, 3],
    [5, 5],
    [7, 4],
    [8, 3],
  ] as Array<[number, number]>) {
    subtypes[y][x] = [TileSubtype.POT];
  }
  // One pot STAMPED the way real dailies bake them (3% of plain pots, seeded, the
  // same pots for everyone). With ?pot=0 the cluster above goes quiet but this one
  // still releases its wisp — that's the baked path.
  subtypes[8][5] = [TileSubtype.POT, TileSubtype.WISP];

  // South-west: pond with a deep core — swim it to snuff the torch.
  for (let y = 9; y <= 11; y++) {
    for (let x = 8; x <= 11; x++) {
      subtypes[y][x] = [TileSubtype.SHALLOW_WATER];
    }
  }
  subtypes[10][9] = [TileSubtype.DEEP_WATER];
  subtypes[10][10] = [TileSubtype.DEEP_WATER];

  // North wall torches: relight spots after a swim.
  for (const x of [6, 12, 18, 24]) {
    subtypes[0][x] = [TileSubtype.WALL_TORCH];
  }

  // East: the lava pool for death-save tests.
  for (let y = LANE - 2; y <= LANE + 2; y++) {
    subtypes[y][ROOM_W - 1] = [TileSubtype.LAVA];
    subtypes[y][ROOM_W] = [TileSubtype.LAVA];
  }

  const py = opts?.heroAt?.[0] ?? LANE;
  const px = opts?.heroAt?.[1] ?? 2;
  subtypes[py][px] = subtypes[py][px].concat([TileSubtype.PLAYER]);

  const enemies: Enemy[] = [];
  if (opts?.includeEnemies ?? true) {
    enemies.push(makeGoblin(LANE - 3, 14, "fire-goblin"));
    enemies.push(makeGoblin(LANE + 3, 16, "earth-goblin"));
    enemies.push(makeGoblin(LANE - 2, 19, "water-goblin"));
  }

  const lifespan = opts?.lifespan ?? WISP_DEFAULT_LIFESPAN;
  const prespawnCount = Math.min(
    opts?.prespawn ?? 2,
    PRESPAWN_SPOTS.length
  );
  const wisps: WildWisp[] = PRESPAWN_SPOTS.slice(0, prespawnCount).map(
    // fresh: they spiral up out of their tiles as the room loads.
    ([y, x], i) => ({ id: 9000 + i, y, x, movesLeft: lifespan, fresh: true })
  );

  const hp = opts?.heroHealth ?? 8;
  const held = Math.min(opts?.held ?? 0, WISP_MAX_COMPANIONS);

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: true,
    showFullMap: opts?.showFullMap ?? true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies,
    heroHealth: hp,
    heroMaxHealth: hp,
    heroAttack: 1,
    heroTorchLit: opts?.torchLit ?? true,
    rockCount: 10,
    runeCount: 0,
    bombCount: 0,
    foodCount: 0,
    potionCount: 0,
    currentFloor: 1,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
    },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
    wispConfig: {
      // Cranked well above the real-mode numbers (baked 3% pots, 2% drops, cap 1)
      // so every mechanic is easy to reach in a single test session.
      potChance: opts?.potChance ?? 1,
      enemyDropChance: opts?.enemyDropChance ?? 0.5,
      pity: opts?.pity ?? true,
      lifespan,
      maxCompanions: WISP_MAX_COMPANIONS,
    },
    wisps: wisps.length > 0 ? wisps : undefined,
    wispCompanions: held > 0 ? held : undefined,
  } as GameState;
}

function TestWispInner() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;

  const forceDaylight = params?.get("daylight") !== "0";
  const heroParam = params?.get("hero")?.split(",").map(Number);
  const num = (key: string): number | undefined => {
    const v = Number(params?.get(key));
    return params?.get(key) !== null && Number.isFinite(v) ? v : undefined;
  };

  const initialState = buildWispRoom({
    torchLit: params?.get("torch") !== "0",
    showFullMap: params?.get("fullmap") !== "0",
    includeEnemies: params?.get("enemies") !== "0",
    heroHealth: num("hp"),
    heroAt:
      heroParam && heroParam.length === 2 && heroParam.every(Number.isFinite)
        ? [heroParam[0], heroParam[1]]
        : undefined,
    prespawn: num("wisps"),
    held: num("held"),
    potChance: num("pot"),
    enemyDropChance: num("drop"),
    pity: params?.get("pity") !== "0",
    lifespan: num("life"),
  });

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">Wisp — Life Regen Test</h1>
          <div className="text-xs text-gray-300 mt-1 space-y-1 text-left">
            <p>
              <b>Two wild wisps</b> are already drifting. They move one tile per
              step you take, float over anything walkable, and gutter out after{" "}
              {WISP_DEFAULT_LIFESPAN} of your steps — flashing for the last{" "}
              {WISP_FLASH_MOVES} as a warning.
            </p>
            <p>
              <b>1. Catch one lit.</b> They&apos;re shy of fire: aimless wandering
              until you&apos;re adjacent, then they bolt. Corner one against a wall
              and step onto it.
            </p>
            <p>
              <b>2. Catch one dark.</b> Swim the pond&apos;s deep middle
              (south-west) — the water snuffs your torch, and dark wisps invert:
              they drift <i>toward</i> you every step until one settles on you.
              Relight at a north-wall torch and watch survivors turn shy again.
              (In real floors dark also means snakes hunt you — that&apos;s the
              intended trade.)
            </p>
            <p>
              <b>3. Smash the pots</b> (west cluster): every pot releases a wisp
              here (?pot=1; real dailies instead BAKE wisps into 3% of pots at
              generation, seeded — same pots for everyone. One pot in the cluster
              is baked that way: with ?pot=0 it still delivers). <b>Kill the
              goblins</b>: half of kills leave a wisp at the death tile here
              (?drop=0.5; 2% in real games).
            </p>
            <p>
              <b>4. Pity.</b> The first time each floor you fall to exactly 1
              heart, a wisp is drawn out 4-8 tiles away — at the edge of view, so
              you glimpse it and must choose to chase it while nearly dead.
              Guaranteed, but once per floor.
            </p>
            <p>
              <b>5. The save.</b> Carrying a wisp (a small light trailing your last
              few tiles), walk into the <b>lava</b> east: no death screen, no
              banner — the wisp just spins around you three times, restores{" "}
              {WISP_RESTORE_HEARTS} hearts (a full heal at base health), and tugs
              you back onto its perch so the lava can&apos;t re-kill you. Consumes
              one companion (cap {WISP_MAX_COMPANIONS} here, 1 in real modes);
              fires before an Amber Moth would.
            </p>
            <p className="text-gray-400 pt-1">
              URL knobs: <b>?wisps=N</b> pre-spawned wild wisps (default 2, max{" "}
              {PRESPAWN_SPOTS.length}) · <b>?held=N</b> start carrying N ·{" "}
              <b>?pot=0..1</b> / <b>?drop=0..1</b> spawn chances ·{" "}
              <b>?pity=0</b> off · <b>?life=N</b> wild lifespan · <b>?hp=N</b>{" "}
              starting HP (default 8) · <b>?hero=y,x</b> spawn tile ·{" "}
              <b>?torch=0</b> start dark · <b>?enemies=0</b> clear the room.
              Reload to reset.
            </p>
          </div>
        </div>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={forceDaylight}
          storageSlot="test"
        />
      </div>
    </div>
  );
}

export default function TestWispPage() {
  return (
    <Suspense fallback={null}>
      <TestWispInner />
    </Suspense>
  );
}
