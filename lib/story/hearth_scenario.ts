/**
 * Hearth & Home — the intro scenario (Chris's script):
 *
 *   Whoever comes home, we discover chests in our rooms. Then Opal leads us
 *   to keys hidden in a bookshelf. We find swords, and while we're wondering
 *   why, goblins bust into our house — and the adventure begins.
 *
 * Runs once per world tick (from updateNPCBehaviors) and no-ops outside party
 * scenes. Progress lives in GameState.scenarioFlags:
 *   hearthKeysFound   — the bookshelf gave up the chest keys
 *   hearthBreached    — the goblins burst through the front door
 *   hearthDefended    — every goblin is down; the house is safe
 *
 * Type-only game-state import: game-state itself calls into this module, so
 * a runtime import back at it would be a cycle.
 */

import { FLOOR, TileSubtype } from "../map/constants";
import { Enemy } from "../enemy";
import type { GameState } from "../map/game-state";

/** Where Opal waits: beside the living-room bookshelf. */
const OPAL_LEAD_TARGET = { y: 14, x: 1 };

/** The front door tile that the goblins burst through. */
const FRONT_DOOR: [number, number] = [16, 4];

/** Doorway-adjacent tiles the break-in wave tries to spawn on, in order. */
const BREACH_SPOTS: Array<[number, number]> = [
  [16, 4],
  [15, 4],
  [15, 3],
  [15, 5],
  [14, 4],
  [14, 3],
  [14, 5],
];

const BREACH_WAVE_SIZE = 4;

export function runHearthScenario(
  state: GameState,
  playerPos: [number, number]
): void {
  if (!state.party) return;
  const flags = (state.scenarioFlags ??= {});

  // Beat 2: the bookshelf hides the chest keys. The bump is intercepted here
  // before the library UI (which consumes this queue in other modes) sees it.
  // Story mode's master key is deliberately non-consuming, so one find opens
  // every bedroom chest.
  if ((state.bookshelfInteractionQueue?.length ?? 0) > 0) {
    state.bookshelfInteractionQueue = [];
    if (!flags.hearthKeysFound) {
      flags.hearthKeysFound = true;
      state.hasKey = true;
    }
  }

  // Opal leads the way to the bookshelf until the keys are found, then falls
  // back in line with everyone else.
  const opal = (state.npcs ?? []).find(
    (npc) => npc.metadata?.partyId === "opal"
  );
  if (opal) {
    if (!flags.hearthKeysFound) {
      if (opal.metadata?.behavior !== "goto") {
        opal.metadata = {
          ...opal.metadata,
          behavior: "goto",
          gotoTarget: OPAL_LEAD_TARGET,
        };
      }
    } else if (opal.metadata?.behavior === "goto") {
      opal.metadata = { ...opal.metadata, behavior: "follow" };
    }
  }

  // Beat 4: the first sword out of a chest springs the ambush.
  if (!flags.hearthBreached) {
    const armed =
      !!state.hasSword || (state.party ?? []).some((p) => p.hasSword);
    if (armed) {
      flags.hearthBreached = true;
      breach(state, playerPos);
    }
    return;
  }

  // Beat 5: the house is defended.
  if (!flags.hearthDefended && (state.enemies?.length ?? 0) === 0) {
    flags.hearthDefended = true;
  }
}

/** The front door bursts open and a goblin wave pours into the living room. */
function breach(state: GameState, playerPos: [number, number]): void {
  const [dy, dx] = FRONT_DOOR;
  state.mapData.tiles[dy][dx] = FLOOR;
  state.mapData.subtypes[dy][dx] = [];

  const [py, px] = playerPos;
  const taken = (y: number, x: number) =>
    (y === py && x === px) ||
    (state.npcs ?? []).some((npc) => npc.y === y && npc.x === x) ||
    (state.enemies ?? []).some((e) => e.y === y && e.x === x);

  let spawned = 0;
  for (const [y, x] of BREACH_SPOTS) {
    if (spawned >= BREACH_WAVE_SIZE) break;
    if (state.mapData.tiles[y]?.[x] !== FLOOR) continue;
    if (state.mapData.subtypes[y]?.[x]?.includes(TileSubtype.PLAYER)) continue;
    if (taken(y, x)) continue;
    const goblin = new Enemy({ y, x });
    goblin.kind = "fire-goblin";
    state.enemies = [...(state.enemies ?? []), goblin];
    spawned += 1;
  }
}
