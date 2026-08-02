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
import { REWIND_MAX_DEPTH, REWIND_DEATH_DEPTH } from "../../lib/map/rewind";

const FLOOR = 0;
const WALL = 1;

/** A long east-west hall: the rewind is measured in steps, so give it room to walk. */
const ROOM_W = 26;
const ROOM_H = 12;

/** Hero's row — everything interesting sits on or near it. */
const LANE = 6;
/** Wall torches every 5 tiles along the north wall: a ruler for counting steps back. */
const RULER_SPACING = REWIND_DEATH_DEPTH;
const RULER_START = 2;

function makeGoblin(y: number, x: number, kind: string): Enemy {
  const g = new Enemy({ y, x });
  g.kind = kind as Enemy["kind"]; // the setter aligns health to the registry value
  return g;
}

/**
 * Sandbox for the Amber Moth rewind charm.
 * See .claude/features/amber-moth-rewind/index.md.
 *
 * Things to try:
 *   1. PICK IT UP. Grab the key, walk onto the locked chest — the amber teardrop appears
 *      on the opened chest with a warm pulse. Step on it to collect. The moth then shows
 *      in the item strip (no count badge: it is one-use).
 *   2. MANUAL REWIND. Walk east a while, then press `z` (or tap the moth). The board jumps
 *      to one step ago and a panel appears. Press `z` again to keep winding back — the
 *      wall torches on the north wall are 5 tiles apart, so you can count where you land.
 *      "Stay here" spends the charm; "Cancel" (Esc) returns to the present unspent.
 *   3. IT WON'T LET YOU CHEAT. Nothing recorded before the pickup, so you can never wind
 *      back onto the chest to collect a second charm. The button is disabled until you
 *      have taken at least one step while holding it.
 *   4. THE CAP. Walk 15+ steps and the buffer still only reaches 10 (REWIND_MAX_DEPTH) —
 *      the panel's subtitle tells you the ceiling.
 *   5. ENEMIES COME BACK. Fight the goblins, take a couple of hits, then rewind: their
 *      old positions and health are restored along with yours. HP is restored too — but
 *      cumulative STEPS are not (that stays monotonic on purpose, so the rewind can never
 *      forge a better daily score).
 *   6. THE DEATH SAVE. Walk east into the lava pool. Lava is instant death, but the
 *      charm intercepts it: "THE AMBER CRACKS", and you wake up 5 steps back, alive, with
 *      the run intact and no death screen. Spend the charm first (rewind manually) and the
 *      same walk into the lava ends the run normally.
 *   7. CLAMPING. `?held=1&hero=6,24` spawns you holding the charm one tile from the lava.
 *      Step in: only one step was ever recorded, so the save clamps to 1 and puts you back
 *      on the tile you left rather than overshooting.
 */
function buildRewindRoom(opts?: {
  torchLit?: boolean;
  showFullMap?: boolean;
  includeEnemies?: boolean;
  /** Start already holding the charge, skipping the chest. */
  held?: boolean;
  heroHealth?: number;
  heroAt?: [number, number];
}): GameState {
  const height = ROOM_H + 2; // +2 for walls
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

  const held = opts?.held ?? false;

  // The acquisition path: a key, then a locked chest holding the moth. Skipped when the
  // charm is handed over directly so you can get straight to the rewind itself.
  if (!held) {
    subtypes[LANE][4] = [TileSubtype.KEY];
    subtypes[LANE][6] = [
      TileSubtype.CHEST,
      TileSubtype.AMBER_MOTH,
      TileSubtype.LOCK,
    ];
  }

  // A lava pool across the east end. Lava is instant death, which makes the automatic
  // death save deterministic — no combat RNG involved.
  for (let y = LANE - 2; y <= LANE + 2; y++) {
    subtypes[y][ROOM_W - 1] = [TileSubtype.LAVA];
    subtypes[y][ROOM_W] = [TileSubtype.LAVA];
  }

  // Pots down the middle of the lane: landmarks you can smash, so a rewind visibly
  // un-smashes them. The clearest proof that the whole world winds back, not just the hero.
  for (const x of [11, 13, 15]) {
    subtypes[LANE][x] = [TileSubtype.POT];
  }

  // Step ruler: wall torches every RULER_SPACING tiles along the north wall.
  for (let x = RULER_START; x <= ROOM_W; x += RULER_SPACING) {
    subtypes[0][x] = [TileSubtype.WALL_TORCH];
  }

  const py = opts?.heroAt?.[0] ?? LANE;
  const px = opts?.heroAt?.[1] ?? 2;
  // Hero last, stacking with any terrain already on the spawn tile.
  subtypes[py][px] = subtypes[py][px].concat([TileSubtype.PLAYER]);

  const enemies: Enemy[] = [];
  if (opts?.includeEnemies ?? true) {
    // Mid-hall, off the lane so they have to walk to you — their approach positions are
    // what you watch snap back on a rewind.
    enemies.push(makeGoblin(LANE - 3, 14, "fire-goblin"));
    enemies.push(makeGoblin(LANE + 3, 17, "earth-goblin"));
    enemies.push(makeGoblin(LANE - 2, 20, "water-goblin"));
  }

  const hp = opts?.heroHealth ?? 8;

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
    // Handed over directly when ?held=1, so the chest can be skipped.
    rewindCharges: held ? 1 : 0,
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
  } as GameState;
}

