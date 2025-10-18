import {
  TileSubtype,
  type GameState,
  type MapData,
  Direction,
  type RoomTransition,
  type RoomId,
  createCheckpointSnapshot,
  findPlayerPosition,
  isWithinBounds,
  FLOOR,
} from "../map";
import { createTimeOfDayAtPhase } from "../time_of_day";
import { Enemy, EnemyState, rehydrateEnemies, type PlainEnemy } from "../enemy";
import { NPC, rehydrateNPCs, serializeNPCs } from "../npc";
import { createInitialStoryFlags } from "./event_registry";
import {
  buildAscentCorridor,
  buildBluffCaves,
  buildBluffPassageway,
  buildBluffSerpentDen,
  buildEntranceHall,
  buildOutdoorClearing,
  buildOutdoorHouse,
  buildSanctum,
  buildTorchTown,
  buildTheWildsEntrance,
  buildDepthsOfDespairRoom1,
  buildDepthsOfDespairRoom2,
  buildEldrasCottage,
  buildMaroAndKirasCottage,
  buildJorinAndYannasCottage,
  buildSerinsClinic,
  buildRhettAndMirasCottage,
  buildHaroAndLensCottage,
  buildFennaTaviAndArinsCottage,
  buildDarasCottage,
  buildLibrary,
  buildStore,
  buildSmithy,
  buildGuardTower,
} from "./rooms/chapter1";
import type { StoryRoom } from "./rooms/types";
import { type StoryCondition } from "./event_registry";
import { determineRoomNpcs } from "./npc_conditions";

function cloneMapData(mapData: MapData): MapData {
  return JSON.parse(JSON.stringify(mapData)) as MapData;
}

/**
 * Resolve a human-friendly room label for UI overlays.
 * Prefers snapshot metadata (displayLabel), then known labels map, then
 * a generic "Torch Town — Home" fallback for generated homes, else the raw id.
 */
export function getRoomDisplayLabel(state: GameState, roomId: RoomId): string {
  const rooms = state.rooms ?? {};
  const snapshot = rooms[roomId as keyof typeof rooms];
  const fromMeta = (snapshot)?.metadata?.displayLabel as string | undefined;
  if (fromMeta && typeof fromMeta === "string") return fromMeta;
  const known = STORY_ROOM_LABELS[roomId];
  if (known) return known;
  if (roomId.startsWith("story-torch-town-home-")) return "Torch Town — Home";
  return roomId;
}



