import type { GameState } from "../map";
import type { PlainNPC } from "../npc";
import { areStoryConditionsMet, type StoryCondition, type StoryFlags } from "./event_registry";

/**
 * Determine which NPCs should be in a room based on current game conditions.
 * This is called when entering a room or when conditions change.
 * 
 * @param roomId - The room ID being evaluated
 * @param baseNpcs - The base NPC list from the room definition
 * @param conditionalNpcs - The conditional NPC rules from room metadata
 * @param allRoomSnapshots - All room snapshots to search for NPCs
 * @param flags - Current story flags
 * @param currentTimeOfDay - Current time of day phase
 * @returns The final NPC list for this room
 */
export function determineRoomNpcs(
  roomId: string,
  baseNpcs: PlainNPC[] | undefined,
  conditionalNpcs: Record<string, { showWhen?: StoryCondition[]; removeWhen?: StoryCondition[] }> | undefined,
  allRoomSnapshots: GameState["rooms"],
  flags: StoryFlags,
  currentTimeOfDay?: "day" | "dusk" | "night" | "dawn"
): PlainNPC[] {
  if (!conditionalNpcs || typeof conditionalNpcs !== "object") {
    return baseNpcs || [];
  }

  const finalNpcs: PlainNPC[] = [];
  const processedNpcIds = new Set<string>();

  // Process each conditional NPC rule
  for (const [npcId, config] of Object.entries(conditionalNpcs)) {
    const npcConfig = config as { showWhen?: StoryCondition[]; removeWhen?: StoryCondition[] };
    const showWhen = npcConfig?.showWhen as StoryCondition[] | undefined;
    const removeWhen = npcConfig?.removeWhen as StoryCondition[] | undefined;

    // Determine if NPC should be in this room
    let shouldBeHere = true;
    
    if (showWhen && showWhen.length > 0) {
      shouldBeHere = areStoryConditionsMet(flags, showWhen, currentTimeOfDay);
    }
    if (removeWhen && areStoryConditionsMet(flags, removeWhen, currentTimeOfDay)) {
      shouldBeHere = false;
    }

    if (shouldBeHere) {
      // Find the NPC - first in base NPCs, then search all rooms
      let foundNpc = baseNpcs?.find((npc) => npc.id === npcId);
      
      if (!foundNpc && allRoomSnapshots) {
        for (const snapshot of Object.values(allRoomSnapshots)) {
          foundNpc = snapshot.npcs?.find((npc) => npc.id === npcId);
          if (foundNpc) break;
        }
      }
      
      if (foundNpc) {
        finalNpcs.push(foundNpc);
        processedNpcIds.add(npcId);
      }
    }
  }

  // Add any base NPCs that aren't conditional (not processed)
  if (baseNpcs) {
    for (const npc of baseNpcs) {
      if (!processedNpcIds.has(npc.id) && !(conditionalNpcs as Record<string, unknown>)[npc.id]) {
        finalNpcs.push(npc);
      }
    }
  }

  console.log(`[determineRoomNpcs] ${roomId} at ${currentTimeOfDay}: ${finalNpcs.map(n => n.id).join(', ') || 'none'}`);
  return finalNpcs;
}
