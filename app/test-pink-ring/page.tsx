"use client";

import { useMemo } from "react";
import {
  tileTypes,
  TileSubtype,
  Direction,
  generateCompleteMapForFloor,
  type GameState,
} from "../../lib/map";
import { FLOOR } from "../../lib/map/constants";
import { findPlayerPosition } from "../../lib/map/player";
import { rehydrateEnemies } from "../../lib/enemy";
import { TilemapGrid } from "../../components/TilemapGrid";

// A real procedural Level-3 daily layout, seeded with 4 pink goblins, for prototyping the
// teleport-ring -> pink realm mechanic. Reload for a fresh layout.
function buildState(): GameState {
  const mapData = generateCompleteMapForFloor(
    { chests: 0, keys: 0, chestContents: [] },
    3
  );
  const player = findPlayerPosition(mapData) ?? [1, 1];

  // Eligible goblin tiles: empty floor, a few tiles away from the player.
  const eligible: Array<[number, number]> = [];
  for (let y = 0; y < mapData.tiles.length; y++) {
    for (let x = 0; x < mapData.tiles[y].length; x++) {
      if (mapData.tiles[y][x] !== FLOOR) continue;
      const subs = mapData.subtypes[y][x] || [];
      const empty = subs.length === 0 || subs.every((s) => s === TileSubtype.NONE);
      if (!empty) continue;
      const dist = Math.abs(y - player[0]) + Math.abs(x - player[1]);
      if (dist >= 5) eligible.push([y, x]);
    }
  }
  // Shuffle, then pick 4 reasonably spread out.
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const picked: Array<[number, number]> = [];
  for (const c of eligible) {
    if (picked.length >= 4) break;
    if (picked.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) >= 4)) {
      picked.push(c);
    }
  }
  const goblins = picked.map(([y, x]) => ({ y, x, kind: "pink-goblin" as const }));

  return {
    hasKey: false,
    hasExitKey: false,
    mapData,
    showFullMap: false,
    win: false,
    playerDirection: Direction.DOWN,
    enemies: rehydrateEnemies(goblins),
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    bombCount: 8,
    rockCount: 0,
    runeCount: 0,
    heroTorchLit: true,
    mode: "normal",
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
  };
}

export default function TestPinkRingPage() {
  const initialState = useMemo(() => buildState(), []);
  return (
    <div className="min-h-screen flex flex-col items-center p-3 gap-2 text-white bg-black">
      <p className="max-w-[720px] text-xs text-gray-400 leading-snug text-center">
        <b className="text-gray-200">Pink ring prototype — real L3 layout.</b> Arrows move,
        <b> B</b> throws a bomb (8 to start). Four pink goblins hide in the rooms and drop
        teleport rings when they can&apos;t see you. Bomb one while a ring is out and it
        leaves the ring behind — step on it to warp to the pink realm; the ring there returns
        you. Reload for a fresh layout.
      </p>
      <TilemapGrid
        tileTypes={tileTypes}
        initialGameState={initialState}
        forceDaylight={true}
        storageSlot="test"
      />
    </div>
  );
}
