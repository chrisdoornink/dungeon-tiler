import {
  type DiaryEntryDefinition,
  type DiaryUpdateDefinition,
  type HeroDiaryEntry,
  setDiaryEntryCompletion,
  upsertDiaryEntry,
} from "./hero_diary";

export interface StoryEventDefinition {
  id: string;
  description: string;
  defaultValue?: boolean;
  diaryEntry?: DiaryEntryDefinition;
  diaryUpdates?: DiaryUpdateDefinition[];
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
    diaryEntry: {
      id: "met-elder-rowan",
      title: "Elder Rowan's Guidance",
      summary:
        "Elder Rowan told me to trust the glowing floor runes—they reveal safe footing when shadows deceive.",
    },
  },
  "heard-lysa-warning": {
    id: "heard-lysa-warning",
    description: "Caretaker Lysa shared the sanctum warning.",
    defaultValue: false,
    diaryEntry: {
      id: "heard-lysa-warning",
      title: "Caretaker Lysa's Warning",
      summary:
        "Caretaker Lysa warned that the sanctum's wards are thin. Listen for the hum in the stones before climbing east.",
    },
  },
  "elder-rowan-acknowledged-warning": {
    id: "elder-rowan-acknowledged-warning",
    description:
      "Elder Rowan has acknowledged the warning relayed from Caretaker Lysa.",
    defaultValue: false,
    diaryEntry: {
      id: "elder-rowan-acknowledged-warning",
      title: "Rowan's Ring",
      summary:
        "Elder Rowan armed me with a ring to steady my footing when the sanctum howls. Hold ground and listen before leaping.",
    },
    diaryUpdates: [
      {
        entryId: "heard-lysa-warning",
        complete: true,
      },
    ],
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

export interface ApplyStoryEffectsResult {
  flags: StoryFlags | undefined;
  diaryEntries: HeroDiaryEntry[] | undefined;
  flagsChanged: boolean;
  diaryChanged: boolean;
}

export function applyStoryEffectsWithDiary(
  flags: StoryFlags | undefined,
  diaryEntries: HeroDiaryEntry[] | undefined,
  effects?: StoryEffect[],
  timestamp: number = Date.now()
): ApplyStoryEffectsResult {
  if (!effects || effects.length === 0) {
    return {
      flags,
      diaryEntries,
      flagsChanged: false,
      diaryChanged: false,
    };
  }

  const nextFlags = applyStoryEffects(flags, effects);
  const resolvedFlags = nextFlags ?? flags ?? {};
  let nextDiary = diaryEntries ?? [];
  let diaryChanged = false;

  for (const effect of effects) {
    const eventDefinition = getStoryEvent(effect.eventId);
    if (!eventDefinition) continue;
    const newValue = Boolean(resolvedFlags[effect.eventId]);

    if (eventDefinition.diaryEntry) {
      const unlockValue = eventDefinition.diaryEntry.unlockWhenValue ?? true;
      if (newValue === unlockValue) {
        const updated = upsertDiaryEntry(
          nextDiary,
          eventDefinition.diaryEntry,
          timestamp
        );
        if (updated !== nextDiary) {
          nextDiary = updated;
          diaryChanged = true;
        }
      }
    }

    if (eventDefinition.diaryUpdates) {
      for (const update of eventDefinition.diaryUpdates) {
        const targetValue = update.whenValue ?? true;
        if (newValue === targetValue) {
          const updated = setDiaryEntryCompletion(
            nextDiary,
            update.entryId,
            update.complete ?? true,
            timestamp
          );
          if (updated !== nextDiary) {
            nextDiary = updated;
            diaryChanged = true;
          }
        }
      }
    }
  }

  return {
    flags: nextFlags,
    diaryEntries: diaryChanged ? nextDiary : diaryEntries ?? nextDiary,
    flagsChanged: nextFlags !== flags,
    diaryChanged,
  };
}
