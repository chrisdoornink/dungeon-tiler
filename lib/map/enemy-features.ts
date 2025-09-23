import { Enemy } from "../enemy";
import { TileSubtype, FLOOR } from "./constants";
import type { MapData } from "./types";
import { getLastRooms } from "./map-generation";
import { findPlayerPosition } from "./player";

export function addSnakesPerRules(
  mapData: MapData,
  enemies: Enemy[],
  opts?: { rng?: () => number }
): Enemy[] {
  const rng = opts?.rng ?? Math.random;
  const rooms = getLastRooms();
  const out = enemies.slice();
  const taken = new Set(out.map((e) => `${e.y},${e.x}`));
  const playerPos = findPlayerPosition(mapData);
  if (playerPos) taken.add(`${playerPos[0]},${playerPos[1]}`);

  const roomCount = Math.max(1, rooms.length);
  const targetSnakes = Math.min(4, Math.max(2, Math.round(roomCount * 0.33)));
  const potCount = Math.min(1, Math.floor(targetSnakes * 0.25));
  const floorCount = Math.max(0, targetSnakes - potCount);

  const floorCandidates: Array<[number, number]> = [];
  const potCandidates: Array<[number, number]> = [];
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        if (mapData.tiles[y][x] !== FLOOR) continue;
        const subs = mapData.subtypes[y][x] || [];
        const key = `${y},${x}`;
        if (taken.has(key)) continue;
        if (subs.length === 0 || subs.includes(TileSubtype.NONE)) {
          floorCandidates.push([y, x]);
          potCandidates.push([y, x]);
        }
      }
    }
  }

  const shuffle = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  shuffle(floorCandidates);
  shuffle(potCandidates);

  let potsPlaced = 0;
  for (let i = 0; i < potCandidates.length && potsPlaced < potCount; i++) {
    const [y, x] = potCandidates[i];
    const key = `${y},${x}`;
    if (taken.has(key)) continue;
    if ((mapData.subtypes[y][x] ?? []).length > 0) continue;
    mapData.subtypes[y][x] = [TileSubtype.POT, TileSubtype.SNAKE];
    potsPlaced++;
    taken.add(key);
  }

  let floorsPlaced = 0;
  for (let i = 0; i < floorCandidates.length && floorsPlaced < floorCount; i++) {
    const [y, x] = floorCandidates[i];
    const key = `${y},${x}`;
    if (taken.has(key)) continue;
    if ((mapData.subtypes[y][x] ?? []).length > 0) continue;
    const sn = new Enemy({ y, x });
    sn.kind = "snake";
    out.push(sn);
    taken.add(key);
    floorsPlaced++;
  }

  return out;
}

export function addSnakePots(
  mapData: MapData,
  enemies: Enemy[],
  opts?: { rng?: () => number }
): { mapData: MapData; enemies: Enemy[] } {
  const rng = opts?.rng ?? Math.random;
  const newMap = JSON.parse(JSON.stringify(mapData)) as MapData;
  const kept: Enemy[] = [];
  for (const e of enemies) {
    if (e.kind === "snake" && rng() < 0.5) {
      const subs = newMap.subtypes[e.y][e.x] || [];
      if (!subs.includes(TileSubtype.POT)) {
        newMap.subtypes[e.y][e.x] = [TileSubtype.POT, TileSubtype.SNAKE];
      } else if (!subs.includes(TileSubtype.SNAKE)) {
        newMap.subtypes[e.y][e.x].push(TileSubtype.SNAKE);
      }
    } else {
      kept.push(e);
    }
  }
  return { mapData: newMap, enemies: kept };
}
