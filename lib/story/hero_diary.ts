export interface HeroDiaryEntry {
  id: string;
  title: string;
  summary: string;
  unlockedAt: number;
  completed?: boolean;
  completedAt?: number;
}

export interface DiaryEntryDefinition {
  id: string;
  title: string;
  summary: string;
  unlockWhenValue?: boolean;
}

export interface DiaryUpdateDefinition {
  entryId: string;
  complete?: boolean;
  whenValue?: boolean;
}

function cloneEntries(entries: HeroDiaryEntry[] | undefined): HeroDiaryEntry[] {
  return entries ? entries.map((entry) => ({ ...entry })) : [];
}

function normalizeTitle(definition: DiaryEntryDefinition): string {
  return definition.title.trim();
}

function normalizeSummary(definition: DiaryEntryDefinition): string {
  return definition.summary.trim();
}

export function upsertDiaryEntry(
  entries: HeroDiaryEntry[] | undefined,
  definition: DiaryEntryDefinition,
  timestamp: number
): HeroDiaryEntry[] {
  const normalizedTitle = normalizeTitle(definition);
  const normalizedSummary = normalizeSummary(definition);
  const list = entries ?? [];
  const existingIndex = list.findIndex((entry) => entry.id === definition.id);
  if (existingIndex === -1) {
    const next = cloneEntries(list);
    next.push({
      id: definition.id,
      title: normalizedTitle,
      summary: normalizedSummary,
      unlockedAt: timestamp,
    });
    return next;
  }
  const existing = list[existingIndex];
  if (
    existing.title === normalizedTitle &&
    existing.summary === normalizedSummary
  ) {
    return list;
  }
  const next = cloneEntries(list);
  next[existingIndex] = {
    ...existing,
    title: normalizedTitle,
    summary: normalizedSummary,
  };
  return next;
}

export function setDiaryEntryCompletion(
  entries: HeroDiaryEntry[] | undefined,
  entryId: string,
  completed: boolean,
  timestamp: number
): HeroDiaryEntry[] {
  if (!entries || entries.length === 0) {
    return entries ?? [];
  }
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index === -1) {
    return entries;
  }
  const existing = entries[index];
  if (Boolean(existing.completed) === completed) {
    return entries;
  }
  const next = cloneEntries(entries);
  next[index] = {
    ...existing,
    completed,
    completedAt: completed ? timestamp : undefined,
  };
  return next;
}
