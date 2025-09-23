import { getDialogueScript, listDialogueScripts } from "../../lib/story/dialogue_registry";

describe("dialogue registry", () => {
  it("returns a script by id", () => {
    const script = getDialogueScript("elder-rowan-intro");
    expect(script).toBeTruthy();
    expect(script?.lines).toHaveLength(3);
    expect(script?.lines[0].speaker).toBe("Elder Rowan");
  });

  it("lists all registered scripts", () => {
    const all = listDialogueScripts();
    const ids = all.map((entry) => entry.id);
    expect(ids).toContain("elder-rowan-intro");
    expect(ids).toContain("caretaker-lysa-overview");
  });

  it("returns undefined for missing ids", () => {
    expect(getDialogueScript("missing-id" as string)).toBeUndefined();
  });
});
