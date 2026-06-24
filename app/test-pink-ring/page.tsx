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
import { buildPinkRealm } from "../../lib/map/pink-realm";
import { seedMist } from "../../lib/map/pink-mist";
import { rehydrateEnemies } from "../../lib/enemy";
import { TilemapGrid } from "../../components/TilemapGrid";

const BASE = {
  hasKey: false,
  hasExitKey: false,
  showFullMap: false,
  win: false,
  playerDirection: Direction.DOWN,
  heroHealth: 5,
  heroMaxHealth: 5,
  heroAttack: 1,
  bombCount: 8,
  rockCount: 0,
  runeCount: 0,
  heroTorchLit: true,
  mode: "normal" as const,
  stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
  recentDeaths: [],
};

function emptyFloorTiles(
  mapData: { tiles: number[][]; subtypes: number[][][] },
  origin: [number, number],
  minD: number,
  maxD: number
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < mapData.tiles.length; y++) {
    for (let x = 0; x < mapData.tiles[y].length; x++) {
      if (mapData.tiles[y][x] !== FLOOR) continue;
      if ((mapData.subtypes[y][x]?.length ?? 0) !== 0) continue;
      const d = Math.abs(y - origin[0]) + Math.abs(x - origin[1]);
      if (d >= minD && d <= maxD) out.push([y, x]);
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Default: a real procedural L3 layout seeded with 4 pink goblins, for prototyping the
// teleport-ring -> pink realm path end to end. Reload for a fresh layout.
function buildDungeonState(): GameState {
  const mapData = generateCompleteMapForFloor(
    { chests: 0, keys: 0, chestContents: [] },
    3
  );
  const player = findPlayerPosition(mapData) ?? [1, 1];
  const eligible = emptyFloorTiles(mapData, player, 5, Infinity);
  shuffle(eligible);
  const picked: Array<[number, number]> = [];
  for (const c of eligible) {
    if (picked.length >= 4) break;
    if (picked.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) >= 4)) {
      picked.push(c);
    }
  }
  const goblins = picked.map(([y, x]) => ({ y, x, kind: "pink-goblin" as const }));
  return {
    ...BASE,
    mapData,
    enemies: rehydrateEnemies(goblins),
  } as GameState;
}

// ?realm=1: start directly INSIDE the pink realm (showFullMap so the whole drifting mist
// is visible) so the mist + reversed controls + blinding can be iterated on without first
// hunting a goblin. Walk into the mist to feel the reversed controls; a white-goblin swarm
// sits a few tiles off so blinding can be tested. The tile you spawn on is the return ring.
function buildRealmState(): GameState {
  const source = generateCompleteMapForFloor(
    { chests: 0, keys: 0, chestContents: [] },
    3
  );
  const player = findPlayerPosition(source) ?? [1, 1];
  // dungeonReturn snapshot: the source room minus the player marker.
  const returnMap = {
    tiles: source.tiles.map((r) => r.slice()),
    subtypes: source.subtypes.map((row) =>
      row.map((c) => c.filter((t) => t !== TileSubtype.PLAYER))
    ),
    environment: source.environment,
  };
  const { mapData, entry } = buildPinkRealm(source, player);
  // Stand the hero on the entry tile (which already holds the return ring).
  mapData.subtypes[entry[0]][entry[1]] = [
    ...(mapData.subtypes[entry[0]][entry[1]] ?? []),
    TileSubtype.PLAYER,
  ];
  const mist = seedMist(mapData, Math.random, [entry]);
  const enemyTiles = shuffle(emptyFloorTiles(mapData, entry, 4, 9)).slice(0, 3);
  const enemies = rehydrateEnemies(
    enemyTiles.map(([y, x]) => ({ y, x, kind: "white-goblin" as const }))
  );
  return {
    ...BASE,
    showFullMap: true,
    mapData,
    enemies,
    inPinkRealm: true,
    reachedPinkRealm: true,
    mist,
    dungeonReturn: { mapData: returnMap, position: player },
  } as GameState;
}

function buildState(): GameState {
  const realm =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("realm") === "1";
  return realm ? buildRealmState() : buildDungeonState();
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
        you. Add <b className="text-pink-300">?realm=1</b> to start inside the realm (mist +
        reversed controls + blinded goblins). Reload for a fresh layout.
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
