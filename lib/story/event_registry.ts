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
  eventId?: string;
  value?: boolean;
  timeOfDay?: "day" | "dusk" | "night" | "dawn";
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
        "Elder Rowan told me to talk to Caretaker Lysa about the sanctum's warning.",
    },
  },
  "met-caretaker-lysa": {
    id: "met-caretaker-lysa",
    description: "The hero has met Caretaker Lysa for the first time.",
    defaultValue: false,
    diaryEntry: {
      id: "met-caretaker-lysa",
      title: "Caretaker Lysa's Introduction",
      summary: "Caretaker Lysa is nice.",
    },
  },
  "heard-missing-boy": {
    id: "heard-missing-boy",
    description:
      "Caretaker Lysa reported her companion (the boy from the sanctum) went missing near the bluff northeast of the sanctum.",
    defaultValue: false,
    diaryEntry: {
      id: "heard-missing-boy",
      title: "Missing at the Bluff",
      summary:
        "Lysa senses a growing negative pulse from the bluff northeast of the sanctum. Her companion went to investigate and hasn't returned. I should find him.",
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
        entryId: "heard-missing-boy",
        complete: true,
      },
    ],
  },
  "rescued-kalen": {
    id: "rescued-kalen",
    description: "Kalen was rescued at the bluff and returned safely.",
    defaultValue: false,
    diaryEntry: {
      id: "rescued-kalen",
      title: "Kalen Rescued",
      summary: "I found Kalen near the bluff and drove off the goblin. He said he discovered a cave up there.",
    },
  },
  "kalen-rescued-at-bluff": {
    id: "kalen-rescued-at-bluff",
    description: "Kalen was rescued at the bluff and is still there.",
    defaultValue: false,
    // No diary entry - this is just for dialogue state tracking
  },
  "entered-bluff-cave": {
    id: "entered-bluff-cave",
    description: "Hero entered the bluff cave, Kalen moved to sanctum area.",
    defaultValue: false,
    // No diary entry - this is just for NPC positioning
  },
  "snake-riddles-completed": {
    id: "snake-riddles-completed",
    description: "Hero successfully answered all five riddles from the Ancient Serpent.",
    defaultValue: false,
    diaryEntry: {
      id: "snake-riddles-completed",
      title: "Wisdom of the Serpent",
      summary: "I answered the Ancient Serpent's riddles and earned a teleportation rune. The serpent tested my knowledge of silence, shadow, light, time, and echo.",
    },
  },
  "read-bluff-cave-secret": {
    id: "read-bluff-cave-secret",
    description: "Hero read the book about the secret of the bluff caves.",
    defaultValue: false,
    diaryEntry: {
      id: "read-bluff-cave-secret",
      title: "Secret of the Bluff Caves",
      summary: "This passage says the eastmost cave contains a secret, 'where silence dwells in stone and shadows linger in every corner. There I found one who remains still among us—a guardian of some kind. It spoke of riddles, testing whether I could see light in darkness, hear what speaks without sound, and grasp what moves yet cannot be held.\n\nI fled before answering, but the echo of its words haunts me. It guards something powerful, I'm certain—perhaps a means to traverse great distances. Time seems to stand still in that place. If you seek this treasure, bring patience. Silence is the first lesson, it said, and the echo of your thoughts the final test.",
    },
  },
  "met-old-fenna-torch-town": {
    id: "met-old-fenna-torch-town",
    description: "Hero met Old Fenna in Torch Town and learned about the growing danger from the eternal flame.",
    defaultValue: false,
    diaryEntry: {
      id: "met-old-fenna-torch-town",
      title: "Old Fenna's Warning",
      summary: "Old Fenna warned me of growing danger from the eternal flame. Something dark stirs beyond our eastern walls. The flame shows me shadows gathering, growing bolder. I should investigate beyond the walls.",
    },
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
  conditions?: StoryCondition[],
  currentTimeOfDay?: "day" | "dusk" | "night" | "dawn"
): boolean {
  if (!conditions || conditions.length === 0) return true;
  const source = flags ?? {};
  return conditions.every((condition) => {
    // Check time of day condition
    if (condition.timeOfDay !== undefined) {
      return currentTimeOfDay === condition.timeOfDay;
    }
    // Check event flag condition
    if (condition.eventId !== undefined) {
      const expected = condition.value ?? true;
      return Boolean(source[condition.eventId]) === expected;
    }
    return true;
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
