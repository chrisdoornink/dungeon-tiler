import { Enemy } from "../enemy";
import { TileSubtype, FLOOR } from "./constants";
import type { MapData } from "./types";
import { getLastRooms } from "./map-generation";
import { findPlayerPosition } from "./player";

export function addSnakesPerRules(
  mapData: MapData,
  enemies: Enemy[],
  opts?: { rng?: () => number; floor?: number }
): Enemy[] {
  const rng = opts?.rng ?? Math.random;
  const floor = opts?.floor ?? 1;
  const rooms = getLastRooms();
  const out = enemies.slice();
  const taken = new Set(out.map((e) => `${e.y},${e.x}`));
  const playerPos = findPlayerPosition(mapData);
  if (playerPos) taken.add(`${playerPos[0]},${playerPos[1]}`);

  // 5% chance for a rare snake swarm event
  let targetSnakes: number;
  if (rng() < 0.05) {
    targetSnakes = 7;
    // Mark the level so pot-reveal logic can guarantee at least 2 potions.
    mapData.snakeSwarm = true;
  } else {
    // Scale snake count by floor with ranges:
    // Floors 1–6: 0–1  |  Floors 7–8: 0–3  |  Floor 9: 1–3  |  Floor 10: 2–4
    if (floor <= 6) targetSnakes = Math.floor(rng() * 2);              // 0–1
    else if (floor <= 8) targetSnakes = Math.floor(rng() * 4);         // 0–3
    else if (floor <= 9) targetSnakes = 1 + Math.floor(rng() * 3);    // 1–3
    else targetSnakes = 2 + Math.floor(rng() * 3);                     // 2–4
  }
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

/**
 * Place a single STATIC guard enemy on a walkable tile next to the exit key.
 *
 * Floor 3's only objectives are the exit key and exit door, which are already pushed
 * to opposite corners of the map. Spreading them apart does not, on its own, force
 * combat (enemies aggro only on line-of-sight within range 8, move at the player's
 * speed, and forget after 5 turns), so a player can simply walk past. Stationing one
 * guard adjacent to the key guarantees the player must engage to pick it up: walking
 * into the guard resolves as an attack-in-place, so the key never becomes unreachable.
 *
 * The guard is marked via behaviorMemory.isGuard (persists through save/resume) so it
 * holds its post until it spots the player (see Enemy.update idle-wander handling).
 *
 * Additive (like ghost/white-goblin placement) — does not displace the base enemies.
 * Returns a new array; a no-op (returns the input list copy) when there is no key or
 * no eligible adjacent tile.
 */
export function addStaticGuardNearKey(
  mapData: MapData,
  enemies: Enemy[],
  opts?: { rng?: () => number }
): Enemy[] {
  const rng = opts?.rng ?? Math.random;
  const out = enemies.slice();

  // Locate the exit key.
  let keyPos: [number, number] | null = null;
  for (let y = 0; y < mapData.subtypes.length && !keyPos; y++) {
    const row = mapData.subtypes[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x].includes(TileSubtype.EXITKEY)) {
        keyPos = [y, x];
        break;
      }
    }
  }
  if (!keyPos) return out;

  const [ky, kx] = keyPos;
  const h = mapData.tiles.length;
  const w = mapData.tiles[0]?.length ?? 0;

  const occupied = new Set(out.map((e) => `${e.y},${e.x}`));
  const playerPos = findPlayerPosition(mapData);
  if (playerPos) occupied.add(`${playerPos[0]},${playerPos[1]}`);

  const isOpen = (y: number, x: number): boolean => {
    if (y < 0 || x < 0 || y >= h || x >= w) return false;
    if (mapData.tiles[y][x] !== FLOOR) return false;
    if (occupied.has(`${y},${x}`)) return false;
    const subs = mapData.subtypes[y][x] || [];
    // Only land on plain floor (no items, locks, hazards, the key/exit, etc.).
    return subs.length === 0 || (subs.length === 1 && subs.includes(TileSubtype.NONE));
  };

  // Prefer orthogonal neighbors of the key, then diagonals, then a radius-2 ring as a
  // last resort if the key is wedged in a tight spot.
  const ortho: Array<[number, number]> = [
    [ky - 1, kx], [ky + 1, kx], [ky, kx - 1], [ky, kx + 1],
  ];
  const diag: Array<[number, number]> = [
    [ky - 1, kx - 1], [ky - 1, kx + 1], [ky + 1, kx - 1], [ky + 1, kx + 1],
  ];
  const ring2: Array<[number, number]> = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dy) + Math.abs(dx) < 2) continue; // already covered by ortho/diag
      ring2.push([ky + dy, kx + dx]);
    }
  }

  const shuffle = (arr: Array<[number, number]>) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  let candidates = ortho.filter(([y, x]) => isOpen(y, x));
  if (candidates.length === 0) candidates = diag.filter(([y, x]) => isOpen(y, x));
  if (candidates.length === 0) candidates = ring2.filter(([y, x]) => isOpen(y, x));
  if (candidates.length === 0) return out;

  shuffle(candidates);
  const [gy, gx] = candidates[0];

  const guard = new Enemy({ y: gy, x: gx });
  guard.kind = "fire-goblin"; // any non-ghost goblin works; ghosts deal no contact damage
  guard.behaviorMemory["isGuard"] = true;
  // Face toward the key for a "watching" look.
  if (gy < ky) guard.facing = "DOWN";
  else if (gy > ky) guard.facing = "UP";
  else if (gx < kx) guard.facing = "RIGHT";
  else if (gx > kx) guard.facing = "LEFT";

  out.push(guard);
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
