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
    flags["heard-lysa-warning"] = true;
    expect(resolveNpcDialogueScript("npc-elder-rowan", flags)).toBe(
      "elder-rowan-warning-response"
    );
    flags["elder-rowan-acknowledged-warning"] = true;
    expect(resolveNpcDialogueScript("npc-elder-rowan", flags)).toBe(
      "elder-rowan-post-warning"
    );
  });
});
