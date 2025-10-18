import {
  areStoryConditionsMet,
  type StoryCondition,
  type StoryFlags,
} from "./event_registry";

export interface NPCDialogueRule {
  npcId: string;
  scriptId: string;
  priority?: number;
  conditions?: StoryCondition[];
}

const NPC_DIALOGUE_RULES: NPCDialogueRule[] = [
  // Missing boy reactions take precedence where applicable
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-missing-boy",
    priority: 60,
    conditions: [{ eventId: "heard-missing-boy", value: true }],
  },
  // Elder Rowan
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-default",
    priority: 0,
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-intro",
    priority: 30,
    conditions: [{ eventId: "met-elder-rowan", value: false }],
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-awaiting-warning",
    priority: 35,
    conditions: [
      { eventId: "met-elder-rowan", value: true },
      { eventId: "heard-missing-boy", value: false },
    ],
  },

  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-warning-response",
    priority: 40,
    conditions: [
      { eventId: "met-elder-rowan", value: true },
      { eventId: "heard-missing-boy", value: true },
      { eventId: "elder-rowan-acknowledged-warning", value: false },
    ],
  },

  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-post-warning",
    priority: 20,
    conditions: [{ eventId: "elder-rowan-acknowledged-warning", value: true }],
  },

  // Caretaker Lysa
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-default",
    priority: 0,
  },
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-reminder",
    priority: 5,
    conditions: [
      { eventId: "met-caretaker-lysa", value: true },
      { eventId: "heard-missing-boy", value: true },
    ],
  },
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-intro",
    priority: 10,
    conditions: [{ eventId: "met-caretaker-lysa", value: false }],
  },

  // Librarian
  {
    npcId: "npc-librarian",
    scriptId: "librarian-missing-boy",
    priority: 15,
    conditions: [{ eventId: "heard-missing-boy", value: true }],
  },
  {
    npcId: "npc-librarian",
    scriptId: "librarian-default",
    priority: 0,
  },

  // Kalen (sanctum boy) - at sanctum after entering cave (highest priority)
  {
    npcId: "npc-sanctum-boy",
    scriptId: "kalen-sanctum-default",
    priority: 30,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  // Kalen at bluff - grateful after rescue but before entering cave
  {
    npcId: "npc-sanctum-boy",
    scriptId: "kalen-thanks-cave",
    priority: 20,
    conditions: [
      { eventId: "rescued-kalen", value: true },
      { eventId: "entered-bluff-cave", value: false }
    ],
  },
  // Kalen at bluff - distressed before rescue (default when not rescued)
  {
    npcId: "npc-sanctum-boy",
    scriptId: "kalen-distressed",
    priority: 10,
    conditions: [{ eventId: "rescued-kalen", value: false }],
  },

  // Torch Town NPCs - Cave Awareness (priority 25)
  {
    npcId: "npc-eldra",
    scriptId: "eldra-cave-hint",
    priority: 25,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  {
    npcId: "npc-captain-bren",
    scriptId: "captain-bren-cave-hint",
    priority: 25,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  {
    npcId: "npc-dara",
    scriptId: "dara-cave-hint",
    priority: 25,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },
  {
    npcId: "npc-lio",
    scriptId: "lio-cave-hint",
    priority: 25,
    conditions: [{ eventId: "entered-bluff-cave", value: true }],
  },

  // Torch Town NPCs - Kalen Rescue Awareness (priority 20)
  {
    npcId: "npc-maro",
    scriptId: "maro-kalen-rescue",
    priority: 20,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-yanna",
    scriptId: "yanna-kalen-rescue",
    priority: 20,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-serin",
    scriptId: "serin-kalen-rescue",
    priority: 20,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-mira",
    scriptId: "mira-kalen-rescue",
    priority: 20,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-kira",
    scriptId: "kira-kalen-rescue",
    priority: 20,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-fenna",
    scriptId: "fenna-kalen-rescue",
    priority: 20,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },
  {
    npcId: "npc-rhett",
    scriptId: "rhett-kalen-rescue",
    priority: 20,
    conditions: [{ eventId: "kalen-rescued-at-bluff", value: true }],
  },

  // Torch Town NPCs - Defaults (priority 0)
  { npcId: "npc-eldra", scriptId: "eldra-default", priority: 0 },
  { npcId: "npc-maro", scriptId: "maro-default", priority: 0 },
  { npcId: "npc-captain-bren", scriptId: "captain-bren-default", priority: 0 },
  { npcId: "npc-captain-bren-inside", scriptId: "captain-bren-default", priority: 0 },
  { npcId: "npc-jorin", scriptId: "jorin-default", priority: 0 },
  { npcId: "npc-yanna", scriptId: "yanna-default", priority: 0 },
  { npcId: "npc-serin", scriptId: "serin-default", priority: 0 },
  { npcId: "npc-rhett", scriptId: "rhett-default", priority: 0 },
  { npcId: "npc-mira", scriptId: "mira-default", priority: 0 },
  { npcId: "npc-kira", scriptId: "kira-default", priority: 0 },
  { npcId: "npc-lio", scriptId: "lio-default", priority: 0 },
  { npcId: "npc-dara", scriptId: "dara-default", priority: 0 },
  { npcId: "npc-sela", scriptId: "sela-default", priority: 0 },
  { npcId: "npc-sela-day", scriptId: "sela-default", priority: 0 },
  { npcId: "npc-sela-night", scriptId: "sela-default", priority: 0 },
  { npcId: "npc-thane", scriptId: "thane-default", priority: 0 },
  { npcId: "npc-thane-day", scriptId: "thane-default", priority: 0 },
  { npcId: "npc-thane-night", scriptId: "thane-default", priority: 0 },
  { npcId: "npc-fenna", scriptId: "fenna-default", priority: 0 },
  { npcId: "npc-arin", scriptId: "arin-default", priority: 0 },
  { npcId: "npc-haro", scriptId: "haro-default", priority: 0 },
  { npcId: "npc-len", scriptId: "len-default", priority: 0 },
  { npcId: "npc-tavi", scriptId: "tavi-default", priority: 0 },
];

export function listNpcDialogueRules(): NPCDialogueRule[] {
  return [...NPC_DIALOGUE_RULES];
}

export function resolveNpcDialogueScript(
  npcId: string,
  flags: StoryFlags | undefined
): string | undefined {
  const candidates = NPC_DIALOGUE_RULES.filter((rule) => rule.npcId === npcId);
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
  for (const rule of sorted) {
    if (areStoryConditionsMet(flags, rule.conditions)) {
      return rule.scriptId;
    }
  }
  return undefined;
}
