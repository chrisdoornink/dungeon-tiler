import { getDialogueScript, listDialogueScripts } from "../../lib/story/dialogue_registry";

describe("dialogue registry", () => {
  it("returns a script by id", () => {
    const script = getDialogueScript("elder-rowan-intro");
    expect(script).toBeTruthy();
    expect(script?.lines).toHaveLength(3);
    expect(script?.lines[0].speaker).toBe("Elder Rowan");
    expect(script?.onCompleteEffects).toEqual([
      { eventId: "met-elder-rowan", value: true },
    ]);
  });

  it("lists all registered scripts", () => {
    const all = listDialogueScripts();
    const ids = all.map((entry) => entry.id);
    expect(ids).toContain("elder-rowan-intro");
    expect(ids).toContain("caretaker-lysa-overview");
    expect(ids).toContain("caretaker-lysa-reminder");
  });

  it("exposes dialogue choices when available", () => {
    const script = getDialogueScript("caretaker-lysa-overview");
    expect(script).toBeTruthy();
    const finalLine = script?.lines[script.lines.length - 1];
    expect(finalLine?.options).toBeDefined();
    expect(finalLine?.options).toHaveLength(2);
    expect(finalLine?.options?.[0].prompt).toContain("Promise");
  });

  it("returns undefined for missing ids", () => {
    expect(getDialogueScript("missing-id" as string)).toBeUndefined();
  });
});
