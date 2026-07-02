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

const ROOM_SIZE = 16;
const FLOOR = 0;
const WALL = 1;

function buildPinkGoblinTestRoom(): GameState {
  const height = ROOM_SIZE + 2; // +2 for walls
  const width = ROOM_SIZE + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [])
  );

  // Create floor area
  for (let y = 1; y <= ROOM_SIZE; y++) {
    for (let x = 1; x <= ROOM_SIZE; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // LOS-breaking pillars: the pink goblin only drops its teleport ring when it
  // CANNOT see you, so the arena needs cover to dance around.
  const pillars: Array<[number, number]> = [
    // vertical run, left-center
    [6, 6],
    [7, 6],
    [8, 6],
    // horizontal run, right side
    [10, 11],
    [10, 12],
    [10, 13],
    // small block, top-right
    [4, 12],
    [5, 12],
  ];
  for (const [py, px] of pillars) tiles[py][px] = WALL;

  // Hero starts bottom-center
  subtypes[13][8] = [TileSubtype.PLAYER];

  // One pink goblin, top-right behind cover
  const pink = new Enemy({ y: 4, x: 14 });
  pink.kind = "pink-goblin";

  // Wall torches for visibility
  const torchPositions: Array<[number, number]> = [
    [0, 5],
    [0, 12],
    [17, 5],
    [17, 12],
  ];
  for (const [ty, tx] of torchPositions) {
    subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
  }

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
    hasShield: true,
    showFullMap: true,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [pink],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    bombCount: 5,
    rockCount: 0,
    runeCount: 0,
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

function TestPinkGoblinInner() {
  const initialState = buildPinkGoblinTestRoom();
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
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm max-w-[640px]">
          <h1 className="text-2xl font-bold mb-2">Pink Goblin Test Room</h1>
          <p className="text-sm text-gray-300">
            1 pink goblin, 5 bombs (B or tap) — full ring → pink realm loop
          </p>
          <div className="text-xs text-gray-400 mt-2 space-y-1">
            <p>
              Break line of sight behind a pillar and the goblin drops a
              teleport ring. Bomb-kill it while the ring is out, step on the
              ring to warp to the pink realm; the ring there brings you back.
            </p>
            <p className="text-pink-300">
              Add ?smooth=1 for the movement/animation prototype.
            </p>
          </div>
        </div>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
          storageSlot="test"
        />
      </div>
    </div>
  );
}

export default function TestPinkGoblinPage() {
  return (
    <Suspense fallback={null}>
      <TestPinkGoblinInner />
    </Suspense>
  );
}
