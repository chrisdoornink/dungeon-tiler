/**
 * Hearth & Home (/home) — state builder for the family-house scene.
 *
 * A deliberately stripped-down cousin of buildStoryModeState(): one room, no
 * enemies, no checkpoints, no diary, fresh on every visit. Runs in "story"
 * mode so NPC bump interactions and the dialogue registry work unchanged.
 *
 * Character toggle: pass the family member being played. They spawn just
 * inside the front door (walking home), everyone else is home as an NPC.
 * The two GameState fields this sets — activeHeroId and heroSprite — are
 * optional and never set anywhere else, so daily/story/endless are untouched.
 */

import {
  Direction,
  TileSubtype,
  type GameState,
  type MapData,
} from "../map";
import { rehydrateNPCs, serializeNPCs } from "../npc";
import { createInitialStoryFlags } from "./event_registry";
import {
  buildFamilyHouse,
  getFamilyMember,
  FAMILY_HOUSE_SPAWN,
  type FamilyMemberId,
} from "./rooms/home";

function cloneMapData(mapData: MapData): MapData {
  return JSON.parse(JSON.stringify(mapData)) as MapData;
}

function addPlayer(mapData: MapData, position: [number, number]): MapData {
  const [py, px] = position;
  const clone = cloneMapData(mapData);
  const cell = clone.subtypes[py][px] ?? [];
  if (!cell.includes(TileSubtype.PLAYER)) {
    clone.subtypes[py][px] = [...cell, TileSubtype.PLAYER];
  }
  return clone;
}

export function buildHearthHomeState(
  heroId: FamilyMemberId = "chris"
): GameState {
  const hero = getFamilyMember(heroId);
  const house = buildFamilyHouse(heroId);
  const npcsPlain = serializeNPCs(house.npcs) ?? [];

  const roomSnapshots: GameState["rooms"] = {
    [house.id]: {
      mapData: cloneMapData(house.mapData),
      entryPoint: FAMILY_HOUSE_SPAWN,
      enemies: [],
      npcs: npcsPlain,
      metadata: house.metadata
        ? (JSON.parse(JSON.stringify(house.metadata)) as Record<string, unknown>)
        : undefined,
    },
  };

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mode: "story",
    allowCheckpoints: false,
    mapData: addPlayer(house.mapData, FAMILY_HOUSE_SPAWN),
    showFullMap: false,
    win: false,
    playerDirection: Direction.UP,
    enemies: [],
    npcs: rehydrateNPCs(npcsPlain),
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    heroTorchLit: false,
    activeHeroId: hero.id,
    heroSprite: hero.sprite,
    heroSpriteBack: hero.spriteBack,
    heroSpriteSide: hero.spriteSide,
    heroSpriteScale: hero.heroSpriteScale,
    rockCount: 0,
    runeCount: 0,
    bombCount: 0,
    foodCount: 0,
    potionCount: 0,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
    },
    recentDeaths: [],
    npcInteractionQueue: [],
    currentRoomId: house.id,
    rooms: roomSnapshots,
    roomTransitions: [],
    storyFlags: createInitialStoryFlags(),
    diaryEntries: [],
  };

  return gameState;
}
