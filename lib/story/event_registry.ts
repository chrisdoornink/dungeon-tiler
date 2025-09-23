export interface StoryEventDefinition {
  id: string;
  description: string;
  defaultValue?: boolean;
}

export type StoryFlags = Record<string, boolean>;

export interface StoryCondition {
  eventId: string;
  value?: boolean;
}

export interface StoryEffect {
  eventId: string;
  value?: boolean;
}

const STORY_EVENTS: Record<string, StoryEventDefinition> = {
  "met-elder-rowan": {
    id: "met-elder-rowan",
    description: "The hero has met Elder Rowan for the first time.",
    defaultValue: false,
  },
  "heard-lysa-warning": {
    id: "heard-lysa-warning",
    description: "Caretaker Lysa shared the sanctum warning.",
    defaultValue: false,
  },
  "elder-rowan-acknowledged-warning": {
    id: "elder-rowan-acknowledged-warning",
    description:
      "Elder Rowan has acknowledged the warning relayed from Caretaker Lysa.",
    defaultValue: false,
  },
};

export function listStoryEvents(): StoryEventDefinition[] {
  return Object.values(STORY_EVENTS);
}

export function getStoryEvent(id: string): StoryEventDefinition | undefined {
  return STORY_EVENTS[id];
}

export function createInitialStoryFlags(): StoryFlags {
  const flags: StoryFlags = {};
  for (const event of Object.values(STORY_EVENTS)) {
    flags[event.id] = event.defaultValue ?? false;
  }
  return flags;
}

export function areStoryConditionsMet(
  flags: StoryFlags | undefined,
  conditions?: StoryCondition[]
): boolean {
  if (!conditions || conditions.length === 0) return true;
  const source = flags ?? {};
  return conditions.every((condition) => {
    const expected = condition.value ?? true;
    return Boolean(source[condition.eventId]) === expected;
  });
}

export function applyStoryEffects(
  flags: StoryFlags | undefined,
  effects?: StoryEffect[]
): StoryFlags | undefined {
  if (!effects || effects.length === 0) {
    return flags;
  }
  const next: StoryFlags = { ...(flags ?? {}) };
  let changed = false;
  for (const effect of effects) {
    const value = effect.value ?? true;
    if (next[effect.eventId] !== value) {
      next[effect.eventId] = value;
      changed = true;
    }
  }
  return changed ? next : flags ?? next;
}
