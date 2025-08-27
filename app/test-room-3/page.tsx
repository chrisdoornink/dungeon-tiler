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

function buildTestRoom3(): GameState {
  const SIZE = 25; // TilemapGrid assumes 25x25 CSS grid
  const ROOM = 8; // 8x8 fully-lit room
  const FLOOR = 0;
  const WALL = 1;

  // Base tiles: all walls
  const tiles: number[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => WALL)
  );

  // Carve an 8x8 room centered
  const start = Math.floor((SIZE - ROOM) / 2);
  const end = start + ROOM - 1; // inclusive
  for (let y = start; y <= end; y++) {
    for (let x = start; x <= end; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Prepare subtypes 3D array
  const subtypes: number[][][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [])
  );

  // Place player at exact room center
  const py = Math.floor((start + end) / 2);
  const px = Math.floor((start + end) / 2);
  subtypes[py][px] = [TileSubtype.PLAYER];

  // Place sword and shield directly above the player (stacked one and two tiles above)
  if (py - 1 >= start) subtypes[py - 1][px] = [TileSubtype.SWORD];
  if (py - 2 >= start) subtypes[py - 2][px] = [TileSubtype.SHIELD];

  // Two goblins on opposite ends of the room (left and right midpoints of the room)
  const gy = py; // same row as player
  const leftGoblinX = start;
  const rightGoblinX = end;

  const enemies: Enemy[] = [];
  const g1 = new Enemy({ y: gy, x: leftGoblinX });
  g1.kind = "goblin";
  enemies.push(g1);
  const g2 = new Enemy({ y: gy, x: rightGoblinX });
  g2.kind = "goblin";
  enemies.push(g2);

  const mapData: MapData = { tiles, subtypes } as MapData;

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: true, // fully lit
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
  };

  return gameState;
}

function TestRoom3Inner() {
  const initialState = buildTestRoom3();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#1B1B1B] text-white">
      <TilemapGrid
        tileTypes={tileTypes}
        initialGameState={initialState}
        forceDaylight={true}
      />
    </div>
  );
}

export default function TestRoom3Page() {
  return (
    <Suspense fallback={null}>
      <TestRoom3Inner />
    </Suspense>
  );
}
