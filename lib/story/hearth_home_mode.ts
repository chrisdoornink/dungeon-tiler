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
  findPlayerPosition,
  type GameState,
  type MapData,
  type PartyMemberState,
} from "../map";
import { Enemy } from "../enemy";
import { rehydrateNPCs, serializeNPCs } from "../npc";
import { createInitialStoryFlags } from "./event_registry";
import {
  buildBackyard,
  buildFamilyHouse,
  createFamilyNpc,
  getFamilyMember,
  BACKYARD_ENTRY,
  FAMILY_HOUSE_SPAWN,
  FAMILY_MEMBERS,
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

function freshPartyMember(id: FamilyMemberId): PartyMemberState {
  return {
    id,
    health: 5,
    maxHealth: 5,
    attack: 1,
    alive: true,
    hasSword: false,
    hasShield: false,
    rockCount: 0,
    runeCount: 0,
    bombCount: 0,
    foodCount: 0,
    potionCount: 0,
  };
}

export function buildHearthHomeState(
  heroId: FamilyMemberId = "chris",
  opts: { startOutside?: boolean } = {}
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
    party: FAMILY_MEMBERS.map((m) => freshPartyMember(m.id)),
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

  // Shortcut: skip the whole in-house intro and start in the backyard with the
  // family already armed (for testing the survival core, and for replays).
  if (opts.startOutside) {
    return enterBackyard(gameState, { armAll: true });
  }

  return gameState;
}

/**
 * Move the scene out to the backyard arena — the handoff from the authored
 * prologue into the survival core. Preserves the live party roster (health,
 * inventory, who's alive); with `armAll` it's a fresh, fully-armed start (the
 * shortcut). The hero lands at the back-yard entry, living family cluster
 * around them, and the first outdoor threat is on the field.
 */
export function enterBackyard(
  state: GameState,
  opts: { armAll?: boolean } = {}
): GameState {
  const yard = buildBackyard();
  const heroId = (state.activeHeroId ?? "chris") as FamilyMemberId;
  const heroMember = getFamilyMember(heroId);

  let party =
    state.party ?? FAMILY_MEMBERS.map((m) => freshPartyMember(m.id));
  // Sync the controlled hero's LIVE stats back to the roster first — mid-game
  // they live in the projected hero fields and may be ahead of the entry.
  party = party.map((p) =>
    p.id === heroId
      ? {
          ...p,
          health: state.heroHealth ?? p.health,
          maxHealth: state.heroMaxHealth ?? p.maxHealth,
          attack: state.heroAttack ?? p.attack,
          hasSword: !!state.hasSword,
          hasShield: !!state.hasShield,
          rockCount: state.rockCount ?? p.rockCount,
          runeCount: state.runeCount ?? p.runeCount,
          bombCount: state.bombCount ?? p.bombCount,
          foodCount: state.foodCount ?? p.foodCount,
          potionCount: state.potionCount ?? p.potionCount,
        }
      : p
  );
  if (opts.armAll) {
    party = party.map((p) => ({
      ...p,
      alive: true,
      hasSword: true,
      health: p.maxHealth,
    }));
  }
  const heroEntry =
    party.find((p) => p.id === heroId) ?? freshPartyMember(heroId);

  // Living family (minus the hero) arrive clustered around the entry.
  const spots: Array<[number, number]> = [
    [11, 5],
    [11, 7],
    [10, 6],
    [10, 5],
    [10, 7],
  ];
  let si = 0;
  const npcObjects = FAMILY_MEMBERS.filter(
    (m) => m.id !== heroId && party.find((p) => p.id === m.id)?.alive
  ).map((m, index) => {
    const [ny, nx] = spots[si++] ?? [9, 4 + index];
    const entry = party.find((p) => p.id === m.id);
    const npc = createFamilyNpc(m, {
      y: ny,
      x: nx,
      facing: Direction.UP,
      followOrder: index,
      health: entry?.health,
      maxHealth: entry?.maxHealth,
      armed: !!entry?.hasSword,
    });
    // The company advances together into the fight.
    npc.metadata = { ...npc.metadata, behavior: "follow" };
    return npc;
  });
  const npcsPlain = serializeNPCs(npcObjects) ?? [];

  // The first outdoor threat — where the real game begins.
  const enemies = ([
    [2, 4],
    [2, 6],
    [2, 8],
  ] as Array<[number, number]>).map(([y, x]) => {
    const e = new Enemy({ y, x });
    e.kind = "fire-goblin";
    return e;
  });

  const mapData = addPlayer(cloneMapData(yard.mapData), BACKYARD_ENTRY);

  return {
    ...state,
    mapData,
    npcs: rehydrateNPCs(npcsPlain),
    enemies,
    party,
    activeHeroId: heroId,
    heroSprite: heroMember.sprite,
    heroSpriteBack: heroMember.spriteBack,
    heroSpriteSide: heroMember.spriteSide,
    heroSpriteScale: heroMember.heroSpriteScale,
    playerDirection: Direction.UP,
    heroHealth: heroEntry.health,
    heroMaxHealth: heroEntry.maxHealth,
    heroAttack: heroEntry.attack,
    hasSword: heroEntry.hasSword,
    hasShield: heroEntry.hasShield,
    rockCount: heroEntry.rockCount,
    runeCount: heroEntry.runeCount,
    bombCount: heroEntry.bombCount,
    foodCount: heroEntry.foodCount,
    potionCount: heroEntry.potionCount,
    currentRoomId: yard.id,
    rooms: {
      ...(state.rooms ?? {}),
      [yard.id]: {
        mapData: cloneMapData(yard.mapData),
        entryPoint: BACKYARD_ENTRY,
        enemies: [],
        npcs: npcsPlain,
        metadata: yard.metadata
          ? (JSON.parse(JSON.stringify(yard.metadata)) as Record<string, unknown>)
          : undefined,
      },
    },
    rallyPoint: null,
    scenarioCounters: {},
    hearthExitTiles: undefined,
    scenarioFlags: { ...(state.scenarioFlags ?? {}), hearthOutside: true },
  };
}

/**
 * Core of possession: hand control of the world to `targetId`. Assumes the
 * roster in `state.party` is already up to date (write-backs and death
 * marking happen in the callers). The PLAYER tile moves to the target's body,
 * the target's roster entry is projected into the singular hero fields, and
 * the NPC roster is rebuilt in family order — living members keep their live
 * positions and health; the ex-hero re-enters as an NPC only when
 * `includeExHeroAsNpc` (false after a death: the body is gone).
 */
function projectControlTo(
  state: GameState,
  targetId: FamilyMemberId,
  opts: { includeExHeroAsNpc: boolean }
): GameState {
  const party = state.party ?? [];
  const targetEntry = party.find((p) => p.id === targetId);
  if (!targetEntry || !targetEntry.alive) return state;

  const currentId = state.activeHeroId as FamilyMemberId | undefined;
  const targetMember = getFamilyMember(targetId);

  const heroPos = findPlayerPosition(state.mapData);
  const targetNpc = (state.npcs ?? []).find(
    (npc) => npc.id === targetMember.npcId
  );
  if (!heroPos || !targetNpc) return state;

  // Move the PLAYER tile from the old body to the new one.
  const mapData = cloneMapData(state.mapData);
  const [hy, hx] = heroPos;
  mapData.subtypes[hy][hx] = (mapData.subtypes[hy][hx] ?? []).filter(
    (t) => t !== TileSubtype.PLAYER
  );
  const targetCell = mapData.subtypes[targetNpc.y][targetNpc.x] ?? [];
  if (!targetCell.includes(TileSubtype.PLAYER)) {
    mapData.subtypes[targetNpc.y][targetNpc.x] = [
      ...targetCell,
      TileSubtype.PLAYER,
    ];
  }

  // Rebuild the NPC roster in family order from the living members.
  const liveById = new Map((state.npcs ?? []).map((npc) => [npc.id, npc]));
  const npcs = FAMILY_MEMBERS.filter((m) => {
    if (m.id === targetId) return false;
    const entry = party.find((p) => p.id === m.id);
    if (!entry?.alive) return false;
    if (m.id === currentId && !opts.includeExHeroAsNpc) return false;
    return true;
  }).map((m, index) => {
    const entry = party.find((p) => p.id === m.id);
    if (m.id === currentId) {
      return createFamilyNpc(m, {
        y: hy,
        x: hx,
        facing: state.playerDirection,
        followOrder: index,
        health: entry?.health,
        maxHealth: entry?.maxHealth,
        armed: !!entry?.hasSword,
      });
    }
    const live = liveById.get(m.npcId);
    return createFamilyNpc(m, {
      y: live?.y ?? m.home[0],
      x: live?.x ?? m.home[1],
      facing: live?.facing ?? m.facing,
      followOrder: index,
      health: live?.health ?? entry?.health,
      maxHealth: live?.maxHealth ?? entry?.maxHealth,
      armed: !!entry?.hasSword,
    });
  });

  return {
    ...state,
    mapData,
    npcs,
    party,
    activeHeroId: targetId,
    heroSprite: targetMember.sprite,
    heroSpriteBack: targetMember.spriteBack,
    heroSpriteSide: targetMember.spriteSide,
    heroSpriteScale: targetMember.heroSpriteScale,
    playerDirection: targetNpc.facing,
    heroHealth: targetEntry.health,
    heroMaxHealth: targetEntry.maxHealth,
    heroAttack: targetEntry.attack,
    hasSword: targetEntry.hasSword,
    hasShield: targetEntry.hasShield,
    rockCount: targetEntry.rockCount,
    runeCount: targetEntry.runeCount,
    bombCount: targetEntry.bombCount,
    foodCount: targetEntry.foodCount,
    potionCount: targetEntry.potionCount,
  };
}

/**
 * Switch control to another living family member, mid-play, world intact.
 * The current hero's live stats are written back into the roster first.
 * Returns the input state unchanged for no-ops (same member, dead, unknown).
 */
export function switchPartyMember(
  state: GameState,
  targetId: FamilyMemberId
): GameState {
  if (state.activeHeroId === targetId) return state;
  const targetEntry = state.party?.find((p) => p.id === targetId);
  if (!targetEntry || !targetEntry.alive) return state;

  const currentId = state.activeHeroId as FamilyMemberId | undefined;
  if (!currentId) return state;

  const party = (state.party ?? []).map((p) =>
    p.id === currentId
      ? {
          ...p,
          health: state.heroHealth ?? p.health,
          maxHealth: state.heroMaxHealth ?? p.maxHealth,
          attack: state.heroAttack ?? p.attack,
          hasSword: !!state.hasSword,
          hasShield: !!state.hasShield,
          rockCount: state.rockCount ?? 0,
          runeCount: state.runeCount ?? 0,
          bombCount: state.bombCount ?? 0,
          foodCount: state.foodCount ?? 0,
          potionCount: state.potionCount ?? 0,
        }
      : p
  );

  return projectControlTo({ ...state, party }, targetId, {
    includeExHeroAsNpc: true,
  });
}

/**
 * The controlled member just died (permadeath). Control jumps to the first
 * living member in family order; their fallen body does not re-enter the
 * world. When nobody is left, the visit starts over fresh.
 */
export function handleControlledMemberDeath(state: GameState): GameState {
  const currentId = state.activeHeroId as FamilyMemberId | undefined;
  if (!currentId) return state;

  const party = (state.party ?? []).map((p) =>
    p.id === currentId ? { ...p, alive: false, health: 0 } : p
  );
  const successor = FAMILY_MEMBERS.find((m) =>
    party.some((p) => p.id === m.id && p.alive)
  );
  if (!successor) {
    // The whole family has fallen — the house resets to a fresh visit.
    return buildHearthHomeState();
  }
  return projectControlTo({ ...state, party }, successor.id, {
    includeExHeroAsNpc: false,
  });
}
