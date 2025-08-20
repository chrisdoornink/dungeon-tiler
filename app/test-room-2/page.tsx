"use client";

import React, { Suspense } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  TileSubtype,
  type GameState,
  type MapData,
  Direction,
} from "../../lib/map";
import { Enemy } from "../../lib/enemy";

function buildTestRoom2(): GameState {
  const SIZE = 25; // TilemapGrid assumes 25x25 CSS grid
  const ROOM = 11; // Inner room size
  const FLOOR = 0;
  const WALL = 1;

  // Base tiles: all walls
  const tiles: number[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => WALL)
  );

  // Carve a centered ROOM x ROOM floor area
  const start = Math.floor((SIZE - ROOM) / 2);
  const end = start + ROOM - 1; // inclusive
  for (let y = start; y <= end; y++) {
    for (let x = start; x <= end; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Prepare subtypes (3D array)
  const subtypes: number[][][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [])
  );

  // Place player at room center
  const py = Math.floor((start + end) / 2);
  const px = Math.floor((start + end) / 2);
  subtypes[py][px] = [TileSubtype.PLAYER];

  // Add wall torches on the north wall for some light
  const northWallY = start - 1;
  if (northWallY >= 0) {
    const positions = [
      start + Math.floor((end - start) * 0.2),
      start + Math.floor((end - start) * 0.5),
      start + Math.floor((end - start) * 0.8),
    ];
    for (const x of positions) {
      if (
        tiles[northWallY][x] === WALL &&
        tiles[northWallY + 1]?.[x] === FLOOR &&
        subtypes[northWallY][x].length === 0
      ) {
        subtypes[northWallY][x] = [TileSubtype.WALL_TORCH];
      }
    }
  }

  const mapData: MapData = { tiles, subtypes } as MapData;

  // Enemies: stone-exciter (right of player) and a ghost (left of player)
  const enemies: Enemy[] = [];
  const exciter = new Enemy({ y: py, x: Math.min(end, px + 4) });
  exciter.kind = "stone-exciter"; // behavior implemented in lib/enemy
  enemies.push(exciter);
  const ghost = new Enemy({ y: py, x: Math.max(start, px - 4) });
  ghost.kind = "ghost";
  enemies.push(ghost);

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies,
    heroHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
    },
    mapData,
    recentDeaths: [],
    heroTorchLit: true,
  };

  return gameState;
}

function TestRoom2Inner() {
  const initialState = buildTestRoom2();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#1B1B1B] text-white">
      <TilemapGrid tileTypes={tileTypes} initialGameState={initialState} />
    </div>
  );
}

export default function TestRoom2Page() {
  return (
    <Suspense fallback={null}>
      <TestRoom2Inner />
    </Suspense>
  );
}
