import type { NPCInteractionEvent } from "../npc";

/**
 * Synthetic speaker used for tutorial system dialogue events. The dialogue
 * resolver in TilemapGrid only needs a queue entry with `type: "dialogue"` and
 * a payload containing `dialogueId` — no real NPC has to exist on the map.
 */
const TUTORIAL_SPEAKER_ID = "tutorial-system";
const TUTORIAL_SPEAKER_NAME = "";

/**
 * Build an npcInteractionQueue entry that opens the given dialogue script.
 * `timestamp` controls ordering when multiple events are queued at once.
 */
export function makeTutorialDialogueEvent(
  dialogueId: string,
  timestamp: number
): NPCInteractionEvent {
  return {
    npcId: TUTORIAL_SPEAKER_ID,
    npcName: TUTORIAL_SPEAKER_NAME,
    type: "dialogue",
    hookId: `tutorial:${dialogueId}`,
    availableHooks: [
      {
        id: `tutorial:${dialogueId}`,
        type: "dialogue",
        description: dialogueId,
        payload: { dialogueId },
      },
    ],
    trigger: "script",
    timestamp,
  };
}
