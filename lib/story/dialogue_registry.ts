export interface DialogueLine {
  speaker?: string;
  text: string;
}

export interface DialogueScript {
  id: string;
  lines: DialogueLine[];
}

const DIALOGUE_SCRIPTS: Record<string, DialogueScript> = {
  "elder-rowan-intro": {
    id: "elder-rowan-intro",
    lines: [
      {
        speaker: "Elder Rowan",
        text: "Ah, the torchlight finds you at last. The dungeon has been restless without a guardian.",
      },
      {
        speaker: "Hero",
        text: "Tell me what I need to know and I'll quiet its rage.",
      },
      {
        speaker: "Elder Rowan",
        text: "Trust the floor runes. Their glow marks safe footing when the shadows lie to you.",
      },
    ],
  },
  "caretaker-lysa-overview": {
    id: "caretaker-lysa-overview",
    lines: [
      {
        speaker: "Caretaker Lysa",
        text: "Breathe. The climb past the sanctum rattles even seasoned delvers.",
      },
      {
        speaker: "Hero",
        text: "If you've kept these halls standing, I can keep moving forward.",
      },
      {
        speaker: "Caretaker Lysa",
        text: "Then keep your step light and your blade kinder still. Every rescued spirit strengthens us both.",
      },
    ],
  },
};

export function getDialogueScript(id: string): DialogueScript | undefined {
  return DIALOGUE_SCRIPTS[id];
}

export function listDialogueScripts(): DialogueScript[] {
  return Object.values(DIALOGUE_SCRIPTS);
}
