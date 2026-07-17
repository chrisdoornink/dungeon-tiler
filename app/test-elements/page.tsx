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

const ROOM_SIZE = 20;
const FLOOR = 0;
const WALL = 1;

type GoblinKind =
  | "fire-goblin"
  | "water-goblin"
  | "earth-goblin"
  | "stone-goblin";

function makeGoblin(y: number, x: number, kind: GoblinKind): Enemy {
  const g = new Enemy({ y, x });
  g.kind = kind; // setting kind aligns health to the registry value
  return g;
}

/**
 * Sandbox for the water/lava elements v1 (lava only). Set ?daylight=0 in the URL to
 * see lava's glow in the dark; default is daylight ON so the layout reads clearly.
 *
 * Things to try:
 *   1. LAVA IS DEATH. Walk into any lava tile (the glowing pool) → instant death,
 *      "The lava consumed you", hero sinks like the abyss.
 *   2. ROCK COOLS LAVA. Face the pool and press `r`: the nearest lava tile turns to
 *      dark obsidian (a safe, walkable stepping stone). Bridge the whole pool tile by
 *      tile, then walk across on the obsidian.
 *   3. STONE GOBLIN CROSSES LAVA. The stone-goblin (right) will path across the lava
 *      to reach you — the one enemy that ignores it. Every other goblin refuses to
 *      step in and routes around.
 *   4. NO ENEMY SPAWNS ON HAZARDS. (Generation-only; here enemies are hand-placed.)
 *   5. BOMB DUD / RUNE SAFE. A bomb thrown into lava melts (no blast, v1). A rune
 *      thrown at the pool drops on the last dry tile before it (never lost in lava).
 */
function buildElementsRoom(opts?: {
  torchLit?: boolean;
  showFullMap?: boolean;
  includeEnemies?: boolean;
}): GameState {
  const height = ROOM_SIZE + 2; // +2 for walls
  const width = ROOM_SIZE + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y <= ROOM_SIZE; y++) {
    for (let x = 1; x <= ROOM_SIZE; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Hero on the left side, with a lava band to the right between it and the goblins.
  const py = 10;
  const px = 4;
  subtypes[py][px] = [TileSubtype.PLAYER];

  // A vertical lava band (a "river") a few tiles to the hero's right. Two tiles wide
  // so the standoff (can't melee across) actually holds and bridging takes 2 rocks.
  for (let y = 6; y <= 14; y++) {
    subtypes[y][9] = [TileSubtype.LAVA];
    subtypes[y][10] = [TileSubtype.LAVA];
  }

  // A small isolated lava pool to test walking straight in (death), rock-cooling, and
  // the glow-relight (walk within 2 tiles of it with a snuffed torch — it catches).
  // Kept Chebyshev 4 from spawn so a ?torch=0 start isn't relit by the first step.
  subtypes[py + 4][px + 2] = [TileSubtype.LAVA];
  subtypes[py + 5][px + 2] = [TileSubtype.LAVA];

  const enemies: Enemy[] = [];
  if (opts?.includeEnemies ?? true) {
    // Stone goblin on the far side of the lava river: it will cross the lava to reach you.
    enemies.push(makeGoblin(py, 14, "stone-goblin"));
    // Earth + fire goblins on the far side: they must route AROUND the lava (top/bottom).
    enemies.push(makeGoblin(8, 14, "earth-goblin"));
    enemies.push(makeGoblin(12, 14, "fire-goblin"));
  }

  // Wall torches for ambiance / relight sources.
  for (const [ty, tx] of [
    [0, px],
    [21, px],
    [py, 21],
  ] as Array<[number, number]>) {
    subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
  }

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: true,
    showFullMap: opts?.showFullMap ?? true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies,
    heroHealth: 30,
    heroMaxHealth: 30,
    heroAttack: 1,
    heroTorchLit: opts?.torchLit ?? true,
    rockCount: 40,
    runeCount: 5,
    bombCount: 5,
    foodCount: 0,
    potionCount: 0,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
    },
    mapData: { tiles, subtypes, environment: "cave" },
    recentDeaths: [],
    mode: "normal",
  };

  return gameState;
}

function TestElementsInner() {
  // URL knobs (compose freely):
  //   ?daylight=0 — cave darkness/vignette on (lava glow becomes visible)
  //   ?torch=0    — hero starts with a SNUFFED torch (FOV collapses to hero+8)
  //   ?fullmap=0  — real field-of-view instead of reveal-everything
  // The "navigate by lava" scenario is ?daylight=0&torch=0&fullmap=0.
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  // forceDaylight defaults TRUE — that matches the real game: GameView defaults
  // daylight on, and daily/endless/tutorial all use it. In the real rendering, a LIT
  // torch means the whole map is visible; darkness (hero+8 FOV + wall-torch/lava glow)
  // exists only while the torch is SNUFFED. So the real-game dark scenario here is
  // ?torch=0&fullmap=0 — no daylight param needed. ?daylight=0 switches to STORY-mode
  // rendering (the only real mode with forceDaylight=false), where a lit torch gives an
  // FOV circle + vignette that mutes distant glow — don't use it for lava-light tests.
  const forceDaylight = params?.get("daylight") !== "0";
  const initialState = buildElementsRoom({
    torchLit: params?.get("torch") !== "0",
    showFullMap: params?.get("fullmap") !== "0",
    // ?enemies=0 clears the room — a clean stage for lighting observation (goblins
    // otherwise chase you down and a fire-goblin hit RELIGHTS the snuffed torch).
    includeEnemies: params?.get("enemies") !== "0",
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
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm max-w-xl">
          <h1 className="text-2xl font-bold mb-2">Water / Lava Elements Test (v1: Lava)</h1>
          <div className="text-xs text-gray-300 mt-1 space-y-1">
            <p>
              <b>Walk into lava</b> → instant death. <b>Face the pool and press r</b> to
              throw a rock: the nearest lava tile cools to obsidian (a safe stepping
              stone). Bridge across tile by tile.
            </p>
            <p>
              The <b>stone goblin</b> crosses lava to reach you; the earth/fire goblins
              route around it. Bomb into lava = dud; rune drops on the last dry tile.
              With a snuffed torch, <b>stepping into a lava pool&apos;s glow relights it</b>
              (close enough to dip the torch in).
            </p>
            <p>
              40 rocks, 5 runes, 5 bombs, 30 HP. URL knobs: <b>?torch=0&amp;fullmap=0</b>
              = the real-game dark scenario (snuffed torch, navigate by lava-light,
              walk into a pool&apos;s glow to relight); <b>&amp;enemies=0</b> for a clean
              stage. (<b>?daylight=0</b> = story-mode rendering only.) Reload to reset.
            </p>
          </div>
        </div>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={forceDaylight}
        />
      </div>
    </div>
  );
}

export default function TestElementsPage() {
  return (
    <Suspense fallback={null}>
      <TestElementsInner />
    </Suspense>
  );
}
