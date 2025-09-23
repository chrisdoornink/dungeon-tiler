import type { PlainEnemy } from "../enemy";
import { Enemy, EnemyState } from "../enemy";
import type { MapData } from "./types";
import { TileSubtype } from "./constants";
import {
  clonePlainNPCs as clonePlainNPCsUtil,
  type PlainNPC,
  type NPC,
  serializeNPCs as serializeNPCsUtil,
} from "../npc";

export function cloneMapData(mapData: MapData): MapData {
  return JSON.parse(JSON.stringify(mapData)) as MapData;
}

export function clonePlainEnemies(
  enemies?: PlainEnemy[]
): PlainEnemy[] | undefined {
  if (!enemies) return undefined;
  return enemies.map((enemy) => {
    const behavior = enemy.behaviorMemory ?? enemy._behaviorMem;
    const behaviorClone = behavior ? { ...behavior } : undefined;
    return {
      ...enemy,
      behaviorMemory: behaviorClone,
      _behaviorMem: behaviorClone,
    };
  });
}

export function enemyToPlain(enemy: Enemy): PlainEnemy {
  const behavior = enemy.behaviorMemory;
  const behaviorClone = behavior ? { ...behavior } : undefined;
  return {
    y: enemy.y,
    x: enemy.x,
    kind: enemy.kind,
    health: enemy.health,
    attack: enemy.attack,
    facing: enemy.facing,
    state: enemy.state ?? EnemyState.IDLE,
    behaviorMemory: behaviorClone,
    _behaviorMem: behaviorClone,
  };
}

export function serializeEnemies(
  enemies?: Enemy[]
): PlainEnemy[] | undefined {
  if (!enemies) return undefined;
  return enemies.map((enemy) => enemyToPlain(enemy));
}

export function serializeNPCs(npcs?: NPC[]): PlainNPC[] | undefined {
  return serializeNPCsUtil(npcs);
}

export function clonePlainNPCs(
  npcs?: PlainNPC[]
): PlainNPC[] | undefined {
  return clonePlainNPCsUtil(npcs);
}

export function clonePotOverrides(
  overrides?: Record<string, TileSubtype.FOOD | TileSubtype.MED>
): Record<string, TileSubtype.FOOD | TileSubtype.MED> | undefined {
  if (!overrides) return undefined;
  return { ...overrides };
}

export function getMapHeight(mapData: MapData): number {
  return mapData.tiles.length;
}

export function getMapWidth(mapData: MapData): number {
  return mapData.tiles[0]?.length ?? 0;
}

export function isWithinBounds(
  mapData: MapData,
  y: number,
  x: number
): boolean {
  const height = getMapHeight(mapData);
  const width = getMapWidth(mapData);
  return y >= 0 && y < height && x >= 0 && x < width;
}

export function computeMapId(mapData: MapData): string {
  try {
    const payload = JSON.stringify({ t: mapData.tiles, s: mapData.subtypes });
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      // FNV prime multiplication (mod 2^32)
      hash = (hash >>> 0) * 0x01000193;
    }
    // Convert to unsigned hex string
    return (hash >>> 0).toString(16);
  } catch {
    // Fallback: random id
    return Math.random().toString(36).slice(2, 10);
  }
}
