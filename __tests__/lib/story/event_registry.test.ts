import {
  applyStoryEffects,
  areStoryConditionsMet,
  createInitialStoryFlags,
  listStoryEvents,
} from "../../../lib/story/event_registry";

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
      { eventId: "heard-lysa-warning", value: true },
    ]);
    expect(next?.["heard-lysa-warning"]).toBe(true);
  });
});
