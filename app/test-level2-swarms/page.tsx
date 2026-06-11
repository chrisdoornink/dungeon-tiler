"use client";

import React, { Suspense } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  Direction,
  type GameState,
  generateCompleteMapForFloor,
  allocateChestsAndKeys,
  findPlayerPosition,
} from "../../lib/map";
import { Enemy, placeEnemies } from "../../lib/enemy";
import { assignWhiteGoblinSwarmIds } from "../../lib/enemy_assignment";

// How many white-goblin swarms to drop into the level (each swarm = 4 goblins).
// Bump this if you want a denser room.
const SWARM_COUNT = 3;

/**
 * Builds a fresh, real "floor 2" daily layout (floor-2 grid size, rocks, pots,
 * chests, exit key, wall torches — everything generateCompleteMapForFloor makes)
 * and then populates it with ONLY white-goblin swarms. No other goblins, ghosts,
 * snakes, or stone-goblin rune pots: those steps are skipped on purpose.
 */
function buildLevel2SwarmRoom(): GameState {
  // Use the same chest/key allocation a real floor 2 gets.
  const floorAlloc =
    allocateChestsAndKeys().get(2) ?? { chests: 0, keys: 0, chestContents: [] };
  const mapData = generateCompleteMapForFloor(floorAlloc, 2);
  mapData.environment = mapData.environment ?? "cave";

  const playerPos = findPlayerPosition(mapData);

  // Place SWARM_COUNT anchor tiles (at least 6 away from the player), then drop
  // a 4-goblin swarm on each — mirroring how the daily places white goblins.
  const enemies: Enemy[] = [];
  if (playerPos) {
    const swarmLocations = placeEnemies({
      grid: mapData.tiles,
      player: { y: playerPos[0], x: playerPos[1] },
      count: SWARM_COUNT,
      minDistanceFromPlayer: 6,
    });
    swarmLocations.forEach((location) => {
      for (let i = 0; i < 4; i++) {
        const goblin = new Enemy({ y: location.y, x: location.x });
        goblin.kind = "white-goblin";
        enemies.push(goblin);
      }
    });
    assignWhiteGoblinSwarmIds(enemies);
  }

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    // A real floor-2 hero would already be carrying their sword from floor 1.
    hasSword: true,
    hasShield: false,
    showFullMap: false,
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
    mapData,
    recentDeaths: [],
    mode: "normal",
  };

  return gameState;
}

function TestLevel2SwarmsInner() {
  const initialState = buildLevel2SwarmRoom();
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
          <h1 className="text-2xl font-bold mb-2">Level 2 — White Goblin Swarms</h1>
          <p className="text-sm text-gray-300">
            A real floor-2 daily layout, populated only with white-goblin swarms.
          </p>
          <div className="text-xs text-gray-400 mt-2 space-y-1">
            <p>{SWARM_COUNT} swarms x 4 = {SWARM_COUNT * 4} white goblins</p>
            <p>Hero: 5 HP, 1 ATK + Sword (+2). Reload for a new layout.</p>
          </div>
        </div>
        <TilemapGrid
          tileTypes={tileTypes}
          initialGameState={initialState}
        />
      </div>
    </div>
  );
}

export default function TestLevel2SwarmsPage() {
  return (
    <Suspense fallback={null}>
      <TestLevel2SwarmsInner />
    </Suspense>
  );
}
