"use client";

import React, { Suspense } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  TileSubtype,
  Direction,
  type GameState,
  type MapData,
} from "../../lib/map";

function buildStoryHallway(): GameState {
  const HALL_LENGTH = 50; // Desired floor length of the hallway
  const HALL_WIDTH = 3; // Number of walkable rows inside the hallway
  const FLOOR = 0;
  const WALL = 1;

  // Include outer walls on all sides of the hallway
  const height = HALL_WIDTH + 2; // add top and bottom walls
  const width = HALL_LENGTH + 2; // add left and right walls

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );

  // Carve the walkable hallway interior
  for (let y = 1; y <= HALL_WIDTH; y++) {
    for (let x = 1; x <= HALL_LENGTH; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  // Place the player near the entrance, centered vertically
  const playerY = 1 + Math.floor(HALL_WIDTH / 2);
  const playerX = 2; // one tile inside the hallway past the entrance wall
  subtypes[playerY][playerX] = [TileSubtype.PLAYER];

  // Line the hallway walls with torches at a regular cadence
  const topWallY = 0;
  const bottomWallY = height - 1;
  const torchInterval = 6; // every six tiles keeps the hallway lit without crowding
  for (let offset = 2; offset <= HALL_LENGTH; offset += torchInterval) {
    const torchX = offset;
    if (subtypes[topWallY][torchX].length === 0) {
      subtypes[topWallY][torchX] = [TileSubtype.WALL_TORCH];
    }
    if (subtypes[bottomWallY][torchX].length === 0) {
      subtypes[bottomWallY][torchX] = [TileSubtype.WALL_TORCH];
    }
  }

  const mapData: MapData = { tiles, subtypes } as MapData;

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 5,
    heroAttack: 1,
    heroTorchLit: true,
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

function StoryHallwayInner() {
  const initialState = buildStoryHallway();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-300 tracking-wide uppercase">
          Story Mode: Hallway One
        </h1>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={false}
        />
      </div>
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense fallback={null}>
      <StoryHallwayInner />
    </Suspense>
  );
}
