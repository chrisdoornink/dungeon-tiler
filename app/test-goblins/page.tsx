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

  // Place 2 of each goblin type (6 total), spread around the room
  const enemies: Enemy[] = [];

  // 2x Fire Goblins - top area
  const fg1 = new Enemy({ y: 3, x: 5 });
  fg1.kind = 'fire-goblin';
  enemies.push(fg1);

  const fg2 = new Enemy({ y: 3, x: 16 });
  fg2.kind = 'fire-goblin';
  enemies.push(fg2);

  // 2x Water Goblins - middle sides
  const wg1 = new Enemy({ y: 11, x: 2 });
  wg1.kind = 'water-goblin';
  enemies.push(wg1);

  const wg2 = new Enemy({ y: 11, x: 19 });
  wg2.kind = 'water-goblin';
  enemies.push(wg2);

  // 2x Water Goblin Spearmen - bottom area
  const wgs1 = new Enemy({ y: 18, x: 5 });
  wgs1.kind = 'water-goblin-spear';
  enemies.push(wgs1);

  const wgs2 = new Enemy({ y: 18, x: 16 });
  wgs2.kind = 'water-goblin-spear';
  enemies.push(wgs2);

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
          <h1 className="text-2xl font-bold mb-2">All Goblin Types Test Room</h1>
          <p className="text-sm text-gray-300">
            2 of each goblin type — 6 total
          </p>
          <div className="text-xs text-gray-400 mt-2 space-y-1">
            <p>🔥 Fire Goblin: 5 HP, 1 ATK (top)</p>
            <p>🧊 Water Goblin: 5 HP, 2 ATK (sides)</p>
            <p>🔱 Water Goblin Spearman: 5 HP, 4 ATK (bottom)</p>
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
