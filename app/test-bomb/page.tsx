"use client";

import { useMemo } from "react";
import { tileTypes, TileSubtype, Direction, type GameState } from "../../lib/map";
import { FLOOR, WALL } from "../../lib/map/constants";
import type { MapData } from "../../lib/map/types";
import { TilemapGrid } from "../../components/TilemapGrid";

const W = 16;
const H = 14;

// A fixed sandbox arena for testing the bomb + Level-2 optional items.
function buildState(): GameState {
  const tiles: number[][] = [];
  const subtypes: number[][][] = [];
  for (let y = 0; y < H; y++) {
    const trow: number[] = [];
    const srow: number[][] = [];
    for (let x = 0; x < W; x++) {
      const border = y === 0 || y === H - 1 || x === 0 || x === W - 1;
      trow.push(border ? WALL : FLOOR);
      srow.push([]);
    }
    tiles.push(trow);
    subtypes.push(srow);
  }

  // The three Level-2 optional-item chests, locked (the player carries a key).
  subtypes[3][5] = [TileSubtype.CHEST, TileSubtype.BOMB, TileSubtype.LOCK];
  subtypes[3][8] = [TileSubtype.CHEST, TileSubtype.SNAKE_MEDALLION, TileSubtype.LOCK];
  subtypes[3][11] = [TileSubtype.CHEST, TileSubtype.EXTRA_HEART, TileSubtype.LOCK];

  // An interior wall stack to practice blowing up.
  tiles[7][12] = WALL;
  tiles[8][12] = WALL;
  tiles[9][12] = WALL;

  // Player start at low health so the Extra Heart's full refill is obvious.
  subtypes[8][2] = [TileSubtype.PLAYER];

  const mapData: MapData = { tiles, subtypes, environment: "cave" };
  return {
    hasKey: true, // opens the locked test chests (not consumed in single-tier mode)
    hasExitKey: false,
    mapData,
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    heroHealth: 2,
    heroMaxHealth: 5,
    heroAttack: 1,
    bombCount: 0,
    rockCount: 0,
    runeCount: 0,
    heroTorchLit: true,
    mode: "normal",
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    recentDeaths: [],
  };
}

export default function TestBombPage() {
  const initialState = useMemo(() => buildState(), []);
  return (
    <div className="min-h-screen flex flex-col items-center p-4 gap-3 text-white bg-black">
      <div className="max-w-[640px] text-sm text-gray-300 leading-relaxed">
        <p className="font-semibold text-white">Bomb / Level-2 items test room</p>
        <p>
          Move with the arrow keys. Open the three locked chests (you have a key) to
          collect the Level-2 optional items: <b>Bombs ×3</b>, the <b>Travel Medallion</b>,
          and an <b>Extra Heart</b> — you start at 2 hearts, so the heart should refill you
          to a full 6. Press <b>B</b> (or tap the Bomb button) to throw a bomb: it comes to
          rest beside the nearest wall and detonates on your next turn. Blow up the wall
          stack on the right, or breach the outer wall and step out into the grassland.
          Reload the page to reset the room.
        </p>
      </div>
      <TilemapGrid
        tileTypes={tileTypes}
        initialGameState={initialState}
        forceDaylight={true}
        storageSlot="test"
      />
    </div>
  );
}
