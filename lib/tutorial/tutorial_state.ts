import {
  Direction,
  TileSubtype,
  type GameState,
  type MapData,
} from "../map";
import { createInitialStoryFlags } from "../story/event_registry";
import { createEmptyByKind } from "../enemies/registry";
import type { NPCInteractionEvent } from "../npc";
import { buildTutorialOpeningRoom } from "./rooms/opening_room";
import { makeTutorialDialogueEvent } from "./tutorial_dialogue";

/**
 * Build the initial GameState for the tutorial flow.
 *
 * Unlike `initializeGameStateFromMap`, this does NOT auto-spawn random enemies
 * or snake rules — the tutorial is fully scripted, so we only place what the
 * room file specifies.
 *
 * On load we queue two dialogue events back-to-back:
 *   1. "tutorial-welcome"        — Welcome to TorchBoy
 *   2. "tutorial-ghost-warning"  — ghosts can steal your light
 *
 * They play in sequence before the player has any control. After dismissing
 * both, the player sees the room and starts walking; the placed ghost will
 * approach via its existing AI and snuff the torch on adjacency. A wall torch
 * further down the corridor relights via the existing engine mechanic.
 *
 * Note: this is a rough-draft sequence using only existing infrastructure
 * (the dialogue queue + ghost AI + wall-torch relight). A future pass will
 * introduce a tutorial beat engine that can trigger dialogue ON specific
 * player actions (first step, first relight, etc.) rather than queuing
 * everything up-front.
 */
export function buildTutorialState(): GameState {
  const room = buildTutorialOpeningRoom();

  const mapData: MapData = {
    tiles: room.mapData.tiles.map((row) => row.slice()),
    subtypes: room.mapData.subtypes.map((row) =>
      row.map((cell) => cell.slice())
    ),
    environment: room.mapData.environment,
  };
  const [py, px] = room.entryPoint;
  if (!mapData.subtypes[py][px].includes(TileSubtype.PLAYER)) {
    mapData.subtypes[py][px] = [
      ...mapData.subtypes[py][px],
      TileSubtype.PLAYER,
    ];
  }

  const now = Date.now();
  // Only the welcome line plays on load. The ghost-spotted and ghost-snuffed
  // lines are fired by the tutorial director based on player proximity to the
  // ghost and the torch state (see lib/tutorial/tutorial_director.ts).
  const npcInteractionQueue: NPCInteractionEvent[] = [
    makeTutorialDialogueEvent("tutorial-welcome", now),
  ];

  return {
    hasKey: false,
    hasExitKey: false,
    hasSword: false,
    hasShield: false,
    mapData,
    showFullMap: false,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: (room.enemies ?? []).slice(),
    npcs: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    rockCount: 0,
    heroTorchLit: true,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      enemiesDefeated: 0,
      steps: 0,
      byKind: createEmptyByKind(),
    },
    recentDeaths: [],
    npcInteractionQueue,
    storyFlags: createInitialStoryFlags(),
    diaryEntries: [],
    mode: "tutorial",
    allowCheckpoints: false,
    tutorialBeats: {},
  };
}
