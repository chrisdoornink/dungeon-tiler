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

function buildTestRoom(): GameState {
  const SIZE = 25; // TilemapGrid currently assumes 25x25 CSS grid
  const ROOM = 10; // Desired inner room size
  const FLOOR = 0;
  const WALL = 1;

  // Base tiles: all walls
  const tiles: number[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => WALL)
  );

  // Carve a 10x10 room centered
  const start = Math.floor((SIZE - ROOM) / 2); // 7
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

  // Line the inner room perimeter with items: alternate CHEST, POT, ROCK
  const borderPositions: Array<[number, number]> = [];
  for (let x = start; x <= end; x++) {
    borderPositions.push([start, x]); // top edge
    borderPositions.push([end, x]); // bottom edge
  }
  for (let y = start + 1; y < end; y++) {
    borderPositions.push([y, start]); // left edge (skip corners already added)
    borderPositions.push([y, end]); // right edge
  }

  const cycle = [TileSubtype.CHEST, TileSubtype.POT, TileSubtype.ROCK];
  let chestIdx = 0;
  for (let i = 0; i < borderPositions.length; i++) {
    const [y, x] = borderPositions[i];
    const t = cycle[i % cycle.length];
    if (t === TileSubtype.CHEST) {
      // Alternate SWORD/SHIELD contents; no LOCK for quick testing
      const content = chestIdx % 2 === 0 ? TileSubtype.SWORD : TileSubtype.SHIELD;
      subtypes[y][x] = [TileSubtype.CHEST, content];
      chestIdx++;
    } else if (t === TileSubtype.POT) {
      subtypes[y][x] = [TileSubtype.POT];
    } else if (t === TileSubtype.ROCK) {
      subtypes[y][x] = [TileSubtype.ROCK];
    }
  }

  // Place player at room center
  const py = Math.floor((start + end) / 2);
  const px = Math.floor((start + end) / 2);
  subtypes[py][px] = [TileSubtype.PLAYER];

  const mapData: MapData = { tiles, subtypes } as MapData;

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: true, // fully lit
    win: false,
    playerDirection: Direction.DOWN,
    enemies: [], // no enemies for the test room
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

function TestRoomInner() {
  const initialState = buildTestRoom();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#1B1B1B] text-white">
      <TilemapGrid tileTypes={tileTypes} initialGameState={initialState} />
    </div>
  );
}

export default function TestRoomPage() {
  return (
    <Suspense fallback={null}>
      <TestRoomInner />
    </Suspense>
  );
}
