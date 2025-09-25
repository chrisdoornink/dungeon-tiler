import {
  listNpcDialogueRules,
  resolveNpcDialogueScript,
} from "../../../lib/story/npc_script_registry";
import { createInitialStoryFlags } from "../../../lib/story/event_registry";

describe("npc script registry", () => {
  it("lists registered NPC dialogue rules", () => {
    const rules = listNpcDialogueRules();
    expect(rules.some((rule) => rule.npcId === "npc-elder-rowan")).toBe(true);
  });

  it("resolves scripts based on story flags", () => {
    const flags = createInitialStoryFlags();
    // Intro should be selected before meeting the elder
    expect(resolveNpcDialogueScript("npc-elder-rowan", flags)).toBe(
      "elder-rowan-intro"
    );
    flags["met-elder-rowan"] = true;
    expect(resolveNpcDialogueScript("npc-elder-rowan", flags)).toBe(
      "elder-rowan-awaiting-warning"
    );
    flags["heard-missing-boy"] = true;
    expect(resolveNpcDialogueScript("npc-elder-rowan", flags)).toBe(
      "elder-rowan-missing-boy"
    );
    flags["elder-rowan-acknowledged-warning"] = true;
    // With current precedence, missing-boy reaction still takes priority
    expect(resolveNpcDialogueScript("npc-elder-rowan", flags)).toBe(
      "elder-rowan-missing-boy"
    );
  });
});