function withoutPlayer(mapData: MapData): MapData {
  const clone = cloneMapData(mapData);
  for (let y = 0; y < clone.subtypes.length; y++) {
    for (let x = 0; x < clone.subtypes[y].length; x++) {
      const cell = clone.subtypes[y][x];
      if (Array.isArray(cell) && cell.includes(TileSubtype.PLAYER)) {
        clone.subtypes[y][x] = cell.filter((t) => t !== TileSubtype.PLAYER);
      }
    }
  }
  return clone;
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

function enemyToPlain(enemy: Enemy): PlainEnemy {
  const behavior = enemy.behaviorMemory;
  const memoryClone = behavior ? { ...behavior } : undefined;
  return {
    y: enemy.y,
    x: enemy.x,
    kind: enemy.kind,
    health: enemy.health,
    attack: enemy.attack,
    facing: enemy.facing,
    state: enemy.state ?? EnemyState.IDLE,
    behaviorMemory: memoryClone,
    _behaviorMem: memoryClone,
  };
}

function serializeEnemies(enemies?: Enemy[]): PlainEnemy[] | undefined {
  if (!enemies) return undefined;
  return enemies.map((enemy) => enemyToPlain(enemy));
}

function cloneEnemies(enemies?: Enemy[]): Enemy[] {
  if (!enemies) return [];
  const plain = serializeEnemies(enemies) ?? [];
  return rehydrateEnemies(plain);
}

// Unused function - keeping for potential future use
// function cloneNPCs(npcs?: NPC[]): NPC[] {
//   if (!npcs) return [];
//   const plain = serializeNPCs(npcs) ?? [];
//   return rehydrateNPCs(plain);
// }

export function buildStoryModeState(): GameState {
  const entrance = buildEntranceHall();
  const ascent = buildAscentCorridor();
  const sanctum = buildSanctum();
  const outdoor = buildOutdoorClearing();
  const outdoorHouse = buildOutdoorHouse();
  const torchTown = buildTorchTown();
  const bluffPassage = buildBluffPassageway();
  const bluffCaves = buildBluffCaves();
  const bluffSerpentDen = buildBluffSerpentDen();
  const wildsEntrance = buildTheWildsEntrance();
  const depthsRoom1 = buildDepthsOfDespairRoom1();
  const depthsRoom2 = buildDepthsOfDespairRoom2();

  const transitions: RoomTransition[] = [];

  const pushTransition = (
    from: RoomId,
    to: RoomId,
    position: [number, number],
    targetEntryPoint?: [number, number]
  ) => {
    transitions.push({ from, to, position, targetEntryPoint });
  };

  pushTransition(
    entrance.id,
    ascent.id,
    entrance.transitionToNext!,
    ascent.entryPoint
  );
  pushTransition(
    ascent.id,
    entrance.id,
    ascent.transitionToPrevious!,
    entrance.returnEntryPoint ?? entrance.entryPoint
  );
  pushTransition(
    ascent.id,
    sanctum.id,
    ascent.transitionToNext!,
    sanctum.entryPoint
  );
  pushTransition(
    sanctum.id,
    ascent.id,
    sanctum.transitionToPrevious!,
    ascent.entryFromNext ?? ascent.entryPoint
  );
  pushTransition(
    sanctum.id,
    outdoor.id,
    sanctum.transitionToNext!,
    outdoor.entryPoint
  );
  pushTransition(
    outdoor.id,
    sanctum.id,
    outdoor.transitionToPrevious!,
    sanctum.entryFromNext ?? sanctum.entryPoint
  );
  pushTransition(outdoor.id, outdoorHouse.id, outdoor.transitionToNext!);
  pushTransition(
    outdoorHouse.id,
    outdoor.id,
    outdoorHouse.transitionToPrevious!,
    outdoor.entryFromNext ?? outdoor.entryPoint
  );

  if (outdoor.otherTransitions) {
    for (const link of outdoor.otherTransitions) {
      if (link.roomId !== torchTown.id) continue;
      pushTransition(
        outdoor.id,
        link.roomId,
        link.position,
        link.targetEntryPoint ?? torchTown.entryFromNext ?? torchTown.entryPoint
      );
      if (torchTown.transitionToPrevious) {
        pushTransition(
          torchTown.id,
          outdoor.id,
          torchTown.transitionToPrevious,
          link.returnEntryPoint ?? outdoor.entryPoint
        );
      }
    }
  }

  if (entrance.otherTransitions) {
    for (const link of entrance.otherTransitions) {
      pushTransition(
        entrance.id,
        link.roomId,
        link.position,
        link.targetEntryPoint ??
          (link.roomId === depthsRoom1.id
            ? depthsRoom1.entryPoint
            : undefined)
      );
    }
  }

  if (depthsRoom1.otherTransitions) {
    for (const link of depthsRoom1.otherTransitions) {
      pushTransition(
        depthsRoom1.id,
        link.roomId,
        link.position,
        link.targetEntryPoint ?? entrance.entryPoint
      );
    }
  }

  if (depthsRoom1.transitionToNext) {
    pushTransition(
      depthsRoom1.id,
      depthsRoom2.id,
      depthsRoom1.transitionToNext,
      depthsRoom2.entryPoint
    );
  }

  if (depthsRoom2.otherTransitions) {
    for (const link of depthsRoom2.otherTransitions) {
      pushTransition(
        depthsRoom2.id,
        link.roomId,
        link.position,
        link.targetEntryPoint ?? depthsRoom1.returnEntryPoint ?? depthsRoom1.entryPoint
      );
    }
  }

  // Outdoor -> Bluff Passageway transitions
  pushTransition(
    outdoor.id,
    bluffPassage.id,
    [3, 0],
    bluffPassage.entryPoint
  );
  pushTransition(
    bluffPassage.id,
    outdoor.id,
    bluffPassage.transitionToPrevious!,
    [4, 1]
  );

  if (bluffPassage.transitionToNext) {
    pushTransition(
      bluffPassage.id,
      bluffCaves.id,
      bluffPassage.transitionToNext,
      bluffCaves.entryPoint
    );
  }
  // When returning from Bluff Caves, land just left of the cave opening
  {
    const prevPos = bluffCaves.transitionToPrevious!;
    let targetInPassage: [number, number] = [1, 2];
    if (bluffPassage.transitionToNext) {
      const [ey, ex] = bluffPassage.transitionToNext;
      const candidate: [number, number] = [ey, Math.max(1, ex - 1)];
      // Use candidate only if it's a FLOOR within bounds
      const md = bluffPassage.mapData;
      if (
        candidate[0] >= 0 &&
        candidate[0] < md.tiles.length &&
        candidate[1] >= 0 &&
        candidate[1] < md.tiles[0].length &&
        md.tiles[candidate[0]][candidate[1]] === FLOOR
      ) {
        targetInPassage = candidate;
      } else if (md.tiles[ey]?.[ex] === FLOOR) {
        targetInPassage = [ey, ex];
      }
    }
    pushTransition(
      bluffCaves.id,
      bluffPassage.id,
      prevPos,
      targetInPassage
    );
  }
  pushTransition(
    bluffCaves.id,
    bluffSerpentDen.id,
    bluffCaves.transitionToNext!,
    bluffSerpentDen.entryPoint
  );
  pushTransition(
    bluffSerpentDen.id,
    bluffCaves.id,
    bluffSerpentDen.transitionToPrevious!,
    bluffCaves.entryFromNext ?? bluffCaves.entryPoint
  );

  // Build Torch Town interior rooms and transitions
  const extraRooms: StoryRoom[] = [];
  const torchTownBuildings = torchTown.metadata?.buildings as
    | {
        libraryDoor: [number, number];
        librarySize: [number, number];
        storeDoor: [number, number];
        storeSize: [number, number];
        smithyDoor?: [number, number];
        smithySize?: [number, number];
        guardTowerDoor?: [number, number];
        guardTowerSize?: [number, number];
        homeSize: [number, number];
      }
    | undefined;
  const torchTownHomes =
    (torchTown.metadata?.homes as Record<string, string>) || {};

  if (torchTownBuildings) {
    // Library interior - using individual builder
    const libraryRoom = buildLibrary();
    extraRooms.push(libraryRoom);
    pushTransition(
      torchTown.id,
      libraryRoom.id,
      torchTownBuildings.libraryDoor,
      libraryRoom.entryPoint
    );
    // Land outside the library door when exiting interior
    const libExitTarget: [number, number] = [
      torchTownBuildings.libraryDoor[0] + 1,
      torchTownBuildings.libraryDoor[1],
    ];
    pushTransition(
      libraryRoom.id,
      torchTown.id,
      libraryRoom.transitionToPrevious!,
      libExitTarget
    );

    // Store interior - using individual builder
    const storeRoom = buildStore();
    extraRooms.push(storeRoom);
    pushTransition(
      torchTown.id,
      storeRoom.id,
      torchTownBuildings.storeDoor,
      storeRoom.entryPoint
    );
    // Land outside the store door when exiting interior
    const storeExitTarget: [number, number] = [
      torchTownBuildings.storeDoor[0] + 1,
      torchTownBuildings.storeDoor[1],
    ];
    pushTransition(
      storeRoom.id,
      torchTown.id,
      storeRoom.transitionToPrevious!,
      storeExitTarget
    );

    // Smithy interior - using individual builder
    if (torchTownBuildings.smithyDoor && torchTownBuildings.smithySize) {
      const smithyRoom = buildSmithy();
      extraRooms.push(smithyRoom);
      pushTransition(
        torchTown.id,
        smithyRoom.id,
        torchTownBuildings.smithyDoor,
        smithyRoom.entryPoint
      );
      const smithyExitTarget: [number, number] = [
        torchTownBuildings.smithyDoor[0] + 1,
        torchTownBuildings.smithyDoor[1],
      ];
      pushTransition(
        smithyRoom.id,
        torchTown.id,
        smithyRoom.transitionToPrevious!,
        smithyExitTarget
      );
    }

    // Guard Tower interior - using individual builder
    if (torchTownBuildings.guardTowerDoor && torchTownBuildings.guardTowerSize) {
      const guardTowerRoom = buildGuardTower();
      extraRooms.push(guardTowerRoom);
      pushTransition(
        torchTown.id,
        guardTowerRoom.id,
        torchTownBuildings.guardTowerDoor,
        guardTowerRoom.entryPoint
      );
      const guardTowerExit: [number, number] = [
        torchTownBuildings.guardTowerDoor[0] + 1,
        torchTownBuildings.guardTowerDoor[1],
      ];
      pushTransition(
        guardTowerRoom.id,
        torchTown.id,
        guardTowerRoom.transitionToPrevious!,
        guardTowerExit
      );
    }

    // Homes interiors - using individual house builders
    const houseBuilders = [
      buildEldrasCottage,
      buildMaroAndKirasCottage,
      buildJorinAndYannasCottage,
      buildSerinsClinic,
      buildRhettAndMirasCottage,
      buildHaroAndLensCottage,
      buildFennaTaviAndArinsCottage,
      buildDarasCottage,
    ];
    
    let homeIdx = 0;
    for (const key of Object.keys(torchTownHomes)) {
      const [yStr, xStr] = key.split(",");
      const doorPos: [number, number] = [
        parseInt(yStr, 10),
        parseInt(xStr, 10),
      ];
      
      // Use the specific house builder for this index
      const homeRoom = houseBuilders[homeIdx]();
      extraRooms.push(homeRoom);
      pushTransition(torchTown.id, homeRoom.id, doorPos, homeRoom.entryPoint);
      // Land outside each home door when exiting interior
      const homeExitTarget: [number, number] = [doorPos[0] + 1, doorPos[1]];
      pushTransition(
        homeRoom.id,
        torchTown.id,
        homeRoom.transitionToPrevious!,
        homeExitTarget
      );
      homeIdx += 1;
    }
  }

  const entranceTargetBase = ascent.entryPoint;
  const entranceReturnBase = entrance.returnEntryPoint ?? entrance.entryPoint;
  const [entranceBaseY, entranceBaseX] = entrance.transitionToNext!;
  const entranceExtras = [-1, 1]
    .map((offset) => entranceBaseY + offset)
    .filter(
      (y) =>
        y > 0 &&
        y < entrance.mapData.tiles.length &&
        entrance.mapData.tiles[y][entranceBaseX] === FLOOR
    );
  for (const y of entranceExtras) {
    const offset = y - entranceBaseY;
    let targetY = entranceTargetBase[0] + offset;
    if (
      targetY < 0 ||
      targetY >= ascent.mapData.tiles.length ||
      ascent.mapData.tiles[targetY][entranceTargetBase[1]] !== FLOOR
    ) {
      targetY = entranceTargetBase[0];
    }
    pushTransition(
      entrance.id,
      ascent.id,
      [y, entranceBaseX],
      [targetY, entranceTargetBase[1]]
    );

    let returnTargetY = entranceReturnBase[0] + offset;
    if (
      returnTargetY < 0 ||
      returnTargetY >= entrance.mapData.tiles.length ||
      entrance.mapData.tiles[returnTargetY][entranceReturnBase[1]] !== FLOOR
    ) {
      returnTargetY = entranceReturnBase[0];
    }
    const ascentReturnPosition: [number, number] = [
      ascent.transitionToPrevious![0] + offset,
      ascent.transitionToPrevious![1],
    ];
    if (
      ascentReturnPosition[0] > 0 &&
      ascentReturnPosition[0] < ascent.mapData.tiles.length &&
      ascent.mapData.tiles[ascentReturnPosition[0]][ascentReturnPosition[1]] ===
        FLOOR
    ) {
      pushTransition(ascent.id, entrance.id, ascentReturnPosition, [
        returnTargetY,
        entranceReturnBase[1],
      ]);
    }
  }

  // Torch Town <-> The Wilds seam transitions (five adjacent tiles)
  // Map left edge of Wilds rows 19..23 to Torch Town east gate rows 10..14 at col 34
  for (let i = 0; i < 5; i++) {
    const wildY = 19 + i;
    const torchY = 10 + i;
    const wildFrom: [number, number] = [wildY, 0];
    const torchFrom: [number, number] = [torchY, 34];
    // Wilds -> Torch Town
    pushTransition(
      wildsEntrance.id,
      torchTown.id,
      wildFrom,
      [torchY, 33]
    );
    // Torch Town -> Wilds (land just inside at [y,1])
    pushTransition(
      torchTown.id,
      wildsEntrance.id,
      torchFrom,
      [wildY, 1]
    );
  }

  const storyRooms: StoryRoom[] = [
    entrance,
    ascent,
    sanctum,
    outdoor,
    bluffPassage,
    bluffCaves,
    bluffSerpentDen,
    outdoorHouse,
    torchTown,
    wildsEntrance,
    depthsRoom1,
    depthsRoom2,
    ...extraRooms,
  ];

  const roomSnapshots: GameState["rooms"] = {};
  for (const room of storyRooms) {
    roomSnapshots[room.id] = {
      mapData: withoutPlayer(room.mapData),
      entryPoint: room.entryPoint,
      enemies: serializeEnemies(room.enemies),
      npcs: serializeNPCs(room.npcs),
      potOverrides: room.potOverrides,
      metadata: room.metadata
        ? (JSON.parse(JSON.stringify(room.metadata)) as Record<string, unknown>)
        : undefined,
    };
  }

  // Determine initial NPCs for the starting room based on initial conditions
  const initialFlags = createInitialStoryFlags();
  const startingTimeOfDay = "day"; // Game starts at day
  const initialNpcsPlain = determineRoomNpcs(
    entrance.id,
    serializeNPCs(entrance.npcs),
    entrance.metadata?.conditionalNpcs as Record<string, { showWhen?: StoryCondition[]; removeWhen?: StoryCondition[] }> | undefined,
    roomSnapshots,
    initialFlags,
    startingTimeOfDay
  );

  const startingMap = addPlayer(entrance.mapData, entrance.entryPoint);
  const initialEnemies = cloneEnemies(entrance.enemies);
  const initialNpcs = rehydrateNPCs(initialNpcsPlain);
  const initialPotOverrides = entrance.potOverrides
    ? { ...entrance.potOverrides }
    : undefined;

  const gameState: GameState = {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mode: "story",
    allowCheckpoints: true,
    mapData: startingMap,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: initialEnemies,
    npcs: initialNpcs,
    heroHealth: 1,
    heroAttack: 1,
    heroTorchLit: false,
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
    recentDeaths: [],
    npcInteractionQueue: [],
    currentRoomId: entrance.id,
    rooms: roomSnapshots,
    roomTransitions: transitions,
    potOverrides: initialPotOverrides,
    storyFlags: createInitialStoryFlags(),
    diaryEntries: [],
  };

  return gameState;
}

const STORY_ROOM_LABELS: Partial<Record<RoomId, string>> = {
  "story-hall-entrance": "Entrance Hall",
  "story-ascent": "Ascent Corridor",
  "story-sanctum": "Sanctum",
  "story-outdoor-clearing": "Outdoor Clearing",
  "story-outdoor-house": "Caretaker's House",
  "story-torch-town": "Torch Town",
  "story-depths-despair-1": "Depths of Despair Room 1",
  "story-depths-despair-2": "Depths of Despair Room 2",
};

function findSubtypePositions(
  mapData: MapData,
  subtype: TileSubtype
): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  for (let y = 0; y < mapData.subtypes.length; y++) {
    const row = mapData.subtypes[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (Array.isArray(cell) && cell.includes(subtype)) {
        positions.push([y, x]);
      }
    }
  }
  return positions;
}

