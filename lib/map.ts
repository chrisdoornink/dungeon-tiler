export {
  tileTypes,
  type TileType,
  FLOOR,
  WALL,
  DEFAULT_ROOM_ID,
  type RoomId,
  dx,
  dy,
  GRID_SIZE,
  MIN_ROOM_SIZE,
  MAX_ROOM_SIZE,
  TileSubtype,
  Direction,
} from "./map/constants";

export type { MapData, RoomSnapshot, RoomTransition } from "./map/types";

export {
  type Room,
  getLastRooms,
  generateMap,
  areAllFloorsConnected,
  countRooms,
} from "./map/map-generation";

export {
  generateMapWithSubtypes,
  generateMapWithExit,
  generateMapWithKeyAndLock,
  addLightswitchToMap,
  addRunePotsForStoneExciters,
  addFaultyFloorsToMap,
  addRocksToMap,
  addPotsToMap,
  addSingleKeyToMap,
  addExitKeyToMap,
  addChestsToMap,
  generateCompleteMap,
  addWallTorchesToMap,
  findStrategicDoorWall,
} from "./map/map-features";

export { addPlayerToMap, findPlayerPosition } from "./map/player";

export { addSnakesPerRules, addSnakePots } from "./map/enemy-features";

export {
  cloneMapData,
  clonePlainEnemies,
  clonePotOverrides,
  serializeEnemies,
  serializeNPCs,
  clonePlainNPCs,
  getMapHeight,
  getMapWidth,
  isWithinBounds,
  computeMapId,
} from "./map/utils";

export {
  performUseFood,
  performUsePotion,
  performThrowRock,
  performThrowRune,
  createCheckpointSnapshot,
  reviveFromLastCheckpoint,
  initializeGameState,
  initializeGameStateFromMap,
  movePlayer,
} from "./map/game-state";

export type { GameState, CheckpointSnapshot } from "./map/game-state";

export {
  DAY_PHASES,
  DAY_PHASE_CONFIG,
  DAY_CYCLE_TOTAL_STEPS,
  advanceTimeOfDay,
  createInitialTimeOfDay,
  createTimeOfDayAtPhase,
} from "./time_of_day";
export type { DayPhaseId, TimeOfDayState } from "./time_of_day";