function TestRewindInner() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;

  const forceDaylight = params?.get("daylight") !== "0";
  const heroParam = params?.get("hero")?.split(",").map(Number);
  const hpParam = Number(params?.get("hp"));

  const initialState = buildRewindRoom({
    torchLit: params?.get("torch") !== "0",
    showFullMap: params?.get("fullmap") !== "0",
    includeEnemies: params?.get("enemies") !== "0",
    held: params?.get("held") === "1",
    heroHealth: Number.isFinite(hpParam) && hpParam > 0 ? hpParam : undefined,
    heroAt:
      heroParam && heroParam.length === 2 && heroParam.every(Number.isFinite)
        ? [heroParam[0], heroParam[1]]
        : undefined,
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
          <h1 className="text-2xl font-bold mb-2">Amber Moth — Rewind Charm Test</h1>
          <div className="text-xs text-gray-300 mt-1 space-y-1 text-left">
            <p>
              <b>1. Pick it up.</b> Grab the key, then walk onto the locked chest — the
              amber teardrop appears with a warm pulse. Step on it to collect.
            </p>
            <p>
              <b>2. Rewind.</b> Walk east a while, then press <b>z</b> (or tap the moth in
              the item strip). The board jumps to one step ago. Press <b>z</b> again to
              wind further — up to {REWIND_MAX_DEPTH}. <b>Stay here</b> spends the charm,
              <b> Esc</b> cancels back to the present unspent. The wall torches are{" "}
              {RULER_SPACING} tiles apart, so you can count where you land.
            </p>
            <p>
              <b>3. Smash the pots</b> on the way east, then rewind — they come back. So do
              the goblins&apos; positions and health, and your HP. Cumulative <b>steps</b>{" "}
              deliberately do <i>not</i> rewind, so the charm can never forge a better score.
            </p>
            <p>
              <b>4. The death save.</b> Walk east into the <b>lava</b> (instant death). The
              charm intercepts it — <i>THE AMBER CRACKS</i> — and you wake up{" "}
              {REWIND_DEATH_DEPTH} steps back, alive, no death screen. Spend the charm
              manually first and the same walk ends the run for real.
            </p>
            <p>
              <b>5. It can&apos;t be farmed.</b> Nothing is recorded before the pickup, so
              you can never wind back onto the chest for a second charm. The button stays
              disabled until you have taken a step while holding it.
            </p>
            <p className="text-gray-400 pt-1">
              URL knobs: <b>?held=1</b> start holding the charm (skip the chest) ·{" "}
              <b>?held=1&amp;hero=6,24</b> one tile from the lava — only 1 step of history,
              so the death save clamps to 1 instead of overshooting · <b>?hp=N</b> starting
              HP (default 8) · <b>?enemies=0</b> clear the hall ·{" "}
              <b>?torch=0&amp;fullmap=0</b> the dark scenario. Reload to reset.
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

export default function TestRewindPage() {
  return (
    <Suspense fallback={null}>
      <TestRewindInner />
    </Suspense>
  );
}
