import {
  applyStoryEffects,
  applyStoryEffectsWithDiary,
  areStoryConditionsMet,
  createInitialStoryFlags,
  listStoryEvents,
} from "../../../lib/story/event_registry";
import type { HeroDiaryEntry } from "../../../lib/story/hero_diary";

describe("story event registry", () => {
  it("creates initial flags for each event", () => {
    const flags = createInitialStoryFlags();
    const events = listStoryEvents();
    for (const event of events) {
      expect(flags).toHaveProperty(event.id, event.defaultValue ?? false);
    }
  });

  it("evaluates story conditions against flags", () => {
    const flags = createInitialStoryFlags();
    flags["met-elder-rowan"] = true;
    expect(
      areStoryConditionsMet(flags, [
        { eventId: "met-elder-rowan", value: true },
      ])
    ).toBe(true);
    expect(
      areStoryConditionsMet(flags, [
        { eventId: "met-elder-rowan", value: false },
      ])
    ).toBe(false);
  });

  it("applies story effects and returns updated flags", () => {
    const flags = createInitialStoryFlags();
    const next = applyStoryEffects(flags, [
      { eventId: "heard-missing-boy", value: true },
    ]);
    expect(next?.["heard-missing-boy"]).toBe(true);
  });

  it("updates hero diary entries when events resolve", () => {
    const flags = createInitialStoryFlags();
    const initialDiary: HeroDiaryEntry[] = [];
    const first = applyStoryEffectsWithDiary(flags, initialDiary, [
      { eventId: "heard-missing-boy", value: true },
    ]);

    expect(first.flags?.["heard-missing-boy"]).toBe(true);
    expect(first.diaryEntries).toHaveLength(1);
    const firstEntry = first.diaryEntries?.[0];
    expect(firstEntry?.id).toBe("heard-missing-boy");
    expect(firstEntry?.completed).toBeUndefined();

    const second = applyStoryEffectsWithDiary(
      first.flags,
      first.diaryEntries,
      [{ eventId: "elder-rowan-acknowledged-warning", value: true }]
    );

    const warningEntry = second.diaryEntries?.find(
      (entry) => entry.id === "heard-missing-boy"
    );
    expect(warningEntry?.completed).toBe(true);

    const ringEntry = second.diaryEntries?.find(
      (entry) => entry.id === "elder-rowan-acknowledged-warning"
    );
    expect(ringEntry).toBeDefined();
  });
});