export interface StoryCheckpointOption {
  id: string;
  roomId: RoomId;
  position: [number, number];
  label: string;
  kind: "entry" | "checkpoint";
}

export function collectStoryCheckpointOptions(
  state: GameState
): StoryCheckpointOption[] {
  const options: StoryCheckpointOption[] = [];
  const seen = new Set<string>();
  const rooms = state.rooms ?? {};

  // Resolve a friendly room label using (1) snapshot metadata, (2) known labels map,
  // (3) generic fallbacks for generated homes, else raw room id.
  const labelForRoom = (roomId: RoomId): string => {
    const snapshot = rooms[roomId as keyof typeof rooms];
    const fromMeta = snapshot?.metadata?.displayLabel as string | undefined;
    if (fromMeta && typeof fromMeta === "string") return fromMeta;
    const known = STORY_ROOM_LABELS[roomId];
    if (known) return known;
    if (roomId.startsWith("story-torch-town-home-")) return "Torch Town — Home";
    return roomId;
  };

  const pushOption = (
    roomId: RoomId,
    position: [number, number],
    kind: "entry" | "checkpoint",
    index = 0
  ) => {
    const key = `${roomId}:${position[0]}:${position[1]}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    const baseLabel = labelForRoom(roomId);
    const suffix = kind === "checkpoint" && index > 0 ? ` ${index + 1}` : "";
    const label =
      kind === "entry"
        ? `${baseLabel} — Entry`
        : `${baseLabel} — Checkpoint${suffix}`;
    options.push({ id: key, roomId, position, label, kind });
  };

  for (const [roomIdRaw, snapshot] of Object.entries(rooms)) {
    const roomId = roomIdRaw as RoomId;
    if (snapshot.entryPoint) {
      pushOption(roomId, snapshot.entryPoint, "entry");
    }
    const checkpoints = findSubtypePositions(
      snapshot.mapData,
      TileSubtype.CHECKPOINT
    );
    checkpoints.forEach((pos, idx) =>
      pushOption(roomId, pos, "checkpoint", idx)
    );
  }

  // Ensure the current player position is represented even if not in rooms map yet
  const activeRoomId = state.currentRoomId;
  if (activeRoomId) {
    const playerPos = findPlayerPosition(state.mapData);
    if (playerPos) {
      pushOption(activeRoomId, playerPos, "entry");
    }
  }

  const order: Record<StoryCheckpointOption["kind"], number> = {
    checkpoint: 0,
    entry: 1,
  };

  return options.sort((a, b) => {
    const kindDelta = order[a.kind] - order[b.kind];
    if (kindDelta !== 0) return kindDelta;
    if (a.roomId === b.roomId) {
      return a.label.localeCompare(b.label);
    }
    return a.roomId.localeCompare(b.roomId);
  });
}

export interface StoryResetConfig {
  targetRoomId: RoomId;
  targetPosition: [number, number];
  heroHealth: number;
  heroTorchLit: boolean;
  hasSword: boolean;
  hasShield: boolean;
  hasKey: boolean;
  hasExitKey: boolean;
  rockCount: number;
  runeCount: number;
  foodCount: number;
  potionCount: number;
  timeOfDay?: "day" | "dusk" | "night" | "dawn";
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function applyStoryResetConfig(
  state: GameState,
  config: StoryResetConfig
): void {
  const rooms = state.rooms ?? {};
  const { targetRoomId, targetPosition } = config;
  const targetSnapshot = rooms[targetRoomId];
  if (!targetSnapshot) {
    throw new Error(`Unknown story room: ${targetRoomId}`);
  }

  const [ty, tx] = targetPosition;
  if (!isWithinBounds(targetSnapshot.mapData, ty, tx)) {
    throw new Error(`Invalid checkpoint position for ${targetRoomId}`);
  }
  if (targetSnapshot.mapData.tiles[ty]?.[tx] !== FLOOR) {
    throw new Error(`Target position for ${targetRoomId} is not walkable`);
  }

  const activeRoomId = state.currentRoomId ?? targetRoomId;
  const activeSnapshot = rooms[activeRoomId];
  if (activeSnapshot) {
    rooms[activeRoomId] = {
      ...activeSnapshot,
      mapData: withoutPlayer(state.mapData),
      enemies: serializeEnemies(state.enemies),
      npcs: serializeNPCs(state.npcs),
      potOverrides: state.potOverrides ? { ...state.potOverrides } : undefined,
    };
  }

  state.mapData = addPlayer(targetSnapshot.mapData, targetPosition);
  state.currentRoomId = targetRoomId;
  state.enemies = targetSnapshot.enemies
    ? rehydrateEnemies(targetSnapshot.enemies)
    : undefined;
  state.npcs = targetSnapshot.npcs
    ? rehydrateNPCs(targetSnapshot.npcs)
    : undefined;
  state.potOverrides = targetSnapshot.potOverrides
    ? { ...targetSnapshot.potOverrides }
    : undefined;

  state.heroHealth = clamp(Math.floor(config.heroHealth), 1, 6);
  state.heroTorchLit = config.heroTorchLit;
  state.hasSword = config.hasSword;
  state.hasShield = config.hasShield;
  state.hasKey = config.hasKey;
  state.hasExitKey = config.hasExitKey;
  state.rockCount = clamp(Math.floor(config.rockCount), 0, 99);
  state.runeCount = clamp(Math.floor(config.runeCount), 0, 99);
  state.foodCount = clamp(Math.floor(config.foodCount), 0, 99);
  state.potionCount = clamp(Math.floor(config.potionCount), 0, 99);

  // Set time of day if specified
  if (config.timeOfDay) {
    state.timeOfDay = createTimeOfDayAtPhase(config.timeOfDay);
  }

  state.stats = {
    ...state.stats,
    steps: 0,
  };
  state.recentDeaths = [];
  state.npcInteractionQueue = [];
  state.deathCause = undefined;
  state.conditions = undefined;
  state.storyFlags = createInitialStoryFlags();
  state.diaryEntries = [];

  // Reload the current room's NPCs based on reset conditions
  if (state.currentRoomId && state.rooms) {
    const currentRoom = state.rooms[state.currentRoomId];
    if (currentRoom) {
      const npcs = determineRoomNpcs(
        state.currentRoomId,
        currentRoom.npcs,
        currentRoom.metadata?.conditionalNpcs as Record<string, { showWhen?: StoryCondition[]; removeWhen?: StoryCondition[] }> | undefined,
        state.rooms,
        state.storyFlags,
        state.timeOfDay?.phase ?? config.timeOfDay ?? "day"
      );
      state.npcs = rehydrateNPCs(npcs);
    }
  }
}

export function buildStoryStateFromConfig(config: StoryResetConfig): GameState {
  const state = buildStoryModeState();
  applyStoryResetConfig(state, config);
  state.lastCheckpoint = createCheckpointSnapshot(state);
  return state;
}

/**
 * Update NPCs in the current room based on current story flags and time of day.
 * Call this when story flags change or time advances.
 * This reloads the current room's NPCs dynamically based on conditions.
 */
export function updateConditionalNpcs(state: GameState): void {
  if (!state.storyFlags || !state.rooms || !state.currentRoomId) return;
  
  const currentRoom = state.rooms[state.currentRoomId];
  if (!currentRoom) return;
  
  // Determine which NPCs should be in the current room right now
  const npcs = determineRoomNpcs(
    state.currentRoomId,
    currentRoom.npcs,
    currentRoom.metadata?.conditionalNpcs as Record<string, { showWhen?: StoryCondition[]; removeWhen?: StoryCondition[] }> | undefined,
    state.rooms,
    state.storyFlags,
    state.timeOfDay?.phase
  );
  
  // Update the active NPCs immediately
  state.npcs = rehydrateNPCs(npcs);
  console.log(`[updateConditionalNpcs] Reloaded ${state.currentRoomId} NPCs: ${state.npcs.map(n => n.id).join(', ')}`);
}

