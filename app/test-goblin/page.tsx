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

function buildGoblinTestRoom(): GameState {
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

  // Scatter a few small wall clusters for cover
  const wallPositions: Array<[number, number]> = [
    [5, 5], [5, 6],
    [8, 14], [9, 14],
    [14, 4], [14, 5],
    [10, 10],
    [17, 16], [17, 17],
  ];
  for (const [wy, wx] of wallPositions) {
    tiles[wy][wx] = WALL;
  }

  // Entry point in the center
  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);
  subtypes[centerY][centerX] = [TileSubtype.PLAYER];

  // Single pink goblin for testing
  const enemies: Enemy[] = [];
  const pg = new Enemy({ y: 4, x: 15 });
  pg.kind = 'pink-goblin';
  enemies.push(pg);

  // Add some wall torches for visibility
  const torchPositions: Array<[number, number]> = [
    [0, 5],   // Top wall
    [0, 16],  // Top wall
    [21, 5],  // Bottom wall
    [21, 16], // Bottom wall
  ];
  
  for (const [ty, tx] of torchPositions) {
    subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
  }

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: true,
    win: false,
    playerDirection: Direction.DOWN,
    enemies,
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
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
    mode: 'normal',
  };

  return gameState;
}

function TestGoblinInner() {
  const initialState = buildGoblinTestRoom();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto"
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="text-center bg-black/70 rounded-lg p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-2">Pink Goblin Test Room</h1>
          <p className="text-sm text-gray-300">
            1 pink goblin with wall lines for LOS testing
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Hero: 5 HP, 1 Attack | Pink Goblin: 4 HP, ranged attack
          </p>
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

export default function TestGoblinPage() {
  return (
    <Suspense fallback={null}>
      <TestGoblinInner />
    </Suspense>
  );
}
