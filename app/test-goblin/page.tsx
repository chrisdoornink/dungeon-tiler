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

  // Entry point in the center
  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);
  subtypes[centerY][centerX] = [TileSubtype.PLAYER];

  // Place 6 goblins around the edges, spread out
  const enemies: Enemy[] = [];
  
  // Top edge - 2 goblins
  enemies.push(new Enemy({ y: 2, x: 5 }));
  enemies.push(new Enemy({ y: 2, x: 16 }));
  
  // Right edge - 1 goblin
  enemies.push(new Enemy({ y: 11, x: 19 }));
  
  // Bottom edge - 2 goblins
  enemies.push(new Enemy({ y: 19, x: 5 }));
  enemies.push(new Enemy({ y: 19, x: 16 }));
  
  // Left edge - 1 goblin
  enemies.push(new Enemy({ y: 11, x: 2 }));

  // All enemies are goblins by default
  enemies.forEach(e => {
    e.kind = 'fire-goblin';
  });

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
          <h1 className="text-2xl font-bold mb-2">Goblin Combat Test Room</h1>
          <p className="text-sm text-gray-300">
            6 goblins spread around the edges - fight them one by one to test balance
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Hero: 5 HP, 1 Attack | Goblin: 5 HP, 1 Attack
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
