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

  // 2 white goblin swarms (4 members each = 8 total)
  const enemies: Enemy[] = [];

  // Swarm 1 - all 4 members stacked on one tile (top-left area)
  const swarm1Id = 'swarm-test-1';
  for (let i = 0; i < 4; i++) {
    const wg = new Enemy({ y: 4, x: 5 });
    wg.kind = 'white-goblin';
    wg.behaviorMemory.swarmId = swarm1Id;
    wg.behaviorMemory.sidewaysFront = Math.random() < 0.5;
    enemies.push(wg);
  }

  // Swarm 2 - all 4 members stacked on one tile (top-right area)
  const swarm2Id = 'swarm-test-2';
  for (let i = 0; i < 4; i++) {
    const wg = new Enemy({ y: 4, x: 16 });
    wg.kind = 'white-goblin';
    wg.behaviorMemory.swarmId = swarm2Id;
    wg.behaviorMemory.sidewaysFront = Math.random() < 0.5;
    enemies.push(wg);
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

  // Give the player a sword so they can test combat effectively
  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: true,
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

function TestGoblinsInner() {
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
          <h1 className="text-2xl font-bold mb-2">White Goblin Swarm Test Room</h1>
          <p className="text-sm text-gray-300">
            2 swarms of 4 white goblins — 8 total
          </p>
          <div className="text-xs text-gray-400 mt-2 space-y-1">
            <p>⬜ White Goblin: 1 HP, 1 ATK each (4 AP combined per swarm)</p>
            <p>Hero: 5 HP, 1 ATK + Sword (+2)</p>
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

export default function TestGoblinsPage() {
  return (
    <Suspense fallback={null}>
      <TestGoblinsInner />
    </Suspense>
  );
}
