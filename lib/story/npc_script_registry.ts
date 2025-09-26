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
