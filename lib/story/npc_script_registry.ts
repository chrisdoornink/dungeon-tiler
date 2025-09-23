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
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-warning-response",
    priority: 40,
    conditions: [
      { eventId: "met-elder-rowan", value: true },
      { eventId: "heard-lysa-warning", value: true },
      { eventId: "elder-rowan-acknowledged-warning", value: false },
    ],
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-intro",
    priority: 30,
    conditions: [{ eventId: "met-elder-rowan", value: false }],
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-post-warning",
    priority: 20,
    conditions: [{ eventId: "elder-rowan-acknowledged-warning", value: true }],
  },
  {
    npcId: "npc-elder-rowan",
    scriptId: "elder-rowan-default",
    priority: 0,
  },
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-overview",
    priority: 20,
    conditions: [{ eventId: "heard-lysa-warning", value: false }],
  },
  {
    npcId: "npc-grounds-caretaker",
    scriptId: "caretaker-lysa-reminder",
    priority: 10,
    conditions: [{ eventId: "heard-lysa-warning", value: true }],
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
  const sorted = [...candidates].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const rule of sorted) {
    if (areStoryConditionsMet(flags, rule.conditions)) {
      return rule.scriptId;
    }
  }
  return undefined;
}
