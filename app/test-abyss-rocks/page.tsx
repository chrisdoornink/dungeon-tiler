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
 * A sandbox for eyeballing two animations from every direction:
 *   1. Abyss falls — four goblins stand one tile from a FAULTY_FLOOR that sits
 *      between them and the hero, so the moment you take a turn they each step
 *      onto it (goblins only cross faulty floor while chasing) and drop in the
 *      direction they were walking: N=front, S=back, W=right, E=left(flipped).
 *   2. Rock throws — three fire-goblins (4 HP, so they SURVIVE the first rock
 *      and take a step that turn) sit exactly 4 tiles up / left / right of the
 *      hero. Throw with `r` while facing them to confirm the rock connects
 *      where the goblin ends up instead of banging its old tile.
 */
function buildAbyssRockRoom(): GameState {
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

  // Hero roughly centred, with clear space above and to both sides.
  const py = 16;
  const px = 11;
  subtypes[py][px] = [TileSubtype.PLAYER];

  const enemies: Enemy[] = [];

  // --- Abyss fallers: goblin + a faulty tile one step toward the hero. ---
  // North faller steps DOWN -> front-facing fall.
  enemies.push(makeGoblin(9, px, "fire-goblin"));
  subtypes[10][px] = [TileSubtype.FAULTY_FLOOR];
  // South faller steps UP -> back-facing fall.
  enemies.push(makeGoblin(20, px, "water-goblin"));
  subtypes[19][px] = [TileSubtype.FAULTY_FLOOR];
  // West faller steps RIGHT -> right-facing fall.
  enemies.push(makeGoblin(py, 4, "earth-goblin"));
  subtypes[py][5] = [TileSubtype.FAULTY_FLOOR];
  // East faller steps LEFT -> left-facing (mirrored) fall.
  enemies.push(makeGoblin(py, 18, "stone-goblin"));
  subtypes[py][17] = [TileSubtype.FAULTY_FLOOR];

  // --- Rock-throw targets. UP and LEFT are 4 HP fire-goblins: they survive the
  //     first rock and step this turn (the case that used to look like a
  //     double-hit). RIGHT is an 8 HP stone-goblin: with a rune held, the throw
  //     instant-kills it, and it must die frozen on its own tile (no jump).
  enemies.push(makeGoblin(12, px, "fire-goblin")); // throw UP
  enemies.push(makeGoblin(py, 7, "fire-goblin")); // throw LEFT
  enemies.push(makeGoblin(py, 15, "stone-goblin")); // throw RIGHT (rune-kill)

  // A few wall torches for ambiance.
  for (const [ty, tx] of [
    [0, px],
    [21, px],
    [py, 0],
    [py, 21],
  ] as Array<[number, number]>) {
    subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
  }

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: true,
    showFullMap: true,
    win: false,
    playerDirection: Direction.UP,
    enemies,
    heroHealth: 30,
    heroMaxHealth: 30,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 40,
    runeCount: 5,
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

function TestAbyssRockInner() {
  const initialState = buildAbyssRockRoom();
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
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-2">Abyss + Rock Test Room</h1>
          <div className="text-xs text-gray-300 mt-1 space-y-1">
            <p>
              Take any turn: the 4 outer goblins step onto a pit and fall (N/S/W/E
              = front/back/right/left).
            </p>
            <p>
              Face a goblin and press <b>r</b> to throw a rock. The UP/LEFT
              fire-goblins survive the first hit and advance. The RIGHT
              stone-goblin is rune-killed instantly (5 runes) and should die on
              its own tile.
            </p>
            <p>Reload to reset the pits. 40 rocks, 5 runes, 30 HP, sword + shield.</p>
          </div>
        </div>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
        />
      </div>
    </div>
  );
}

export default function TestAbyssRockPage() {
  return (
    <Suspense fallback={null}>
      <TestAbyssRockInner />
    </Suspense>
  );
}
