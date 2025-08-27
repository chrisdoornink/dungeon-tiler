export type SavedMapEntry = {
  id: string; // computeMapId(mapData)
  rating: 1 | 2 | 3 | 4 | 5;
  savedAt: string; // ISO
  title?: string;
  notes?: string;
  // Full initial exact state so it's fully reproducible
  initialGameState: unknown;
};

const KEY = "savedMaps";

export function loadSavedMaps(): SavedMapEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SavedMapEntry[];
    return [];
  } catch {
    return [];
  }
}

function persist(list: SavedMapEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function upsertSavedMap(entry: SavedMapEntry) {
  const list = loadSavedMaps();
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  persist(list);
}

export function deleteSavedMap(id: string) {
  const list = loadSavedMaps().filter((e) => e.id !== id);
  persist(list);
}

export function getSavedMap(id: string): SavedMapEntry | undefined {
  const list = loadSavedMaps();
  return list.find((e) => e.id === id);
}
