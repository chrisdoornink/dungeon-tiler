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

function buildSnakeTestRoom(): GameState {
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

  // Entry point in the center
  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);
  subtypes[centerY][centerX] = [TileSubtype.PLAYER];

  // A few snakes scattered around the hero so their coiled <-> slither pose
  // swap (and poison behavior) is easy to observe.
  const enemies: Enemy[] = [];
  const snakeSpots: Array<[number, number]> = [
    [centerY - 4, centerX - 3],
    [centerY - 3, centerX + 4],
    [centerY + 4, centerX + 2],
  ];
  for (const [sy, sx] of snakeSpots) {
    const snake = new Enemy({ y: sy, x: sx });
    snake.kind = "snake";
    enemies.push(snake);
  }

  // Add wall torches for visibility
  const torchPositions: Array<[number, number]> = [
    [0, 5],
    [0, 16],
    [0, 11],
    [21, 5],
    [21, 16],
    [21, 11],
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
    enemies,
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
    rockCount: 3,
    runeCount: 0,
    foodCount: 0,
    potionCount: 1,
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

function TestSnakeInner() {
  const initialState = buildSnakeTestRoom();
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
          <h1 className="text-2xl font-bold mb-2">Snake Test Room</h1>
          <p className="text-sm text-gray-300">
            3 snakes — watch the coiled ↔ slither pose swap as they move
          </p>
          <div className="text-xs text-gray-400 mt-2 space-y-1">
            <p>🐍 Snake: 2 HP, 1 ATK, poisons on hit</p>
            <p>Hero: 5 HP, 1 ATK + Sword (+2) + Shield (-1 dmg), 1 potion</p>
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

export default function TestSnakePage() {
  return (
    <Suspense fallback={null}>
      <TestSnakeInner />
    </Suspense>
  );
}
