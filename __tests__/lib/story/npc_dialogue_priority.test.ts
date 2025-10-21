import { resolveNpcDialogueScript } from "../../../lib/story/npc_script_registry";
import type { StoryFlags } from "../../../lib/story/event_registry";

describe("NPC Dialogue Priority System", () => {
  describe("Cave Awareness Dialogues", () => {
    it("should show cave hint for Eldra when entered-bluff-cave is true", () => {
      const flags: StoryFlags = {
        "entered-bluff-cave": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-eldra", flags);
      expect(scriptId).toBe("eldra-cave-hint");
    });

    it("should show default for Eldra when entered-bluff-cave is false", () => {
      const flags: StoryFlags = {
        "entered-bluff-cave": false,
      };
      const scriptId = resolveNpcDialogueScript("npc-eldra", flags);
      expect(scriptId).toBe("eldra-default");
    });

    it("should show cave hint for Captain Bren when entered-bluff-cave is true", () => {
      const flags: StoryFlags = {
        "entered-bluff-cave": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-captain-bren", flags);
      expect(scriptId).toBe("captain-bren-cave-hint");
    });

    it("should show cave hint for Dara when entered-bluff-cave is true", () => {
      const flags: StoryFlags = {
        "entered-bluff-cave": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-dara", flags);
      expect(scriptId).toBe("dara-cave-hint");
    });

    it("should show cave hint for Lio when entered-bluff-cave is true", () => {
      const flags: StoryFlags = {
        "entered-bluff-cave": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-lio", flags);
      expect(scriptId).toBe("lio-cave-hint");
    });
  });

  describe("Kalen Rescue Awareness Dialogues", () => {
    it("should show rescue dialogue for Maro when kalen-rescued-at-bluff is true", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-maro", flags);
      expect(scriptId).toBe("maro-kalen-rescue");
    });

    it("should show default for Maro when kalen-rescued-at-bluff is false", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": false,
      };
      const scriptId = resolveNpcDialogueScript("npc-maro", flags);
      expect(scriptId).toBe("maro-default");
    });

    it("should show rescue dialogue for Yanna when kalen-rescued-at-bluff is true", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-yanna", flags);
      expect(scriptId).toBe("yanna-kalen-rescue");
    });

    it("should show rescue dialogue for Serin when kalen-rescued-at-bluff is true", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-serin", flags);
      expect(scriptId).toBe("serin-kalen-rescue");
    });

    it("should show rescue dialogue for Mira when kalen-rescued-at-bluff is true", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-mira", flags);
      expect(scriptId).toBe("mira-kalen-rescue");
    });

    it("should show rescue dialogue for Kira when kalen-rescued-at-bluff is true", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-kira", flags);
      expect(scriptId).toBe("kira-kalen-rescue");
    });

    it("should show goblin activity dialogue for Old Fenna when all conditions are met", () => {
      const flags: StoryFlags = {
        "met-old-fenna-torch-town": true,
        "kalen-rescued-at-bluff": true,
        "entered-bluff-cave": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-fenna", flags);
      expect(scriptId).toBe("fenna-goblin-activity");
    });

    it("should show default for Old Fenna when only kalen-rescued-at-bluff is true", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-fenna", flags);
      // Old Fenna doesn't have a kalen-rescue dialogue, only goblin-activity or default
      expect(scriptId).toBe("fenna-default");
    });

    it("should show rescue dialogue for Rhett when kalen-rescued-at-bluff is true", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-rhett", flags);
      expect(scriptId).toBe("rhett-kalen-rescue");
    });
  });

  describe("Priority Ordering", () => {
    it("should prioritize goblin activity (65) over cave hint (30) for Eldra", () => {
      const flags: StoryFlags = {
        "met-old-fenna-torch-town": true,
        "entered-bluff-cave": true,
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-eldra", flags);
      // Goblin activity has priority 65, cave hint has priority 30
      expect(scriptId).toBe("eldra-goblin-activity");
    });

    it("should prioritize cave hint (30) over rescue dialogue (25) for Eldra", () => {
      const flags: StoryFlags = {
        "entered-bluff-cave": true,
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-eldra", flags);
      // Cave hint has priority 30, rescue has priority 25
      expect(scriptId).toBe("eldra-cave-hint");
    });

    it("should prioritize rescue dialogue (25) over default (0) for Maro", () => {
      const flags: StoryFlags = {
        "kalen-rescued-at-bluff": true,
      };
      const scriptId = resolveNpcDialogueScript("npc-maro", flags);
      expect(scriptId).toBe("maro-kalen-rescue");
    });

    it("should fall back to default when no conditions are met", () => {
      const flags: StoryFlags = {
        "entered-bluff-cave": false,
        "kalen-rescued-at-bluff": false,
      };
      
      expect(resolveNpcDialogueScript("npc-eldra", flags)).toBe("eldra-default");
      expect(resolveNpcDialogueScript("npc-maro", flags)).toBe("maro-default");
      expect(resolveNpcDialogueScript("npc-captain-bren", flags)).toBe("captain-bren-default");
    });
  });
});
