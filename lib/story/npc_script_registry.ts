import {
  areStoryConditionsMet,
  type StoryCondition,
  type StoryFlags,
} from "./event_registry";
import type { GameState } from "../map/game-state";

export interface NPCDialogueRule {
  npcId: string;
  scriptId: string;
  priority?: number;
  conditions?: StoryCondition[];
  /** Custom condition function for complex checks (e.g., item counts) */
  customCondition?: (gameState: GameState) => boolean;
}

const PRIORITIES = {
  CONDITIONALLY_HIGHEST: 1000,
  NPC_INTRO: 100,
  TOWN_GOBLIN_ACTIVITY_COMPLETED: 66, // story event TBD
  TOWN_GOBLIN_ACTIVITY_DETECTED: 65, // eventID: met-old-fenna-torch-town
  MISSING_BOY: 60, // eventID: heard-missing-boy
  SNAKE_RIDDLES_COMPLETED: 31, // eventID: snake-riddles-completed
  ENTERED_BLUFF_CAVE: 30, // eventID: entered-bluff-cave
  KALEN_RESCUED_AT_BLUFF: 25, // eventID: kalen-rescued-at-bluff
  DEFAULT: 0,
}

const NPC_DIALOGUE_RULES: NPCDialogueRule[] = [
  // Missing boy reactions take precedence where applicable
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-missing-boy",
    priority: PRIORITIES.MISSING_BOY,
    conditions: [
      { eventId: "heard-missing-boy", value: true },
      { eventId: "kalen-rescued-at-bluff", value: false },
    ],
  },
  // Elder Rowan
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-default",
    priority: PRIORITIES.DEFAULT,
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-intro",
    priority: PRIORITIES.CONDITIONALLY_HIGHEST,
    conditions: [{ eventId: "met-elder-rowan", value: false }],
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-awaiting-warning",
    priority: PRIORITIES.CONDITIONALLY_HIGHEST,
    conditions: [
      { eventId: "met-elder-rowan", value: true },
      { eventId: "heard-missing-boy", value: false },
    ],
  },

  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-warning-response",
    priority: PRIORITIES.NPC_INTRO,
    conditions: [
      { eventId: "met-elder-rowan", value: true },
      { eventId: "heard-missing-boy", value: true },
      { eventId: "elder-rowan-acknowledged-warning", value: false },
    ],
  },

  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-post-warning",
    priority: PRIORITIES.CONDITIONALLY_HIGHEST,
    conditions: [
      { eventId: "elder-rowan-acknowledged-warning", value: true },
      { eventId: "kalen-rescued-at-bluff", value: false },
    ],
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-kalen-rescued",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },

  // Caretaker Lysa
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-default",
    priority: PRIORITIES.DEFAULT,
  },
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-reminder",
    priority: PRIORITIES.CONDITIONALLY_HIGHEST,
    conditions: [
      { eventId: "met-caretaker-lysa", value: true },
      { eventId: "heard-missing-boy", value: true },
      { eventId: "kalen-rescued-at-bluff", value: false },
    ],
  },
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-intro",
    priority: PRIORITIES.NPC_INTRO,
    conditions: [{ eventId: "met-caretaker-lysa", value: false }],
  },
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-kalen-rescued",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },

  // Kalen (sanctum boy) - at sanctum after entering cave (highest priority)
  {
    npcId: "npc-sanctum-boy",
    scriptId: "kalen-sanctum-default",
    priority: PRIORITIES.ENTERED_BLUFF_CAVE,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  // Kalen at bluff - grateful after rescue but before entering cave
  {
    npcId: "npc-sanctum-boy",
    scriptId: "kalen-thanks-cave",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [
      { eventId: "rescued-kalen", value: true },
      { eventId: "entered-bluff-cave", value: false }
    ],
  },
  // Kalen at bluff - distressed before rescue (default when not rescued)
  {
    npcId: "npc-sanctum-boy",
    scriptId: "kalen-distressed",
    priority: PRIORITIES.MISSING_BOY,
    conditions: [{ eventId: "rescued-kalen", value: false }],
  },

  // Torch Town NPCs - Cave Awareness (priority 25)
  {
    npcId: "npc-eldra",
    scriptId: "eldra-cave-hint",
    priority: PRIORITIES.ENTERED_BLUFF_CAVE,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  {
    npcId: "npc-captain-bren",
    scriptId: "captain-bren-cave-hint",
    priority: PRIORITIES.ENTERED_BLUFF_CAVE,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  {
    npcId: "npc-dara",
    scriptId: "dara-cave-hint",
    priority: PRIORITIES.ENTERED_BLUFF_CAVE,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  {
    npcId: "npc-lio",
    scriptId: "lio-cave-hint",
    priority: PRIORITIES.ENTERED_BLUFF_CAVE,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },

  // Torch Town NPCs - Kalen Rescue Awareness (priority 15)
  {
    npcId: "npc-maro",
    scriptId: "maro-kalen-rescue",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-yanna",
    scriptId: "yanna-kalen-rescue",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-serin",
    scriptId: "serin-kalen-rescue",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-mira",
    scriptId: "mira-kalen-rescue",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-kira",
    scriptId: "kira-kalen-rescue",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-rhett",
    scriptId: "rhett-kalen-rescue",
    priority: PRIORITIES.KALEN_RESCUED_AT_BLUFF,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },

  // Ancient Serpent (Coiled Snake)
  {
    npcId: "npc-bluff-coiled-snake",
    scriptId: "snake-already-completed",
    priority: PRIORITIES.SNAKE_RIDDLES_COMPLETED,
    conditions: [{ eventId: "snake-riddles-completed", value: true }],
  },
  {
    npcId: "npc-bluff-coiled-snake",
    scriptId: "bluff-coiled-snake",
    priority: PRIORITIES.DEFAULT,
  },

  // Torch Town NPCs - Goblin Activity (priority 20, after meeting Old Fenna + Kalen rescue + cave found)
  {
    npcId: "npc-eldra",
    scriptId: "eldra-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-maro",
    scriptId: "maro-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-captain-bren",
    scriptId: "captain-bren-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-captain-bren-inside",
    scriptId: "captain-bren-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-jorin",
    scriptId: "jorin-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-yanna",
    scriptId: "yanna-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-serin",
    scriptId: "serin-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-rhett",
    scriptId: "rhett-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-mira",
    scriptId: "mira-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-kira",
    scriptId: "kira-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-lio",
    scriptId: "lio-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-dara",
    scriptId: "dara-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-sela",
    scriptId: "sela-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-sela-day",
    scriptId: "sela-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-sela-night",
    scriptId: "sela-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-thane",
    scriptId: "thane-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-thane-day",
    scriptId: "thane-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-thane-night",
    scriptId: "thane-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-fenna",
    scriptId: "fenna-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-arin",
    scriptId: "arin-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-haro",
    scriptId: "haro-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-len",
    scriptId: "len-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },
  {
    npcId: "npc-tavi",
    scriptId: "tavi-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [
      { eventId: "met-old-fenna-torch-town", value: true },
      { eventId: "kalen-rescued-at-bluff", value: true },
      { eventId: "entered-bluff-cave", value: true },
    ],
  },

  // Torch Town NPCs - Defaults (priority 0)
  { npcId: "npc-eldra", scriptId: "eldra-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-maro", scriptId: "maro-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-captain-bren", scriptId: "captain-bren-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-captain-bren-inside", scriptId: "captain-bren-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-jorin", scriptId: "jorin-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-yanna", scriptId: "yanna-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-serin", scriptId: "serin-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-rhett", scriptId: "rhett-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-mira", scriptId: "mira-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-kira", scriptId: "kira-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-lio", scriptId: "lio-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-dara", scriptId: "dara-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-sela", scriptId: "sela-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-sela-day", scriptId: "sela-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-sela-night", scriptId: "sela-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-thane", scriptId: "thane-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-thane-day", scriptId: "thane-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-thane-night", scriptId: "thane-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-fenna", scriptId: "fenna-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-arin", scriptId: "arin-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-haro", scriptId: "haro-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-len", scriptId: "len-default", priority: PRIORITIES.DEFAULT },
  { npcId: "npc-tavi", scriptId: "tavi-default", priority: PRIORITIES.DEFAULT },
  
  // Jorin (Smithy)
  {
    npcId: "npc-jorin",
    scriptId: "jorin-after-sword",
    priority: PRIORITIES.CONDITIONALLY_HIGHEST,
    conditions: [{ eventId: "smithy-forged-sword", value: true }],
  },
  {
    npcId: "npc-jorin",
    scriptId: "jorin-sword-offer",
    priority: PRIORITIES.CONDITIONALLY_HIGHEST - 1,
    conditions: [
      { eventId: "smithy-forged-sword", value: false },
    ],
    customCondition: (gameState: GameState) => (gameState.rockCount ?? 0) >= 20,
  },
  {
    npcId: "npc-jorin",
    scriptId: "jorin-goblin-activity",
    priority: PRIORITIES.TOWN_GOBLIN_ACTIVITY_DETECTED,
    conditions: [{ eventId: "met-old-fenna-torch-town", value: true }],
  },
  {
    npcId: "npc-jorin",
    scriptId: "jorin-default",
    priority: PRIORITIES.DEFAULT,
  },
];

export function listNpcDialogueRules(): NPCDialogueRule[] {
  return [...NPC_DIALOGUE_RULES];
}

export function resolveNpcDialogueScript(
  npcId: string,
  flags: StoryFlags | undefined,
  gameState?: GameState
): string | undefined {
  const candidates = NPC_DIALOGUE_RULES.filter((rule) => rule.npcId === npcId);
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
  for (const rule of sorted) {
    // Check story flag conditions
    if (!areStoryConditionsMet(flags, rule.conditions)) {
      continue;
    }
    // Check custom condition if present
    if (rule.customCondition && gameState) {
      if (!rule.customCondition(gameState)) {
        continue;
      }
    }
    return rule.scriptId;
  }
  return undefined;
}
